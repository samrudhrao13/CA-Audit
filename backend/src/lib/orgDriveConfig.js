import { db } from "./firebaseAdmin.js";

function orgRef(orgId) {
  return db.collection("organizations").doc(orgId);
}

const DRIVE_LINK_PATTERNS = [/\/folders\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/];

/** Accepts either a bare Drive folder/Shared-Drive ID or a full link copied from Drive's
 *  address bar or "Share" dialog, and extracts just the ID either way, since that's all the
 *  Drive API actually needs. */
export function parseDriveFolderId(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;
  for (const pattern of DRIVE_LINK_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

/** This company's configured Drive destination — every org sets its own, so one company's
 *  files are never created under another company's Drive. `null` means Drive sync is a no-op
 *  for this org (same "left unset, everything else still works" behavior as before). */
export async function getOrgDriveRootFolderId(orgId) {
  const snap = await orgRef(orgId).get();
  return snap.data()?.driveRootFolderId || null;
}

/** Saves this org's Drive root folder/Shared Drive and clears every client's cached folder
 *  refs under it, so the next upload re-resolves (and if needed re-creates) folders fresh
 *  under the new root instead of continuing to write into the old one. */
export async function setOrgDriveRootFolder(orgId, folderIdOrLink) {
  const folderId = parseDriveFolderId(folderIdOrLink);
  if (!folderId) throw new Error("Couldn't read a folder ID from that link.");

  await orgRef(orgId).set({ driveRootFolderId: folderId }, { merge: true });

  const clientsSnap = await orgRef(orgId).collection("clients").get();
  await Promise.all(
    clientsSnap.docs.map((doc) =>
      doc.ref.update({ driveFolderId: null, driveMonthFolders: null, driveCompanyDocumentsFolderId: null })
    )
  );

  return folderId;
}
