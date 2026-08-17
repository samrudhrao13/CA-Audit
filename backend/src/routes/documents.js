import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { canAccessWorkflow } from "../lib/clientAccess.js";
import { currentPeriod, setProgressStage, getClientProgress } from "../lib/workflowProgress.js";
import { uploadCompanyDocumentToDrive } from "../lib/googleDrive.js";
import { markChecklistDocumentUploaded } from "../lib/documentChecklist.js";
import { sendMail } from "../lib/mailer.js";
import { getOrgMailConfig } from "../lib/orgMailConfig.js";
import { formatPeriodLabel } from "../lib/dateUtils.js";

// TDS and GST both get one extra, non-configurable checklist item appended after whatever the
// admin picked: the challan (proof of tax payment) can only be filed once every real document
// is in, so it's modeled as the last item in the same checklist rather than a separate flow.
// PT/other workflows don't get one — extend this list if a future workflow needs it too.
const CHALLAN_WORKFLOWS = ["TDS", "GST"];
const CHALLAN_DOCUMENT_NAME = "Challan";

export const documentsRouter = Router();

documentsRouter.use(requireAuth, requireCompanyMember);

/**
 * Generic across every workflow (not TDS-specific) — driven by each client's own resolved
 * document checklist for that workflow (see loadClientAndCatalog below), not a fixed
 * platform-wide list, since which documents a client actually needs varies client to client.
 *
 * Files live directly in Firestore as base64 (one document per file so no single doc gets
 * close to the 1MiB limit; 500KB per file keeps real headroom) and are also best-effort
 * mirrored into Drive — see uploadCompanyDocumentToDrive below.
 */
const MAX_DOCUMENT_BYTES = 500 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES } });

function uploadMiddleware(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "File must be under 500KB for now (temporary limit until Google Drive is connected)"
          : "Upload failed";
      return res.status(400).json({ error: message });
    }
    next();
  });
}

function clientRef(orgId, clientId) {
  return db.collection("organizations").doc(orgId).collection("clients").doc(clientId);
}

function checklistRef(orgId, clientId, workflowKey, period) {
  return clientRef(orgId, clientId).collection("documentChecklist").doc(`${workflowKey}_${period}`);
}

function fileDocId(documentName) {
  return Buffer.from(documentName).toString("base64url");
}

async function loadClientAndCatalog(req, res, workflowKey) {
  const clientSnap = await clientRef(req.orgId, req.params.clientId).get();
  if (!clientSnap.exists || !(clientSnap.data().enrolledWorkflows || []).includes(workflowKey)) {
    res.status(404).json({ error: "Client not found or workflow not enabled" });
    return null;
  }
  const client = clientSnap.data();
  if (!canAccessWorkflow(req, client, workflowKey)) {
    res.status(403).json({ error: "This workflow isn't assigned to you for this client" });
    return null;
  }
  // This client's own resolved checklist (predefined documents the admin checked off for
  // them + any "other" documents unique to them) — set on the client profile, see
  // routes/clients.js's documentChecklistConfig. No longer the platform-wide catalog list,
  // since not every client needs every document.
  const selection = client.documentChecklistConfig?.[workflowKey];
  const requiredDocuments = [...(selection?.predefinedSelected || []), ...(selection?.otherDocuments || [])];
  if (CHALLAN_WORKFLOWS.includes(workflowKey) && requiredDocuments.length > 0) {
    requiredDocuments.push(CHALLAN_DOCUMENT_NAME);
  }
  return { client: { id: clientSnap.id, ...client }, requiredDocuments };
}

/** Merges the workflow's required-documents catalog with this client+period's upload status. */
documentsRouter.get(
  "/client/:clientId/:workflowKey",
  asyncHandler(async (req, res) => {
    const loaded = await loadClientAndCatalog(req, res, req.params.workflowKey);
    if (!loaded) return;

    const period = String(req.query.period || currentPeriod());
    const checklistSnap = await checklistRef(req.orgId, req.params.clientId, req.params.workflowKey, period).get();
    const uploaded = checklistSnap.exists ? checklistSnap.data().documents || {} : {};

    const documents = loaded.requiredDocuments.map((name) => ({
      name,
      uploaded: false,
      ...uploaded[name],
    }));

    res.json({ period, documents, allUploaded: documents.length > 0 && documents.every((d) => d.uploaded) });
  })
);

