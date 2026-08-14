import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember } from "../middleware/profile.js";
import { encryptSecret } from "../lib/crypto.js";
import { startGstRun, submitOtp } from "../lib/runStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { canAccessWorkflow } from "../lib/clientAccess.js";
import {
  parseGstr2bWorkbook,
  parseInvoiceExcel,
  reconcile,
  buildReconciliationExcelBuffer,
} from "../lib/gstReconciliation.js";

export const gstRouter = Router({ mergeParams: true });

gstRouter.use(requireAuth, requireCompanyMember);

function clientRef(orgId, clientId) {
  return db.collection("organizations").doc(orgId).collection("clients").doc(clientId);
}

/** Confirms the client belongs to this org, has GST enrolled, and is assigned to this user; sends the appropriate error and returns null otherwise. */
async function loadGstClient(req, res) {
  const snap = await clientRef(req.orgId, req.params.clientId).get();
  if (!snap.exists || !(snap.data().enrolledWorkflows || []).includes("GST")) {
    res.status(404).json({ error: "Client not found or GST workflow not enabled" });
    return null;
  }
  if (!canAccessWorkflow(req, snap.data(), "GST")) {
    res.status(403).json({ error: "GST isn't assigned to you for this client" });
    return null;
  }
  return { id: snap.id, ...snap.data() };
}

const credentialSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  consent: z.literal(true),
});

gstRouter.post(
  "/credentials",
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const parsed = credentialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    await clientRef(req.orgId, req.params.clientId)
      .collection("gstCredential")
      .doc("current")
      .set({
        encryptedUsername: encryptSecret(parsed.data.username, req.orgId),
        encryptedPassword: encryptSecret(parsed.data.password, req.orgId),
        consentAcceptedAt: new Date().toISOString(),
        createdByUid: req.uid,
      });

    res.json({ ok: true });
  })
);

gstRouter.get(
  "/credentials/status",
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const snap = await clientRef(req.orgId, req.params.clientId).collection("gstCredential").doc("current").get();
    res.json({ hasCredential: snap.exists });
  })
);

const runSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM") });

gstRouter.post(
  "/runs",
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    const credentialSnap = await clientRef(req.orgId, req.params.clientId)
      .collection("gstCredential")
      .doc("current")
      .get();
    if (!credentialSnap.exists) {
      return res.status(400).json({ error: "Save the client's GST portal credentials before running a fetch" });
    }

    const runId = randomBytes(12).toString("hex");
    await clientRef(req.orgId, req.params.clientId)
      .collection("gstRuns")
      .doc(runId)
      .set({
        orgId: req.orgId,
        clientId: req.params.clientId,
        clientName: client.name,
        period: parsed.data.period,
        status: "QUEUED",
        message: null,
        errorMessage: null,
        triggeredByUid: req.uid,
        createdAt: new Date().toISOString(),
      });

    // Fire-and-forget: the frontend polls GET /runs/:runId for status.
    void startGstRun({ orgId: req.orgId, clientId: req.params.clientId, runId, period: parsed.data.period });

    res.json({ runId });
  })
);

gstRouter.get(
  "/runs",
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const snap = await clientRef(req.orgId, req.params.clientId)
      .collection("gstRuns")
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    res.json({ runs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  })
);

gstRouter.get(
  "/runs/:runId",
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const snap = await clientRef(req.orgId, req.params.clientId).collection("gstRuns").doc(req.params.runId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Run not found" });
    }
    res.json({ id: snap.id, ...snap.data() });
  })
);

const otpSchema = z.object({ otp: z.string().min(4).max(10) });

gstRouter.post(
  "/runs/:runId/otp",
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const parsed = otpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const runDocRef = clientRef(req.orgId, req.params.clientId).collection("gstRuns").doc(req.params.runId);
    const runSnap = await runDocRef.get();
    if (!runSnap.exists) {
      return res.status(404).json({ error: "Run not found" });
    }
    if (runSnap.data().status !== "WAITING_OTP") {
      return res.status(409).json({ error: "This run isn't waiting for an OTP right now" });
    }

    const delivered = submitOtp(req.params.runId, parsed.data.otp);
    if (!delivered) {
      return res
        .status(409)
        .json({ error: "This run is no longer waiting for an OTP (backend may have restarted)" });
    }

    res.json({ ok: true });
  })
);

