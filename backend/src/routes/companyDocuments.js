import { Router } from "express";
import multer from "multer";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { canAccessClient } from "../lib/clientAccess.js";
import { uploadCompanyDocumentToDrive } from "../lib/googleDrive.js";

/**
 * Free-form company documents (not invoices, not tied to a GST/TDS checklist's fixed
 * document-name catalog) — straight into this client's "Company Documents" Drive folder,
 * a separate bucket from both the invoice month folders (see routes/invoices.js) and the
 * per-workflow document checklist (see routes/documents.js). Kept as its own endpoint/
 * Firestore collection rather than reusing either of those so each upload path maps 1:1 to
 * exactly one Drive destination — no ambiguity about which folder a given upload belongs in.
 */
export const companyDocumentsRouter = Router({ mergeParams: true });
companyDocumentsRouter.use(requireAuth, requireCompanyMember);

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

function uploadMiddleware(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "File must be under 20MB" : "Upload failed";
      return res.status(400).json({ error: message });
    }
    next();
  });
}

function clientRef(orgId, clientId) {
  return db.collection("organizations").doc(orgId).collection("clients").doc(clientId);
}

async function loadClient(req, res) {
  const snap = await clientRef(req.orgId, req.params.clientId).get();
  if (!snap.exists) {
    res.status(404).json({ error: "Client not found" });
    return null;
  }
  if (!canAccessClient(req, snap.data())) {
    res.status(403).json({ error: "This client isn't assigned to you" });
    return null;
  }
  return { id: snap.id, ...snap.data() };
}

companyDocumentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;
    const snap = await clientRef(req.orgId, req.params.clientId)
      .collection("companyDocuments")
      .orderBy("uploadedAt", "desc")
      .limit(200)
      .get();
    res.json({ documents: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  })
);

companyDocumentsRouter.post(
  "/upload",
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let driveFile;
    try {
      driveFile = await uploadCompanyDocumentToDrive(req.orgId, req.params.clientId, {
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      });
    } catch (err) {
      return res.status(502).json({ error: `Couldn't upload to Google Drive: ${err.message}` });
    }
    if (!driveFile) {
      return res.status(503).json({ error: "Google Drive isn't connected yet — ask your platform admin to finish setup." });
    }

    const ref = clientRef(req.orgId, req.params.clientId).collection("companyDocuments").doc();
    const data = {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      driveFileId: driveFile.id,
      driveWebViewLink: driveFile.webViewLink,
      uploadedAt: new Date().toISOString(),
      uploadedByUid: req.uid,
    };
    await ref.set(data);
    res.json({ id: ref.id, ...data });
  })
);
