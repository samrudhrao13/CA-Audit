import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { serviceAccountEmail } from "../lib/googleDrive.js";
import { setOrgDriveRootFolder } from "../lib/orgDriveConfig.js";

export const driveSettingsRouter = Router();

driveSettingsRouter.use(requireAuth, requireCompanyMember);

driveSettingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const snap = await db.collection("organizations").doc(req.orgId).get();
    res.json({
      folderId: snap.data()?.driveRootFolderId ?? null,
      serviceAccountEmail,
    });
  })
);

const folderSchema = z.object({
  folderLink: z.string().min(1),
});

/** Each company points its own invoices/documents at its own Drive folder or Shared Drive —
 *  never a platform-wide shared one, so one company's files can never land next to another's.
 *  The folder (or Shared Drive) must be shared with `serviceAccountEmail` (Content Manager on
 *  a Shared Drive, or Editor on a regular folder) before uploads will succeed. */
driveSettingsRouter.put(
  "/",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = folderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    try {
      const folderId = await setOrgDriveRootFolder(req.orgId, parsed.data.folderLink);
      res.json({ ok: true, folderId });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  })
);
