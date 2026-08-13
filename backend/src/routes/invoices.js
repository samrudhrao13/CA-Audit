import { Router } from "express";
import multer from "multer";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { canAccessClient } from "../lib/clientAccess.js";
import { uploadInvoiceToDrive, listMonthFolders, listFilesInFolder } from "../lib/googleDrive.js";

/**
 * Bulk invoice filing — straight into this client's Drive folder (company / current month),
 * no OCR/field extraction involved. Separate from the HandScribe extractor's upload, which
 * exists to run a file through extraction, not just archive it. Drive is the only place these
 * files live (no Firestore base64 copy) since that's the whole point of this endpoint, so a
 * Drive failure here is a real error, not something to silently swallow.
 */
export const invoicesRouter = Router({ mergeParams: true });
invoicesRouter.use(requireAuth, requireCompanyMember);

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

invoicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;
    const snap = await clientRef(req.orgId, req.params.clientId)
      .collection("invoices")
      .orderBy("uploadedAt", "desc")
      .limit(200)
      .get();
    res.json({ invoices: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  })
);

invoicesRouter.post(
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
      driveFile = await uploadInvoiceToDrive(req.orgId, req.params.clientId, {
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

    const ref = clientRef(req.orgId, req.params.clientId).collection("invoices").doc();
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

/** Existing month folders for this client, for the extractor's "pick from Drive" browser. */
invoicesRouter.get(
  "/drive/months",
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;
    const months = await listMonthFolders(req.orgId, req.params.clientId);
    res.json({ months });
  })
);

invoicesRouter.get(
  "/drive/months/:monthKey/files",
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;
    const months = await listMonthFolders(req.orgId, req.params.clientId);
    const month = months.find((m) => m.monthKey === req.params.monthKey);
    if (!month) {
      return res.json({ files: [] });
    }
    const files = await listFilesInFolder(month.folderId);
    res.json({ files });
  })
);