documentsRouter.post(
  "/client/:clientId/:workflowKey/upload",
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    if (req.role === "COMPANY_ADMIN") {
      return res.status(403).json({ error: "Document uploads are handled by company users — admins have read-only access here." });
    }
    const loaded = await loadClientAndCatalog(req, res, req.params.workflowKey);
    if (!loaded) return;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const documentName = String(req.body.documentName || "");
    const period = String(req.body.period || currentPeriod());
    if (!loaded.requiredDocuments.includes(documentName)) {
      return res.status(400).json({ error: "Not a recognized document for this workflow" });
    }

    const isChallan = CHALLAN_WORKFLOWS.includes(req.params.workflowKey) && documentName === CHALLAN_DOCUMENT_NAME;
    if (isChallan) {
      // The challan is the last step — every other document on this client's checklist for
      // this workflow must already be in before it can be uploaded.
      const checklistSnap = await checklistRef(req.orgId, req.params.clientId, req.params.workflowKey, period).get();
      const uploadedMap = checklistSnap.exists ? checklistSnap.data().documents || {} : {};
      const otherDocsDone = loaded.requiredDocuments
        .filter((name) => name !== CHALLAN_DOCUMENT_NAME)
        .every((name) => uploadedMap[name]?.uploaded);
      if (!otherDocsDone) {
        return res.status(400).json({ error: `Upload all other ${req.params.workflowKey} documents before the challan.` });
      }
    }

    const periodLabel = formatPeriodLabel(period);
    const extIndex = req.file.originalname.lastIndexOf(".");
    const ext = extIndex >= 0 ? req.file.originalname.slice(extIndex) : "";
    const uploadFileName = isChallan ? `Challan_${req.params.workflowKey}_${periodLabel}${ext}` : req.file.originalname;

    // Best-effort mirror into Drive (company folder / "Company Documents") — never blocks
    // the checklist upload itself if Drive isn't configured or a call to it fails. Separate
    // folder from invoices — these are compliance documents, not invoices.
    let driveFile = null;
    try {
      driveFile = await uploadCompanyDocumentToDrive(req.orgId, req.params.clientId, {
        fileName: uploadFileName,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      });
    } catch (err) {
      console.error(`Drive: failed to upload document for client ${req.params.clientId}:`, err.message);
    }

    const { allUploaded } = await markChecklistDocumentUploaded({
      orgId: req.orgId,
      clientId: req.params.clientId,
      workflowKey: req.params.workflowKey,
      requiredDocuments: loaded.requiredDocuments,
      documentName,
      period,
      fileName: uploadFileName,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      dataBase64: req.file.buffer.toString("base64"),
      driveFileId: driveFile?.id ?? null,
      driveWebViewLink: driveFile?.webViewLink ?? null,
      uploadedByUid: req.uid,
      source: isChallan ? "challan" : "manual",
    });

    // Best-effort — a challan upload still succeeds even if the email fails to send
    // (missing SMTP config, bad recipient, etc.); the file is already saved either way.
    if (isChallan) {
      const client = loaded.client;
      const recipients = [
        client.notifyCompanyEmail && client.email,
        client.notifyContactPersonEmail && client.contactPersonEmail,
      ].filter(Boolean);
      if (recipients.length > 0) {
        try {
          const mailConfig = await getOrgMailConfig(req.orgId);
          await sendMail(
            {
              to: recipients,
              subject: `${req.params.workflowKey} Challan — ${periodLabel}`,
              html: `<p>Dear ${client.name || "Sir/Madam"},</p><p>This is to inform you that your ${req.params.workflowKey} return has been filed for ${periodLabel}. Please find attached below a copy of the payment challan/receipt for your records.</p><p>Thank you.</p>`,
              attachments: [{ filename: uploadFileName, content: req.file.buffer, contentType: req.file.mimetype }],
            },
            mailConfig
          );
          await clientRef(req.orgId, req.params.clientId)
            .collection("emailLog")
            .add({
              type: "challan_receipt",
              workflowKey: req.params.workflowKey,
              period,
              sentAt: new Date().toISOString(),
              recipients,
            });
        } catch (err) {
          console.error(`Mail: failed to send ${req.params.workflowKey} challan copy for client ${req.params.clientId}:`, err.message);
        }
      }
    }

    res.json({ ok: true, allUploaded });
  })
);

documentsRouter.get(
  "/client/:clientId/:workflowKey/file",
  asyncHandler(async (req, res) => {
    const loaded = await loadClientAndCatalog(req, res, req.params.workflowKey);
    if (!loaded) return;

    const documentName = String(req.query.documentName || "");
    const period = String(req.query.period || currentPeriod());

    const fileSnap = await checklistRef(req.orgId, req.params.clientId, req.params.workflowKey, period)
      .collection("files")
      .doc(fileDocId(documentName))
      .get();
    if (!fileSnap.exists) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = fileSnap.data();
    const buffer = Buffer.from(file.dataBase64, "base64");
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    res.send(buffer);
  })
);

const markFiledSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });

/** Records that this workflow's return was actually filed for the period — captures today's date. */
documentsRouter.post(
  "/client/:clientId/:workflowKey/mark-filed",
  asyncHandler(async (req, res) => {
    if (req.role === "COMPANY_ADMIN") {
      return res.status(403).json({ error: "Marking a workflow as filed is handled by company users — admins have read-only access here." });
    }
    const loaded = await loadClientAndCatalog(req, res, req.params.workflowKey);
    if (!loaded) return;

    const parsed = markFiledSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    await setProgressStage(req.orgId, req.params.clientId, req.params.workflowKey, parsed.data.period, "filed", {
      filedOn: new Date().toISOString(),
    });

    res.json({ ok: true });
  })
);

/** Records that the client has been billed for this workflow/period — the step after filing,
 *  not a compliance requirement, so it's gated on "filed" rather than the document checklist.
 *  Takes the invoice the auditor has already prepared (this app has no fee schedule/billing
 *  engine of its own), saves it to Drive, and emails a copy straight to the client — same
 *  pattern as the challan step above, just for the auditor's own bill instead of a government
 *  receipt. */
documentsRouter.post(
  "/client/:clientId/:workflowKey/mark-billed",
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    if (req.role === "COMPANY_ADMIN") {
      return res.status(403).json({ error: "Marking a workflow as billed is handled by company users — admins have read-only access here." });
    }
    const loaded = await loadClientAndCatalog(req, res, req.params.workflowKey);
    if (!loaded) return;

    if (!req.file) {
      return res.status(400).json({ error: "Attach the invoice to mark this workflow as billed" });
    }
    const period = String(req.body.period || currentPeriod());
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ error: "Invalid period" });
    }

    const progress = await getClientProgress(req.orgId, req.params.clientId, period);
    const currentStage = progress[req.params.workflowKey]?.stage;
    if (currentStage !== "filed") {
      return res.status(400).json({ error: "Mark this workflow as filed before marking it billed." });
    }

    const periodLabel = formatPeriodLabel(period);
    const extIndex = req.file.originalname.lastIndexOf(".");
    const ext = extIndex >= 0 ? req.file.originalname.slice(extIndex) : "";
    const invoiceFileName = `Invoice_${req.params.workflowKey}_${periodLabel}${ext}`;

    let driveFile = null;
    try {
      driveFile = await uploadCompanyDocumentToDrive(req.orgId, req.params.clientId, {
        fileName: invoiceFileName,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      });
    } catch (err) {
      console.error(`Drive: failed to upload invoice for client ${req.params.clientId}:`, err.message);
    }

    await setProgressStage(req.orgId, req.params.clientId, req.params.workflowKey, period, "billed", {
      billedOn: new Date().toISOString(),
      invoiceFileName,
      invoiceDriveWebViewLink: driveFile?.webViewLink ?? null,
    });

    // Best-effort — billing the workflow still succeeds even if the email fails to send;
    // the invoice is already saved to Drive either way.
    const client = loaded.client;
    const recipients = [
      client.notifyCompanyEmail && client.email,
      client.notifyContactPersonEmail && client.contactPersonEmail,
    ].filter(Boolean);
    if (recipients.length > 0) {
      try {
        const mailConfig = await getOrgMailConfig(req.orgId);
        await sendMail(
          {
            to: recipients,
            subject: `Invoice — ${req.params.workflowKey} services — ${periodLabel}`,
            html: `<p>Dear ${client.name || "Sir/Madam"},</p><p>Please find attached the invoice for ${req.params.workflowKey} compliance services rendered for ${periodLabel}.</p><p>Thank you for your business.</p>`,
            attachments: [{ filename: invoiceFileName, content: req.file.buffer, contentType: req.file.mimetype }],
          },
          mailConfig
        );
        await clientRef(req.orgId, req.params.clientId)
          .collection("emailLog")
          .add({
            type: "invoice",
            workflowKey: req.params.workflowKey,
            period,
            sentAt: new Date().toISOString(),
            recipients,
          });
      } catch (err) {
        console.error(`Mail: failed to send invoice for client ${req.params.clientId}:`, err.message);
      }
    }

    res.json({ ok: true, invoiceFileName, invoiceDriveWebViewLink: driveFile?.webViewLink ?? null });
  })
);
