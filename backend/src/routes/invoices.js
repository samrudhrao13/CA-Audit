import { Router } from "express";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { canAccessClient } from "../lib/clientAccess.js";
import { listMonthFolders, listFilesInFolder } from "../lib/googleDrive.js";

/**
 * Drive-browsing for this client's invoice folders — backs the extractor's "pick from Drive"
 * picker. Actual invoice filing happens through the HandScribe extractor upload itself, which
 * already mirrors every extracted file into Drive, so there's no separate upload route here.
 */
export const invoicesRouter = Router({ mergeParams: true });
invoicesRouter.use(requireAuth, requireCompanyMember);

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