gstRouter.get(
  "/periods",
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const snap = await clientRef(req.orgId, req.params.clientId)
      .collection("gstPeriods")
      .orderBy("period", "desc")
      .get();
    res.json({ periods: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  })
);

gstRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const period = String(req.query.period || "");
    const format = req.query.format === "csv" ? "csv" : "xlsx";
    if (!period) {
      return res.status(400).json({ error: "period is required" });
    }

    const periodSnap = await clientRef(req.orgId, req.params.clientId).collection("gstPeriods").doc(period).get();
    const records = periodSnap.exists ? periodSnap.data().records || [] : [];

    const sheet = XLSX.utils.json_to_sheet(records.length > 0 ? records : [{ note: "No records for this period" }]);
    const filenameBase = `${client.name.replace(/[^a-z0-9]+/gi, "_")}_GST_${period}`;

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
      return res.send(XLSX.utils.sheet_to_csv(sheet));
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "GST");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
    res.send(buffer);
  })
);

const MAX_RECONCILIATION_UPLOAD_BYTES = 15 * 1024 * 1024;
const reconciliationUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_RECONCILIATION_UPLOAD_BYTES } });

function reconciliationUploadMiddleware(req, res, next) {
  reconciliationUpload.fields([{ name: "invoiceFile", maxCount: 1 }, { name: "gstr2bFile", maxCount: 1 }])(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Each file must be under 15MB" : "Upload failed";
      return res.status(400).json({ error: message });
    }
    next();
  });
}

function reconciliationRef(orgId, clientId, period) {
  return clientRef(orgId, clientId).collection("gstReconciliations").doc(period);
}

/**
 * Compares an uploaded Invoice Excel (the client's purchase invoices for `period`) against an
 * uploaded GSTR-2B (B2B sheet) for the same period — see backend/src/lib/gstReconciliation.js.
 * Persists the result so it can be revisited without re-uploading, then returns it.
 */
gstRouter.post(
  "/reconciliation",
  reconciliationUploadMiddleware,
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const period = String(req.body.period || "");
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ error: "period is required (YYYY-MM)" });
    }
    const invoiceFile = req.files?.invoiceFile?.[0];
    const gstr2bFile = req.files?.gstr2bFile?.[0];
    if (!invoiceFile) {
      return res.status(400).json({ error: "Upload the client's Invoice Excel" });
    }
    if (!gstr2bFile) {
      return res.status(400).json({ error: "Upload the GSTR-2B Excel file" });
    }

    let gstr2bRows, clientRows, outsidePeriod, unparseableDate;
    try {
      gstr2bRows = parseGstr2bWorkbook(gstr2bFile.buffer);
      ({ rows: clientRows, outsidePeriod, unparseableDate } = parseInvoiceExcel(invoiceFile.buffer, period));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const result = reconcile(gstr2bRows, clientRows);

    const record = {
      period,
      gstr2bFileName: gstr2bFile.originalname,
      invoiceFileName: invoiceFile.originalname,
      gstr2bRowCount: gstr2bRows.length,
      clientRowCount: clientRows.length,
      skippedInvoiceRows: { outsidePeriod, unparseableDate },
      matched: result.matched,
      mismatched: result.mismatched,
      clientOnly: result.clientOnly,
      gstr2bOnly: result.gstr2bOnly,
      amountToPay: result.amountToPay,
      uploadedAt: new Date().toISOString(),
      uploadedByUid: req.uid,
    };
    await reconciliationRef(req.orgId, req.params.clientId, period).set(record);

    res.json(record);
  })
);

gstRouter.get(
  "/reconciliation/:period",
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const snap = await reconciliationRef(req.orgId, req.params.clientId, req.params.period).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "No reconciliation run for this period yet" });
    }
    res.json(snap.data());
  })
);

gstRouter.get(
  "/reconciliation/:period/export",
  asyncHandler(async (req, res) => {
    const client = await loadGstClient(req, res);
    if (!client) return;

    const snap = await reconciliationRef(req.orgId, req.params.clientId, req.params.period).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "No reconciliation run for this period yet" });
    }

    const buffer = await buildReconciliationExcelBuffer(snap.data(), { clientName: client.name, period: req.params.period });
    const filenameBase = `${client.name.replace(/[^a-z0-9]+/gi, "_")}_GSTR2B_Reconciliation_${req.params.period}`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
    res.send(Buffer.from(buffer));
  })
);
