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

export const documentsRouter = Router();

documentsRouter.use(requireAuth, requireCompanyMember);

/**
 * Generic across every workflow (not TDS-specific) — any workflow with a
 * requiredDocuments list in its catalog entry gets this checklist for free.
 *
 * TEMPORARY BRIDGE: files live directly in Firestore as base64, one document
 * per file so no single doc gets close to the 1MiB limit. 500KB per file
 * keeps real headroom. This is standing in until Google Drive is connected —
 * the swap point is saveFile/loadFile below; nothing else in this file (or
 * the frontend) needs to change once that happens.
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
  if (!canAccessWorkflow(req, clientSnap.data(), workflowKey)) {
    res.status(403).json({ error: "This workflow isn't assigned to you for this client" });
    return null;
  }
  const catalogSnap = await db.collection("workflowDefinitions").doc(workflowKey).get();
  const requiredDocuments = catalogSnap.data()?.requiredDocuments || [];
  return { client: { id: clientSnap.id, ...clientSnap.data() }, requiredDocuments };
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

    const ref = checklistRef(req.orgId, req.params.clientId, req.params.workflowKey, period);

    // Best-effort mirror into Drive (company folder / "Company Documents") — never blocks
    // the checklist upload itself if Drive isn't configured or a call to it fails. Separate
    // folder from invoices — these are compliance documents, not invoices.
    let driveFile = null;
    try {
      driveFile = await uploadCompanyDocumentToDrive(req.orgId, req.params.clientId, {
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      });
    } catch (err) {
      console.error(`Drive: failed to upload document for client ${req.params.clientId}:`, err.message);
    }

    await ref.collection("files").doc(fileDocId(documentName)).set({
      documentName,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      dataBase64: req.file.buffer.toString("base64"),
      driveFileId: driveFile?.id ?? null,
      driveWebViewLink: driveFile?.webViewLink ?? null,
    });

    await ref.set(
      {
        workflowKey: req.params.workflowKey,
        period,
        documents: {
          [documentName]: {
            uploaded: true,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            uploadedAt: new Date().toISOString(),
            uploadedByUid: req.uid,
            driveWebViewLink: driveFile?.webViewLink ?? null,
          },
        },
      },
      { merge: true }
    );

    // Auto-advance the workflow's progress stage from the checklist —
    // never downgrades a stage that's already further along (e.g. filed).
    const checklistSnap = await ref.get();
    const documents = checklistSnap.data().documents || {};
    const uploadedCount = loaded.requiredDocuments.filter((name) => documents[name]?.uploaded).length;
    const totalCount = loaded.requiredDocuments.length;
    const allUploaded = uploadedCount === totalCount;

    const progress = await getClientProgress(req.orgId, req.params.clientId, period);
    const currentStage = progress[req.params.workflowKey]?.stage;
    if (currentStage !== "ready_for_filing" && currentStage !== "filed") {
      await setProgressStage(
        req.orgId,
        req.params.clientId,
        req.params.workflowKey,
        period,
        allUploaded ? "ready_for_filing" : "documents_received",
        { documentsUploaded: uploadedCount, documentsTotal: totalCount }
      );
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
