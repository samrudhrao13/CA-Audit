import { Readable } from "node:stream";
import { google } from "googleapis";
import { db, serviceAccount } from "./firebaseAdmin.js";

/**
 * Invoice storage in Google Drive, organized as:
 *   <root folder> / <company name> / <YYYY - Month> / <invoice files>
 *
 * Reuses the same service account as Firebase Admin (see firebaseAdmin.js) rather than a
 * second credential — it just needs the Drive API enabled on that project and the root
 * folder shared with the service account's client_email as an editor.
 *
 * Company and month folders are created lazily (on first invoice of that company/month) and
 * their IDs are cached on the client's Firestore doc (`driveFolderId`, `driveMonthFolders`)
 * so normal uploads don't re-query Drive's folder listing every time.
 *
 * Every export here is best-effort: if GOOGLE_DRIVE_ROOT_FOLDER_ID isn't set, or a Drive call
 * fails, callers get `null` back rather than a thrown error — Drive sync mirrors the existing
 * Firestore-based file storage, it never gates it.
 */
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "";
export const driveConfigured = Boolean(ROOT_FOLDER_ID);

let driveClient = null;
function getDrive() {
  if (!driveClient) {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    driveClient = google.drive({ version: "v3", auth });
  }
  return driveClient;
}

function monthFolderName(date) {
  return `${date.getFullYear()} - ${date.toLocaleString("en-US", { month: "long" })}`;
}

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return monthFolderName(new Date(year, month - 1, 1));
}

function escapeForDriveQuery(name) {
  return name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findChildFolder(parentId, name) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${escapeForDriveQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id || null;
}

async function createFolder(parentId, name) {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  return res.data.id;
}

function clientRef(orgId, clientId) {
  return db.collection("organizations").doc(orgId).collection("clients").doc(clientId);
}

/** Creates (or finds) this client's top-level Drive folder. Called eagerly right when a
 *  client is created, and again lazily here as a fallback for clients that predate Drive
 *  sync, or if the eager create failed transiently. */
export async function ensureCompanyFolder(orgId, clientId) {
  if (!driveConfigured) return null;
  const ref = clientRef(orgId, clientId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const client = snap.data();
  if (client.driveFolderId) return client.driveFolderId;

  const folderId = (await findChildFolder(ROOT_FOLDER_ID, client.name)) || (await createFolder(ROOT_FOLDER_ID, client.name));
  await ref.update({ driveFolderId: folderId });
  return folderId;
}

/** Creates (or finds) the month folder for "now" inside this client's company folder,
 *  named "YYYY - Month" — e.g. "2026 - August". A new one appears automatically the first
 *  time an invoice is uploaded after the calendar rolls into a new month. */
export async function ensureMonthFolder(orgId, clientId, date = new Date()) {
  if (!driveConfigured) return null;
  const ref = clientRef(orgId, clientId);
  const monthKey = monthKeyOf(date);

  const snap = await ref.get();
  if (!snap.exists) return null;
  const client = snap.data();
  const cached = client.driveMonthFolders?.[monthKey];
  if (cached) return cached;

  const companyFolderId = client.driveFolderId || (await ensureCompanyFolder(orgId, clientId));
  if (!companyFolderId) return null;

  const name = monthFolderName(date);
  const folderId = (await findChildFolder(companyFolderId, name)) || (await createFolder(companyFolderId, name));
  await ref.update({ [`driveMonthFolders.${monthKey}`]: folderId });
  return folderId;
}

/** Creates (or finds) the "Company Documents" folder inside a client's company folder — a
 *  separate bucket, sitting alongside the invoice month folders, for the GST/TDS workflow
 *  document checklist (bank statements, registers, etc.), which aren't invoices and shouldn't
 *  get mixed into the monthly invoice folders. Not further split by month/period — just one
 *  flat folder per client. */
export async function ensureCompanyDocumentsFolder(orgId, clientId) {
  if (!driveConfigured) return null;
  const ref = clientRef(orgId, clientId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const client = snap.data();
  if (client.driveCompanyDocumentsFolderId) return client.driveCompanyDocumentsFolderId;

  const companyFolderId = client.driveFolderId || (await ensureCompanyFolder(orgId, clientId));
  if (!companyFolderId) return null;

  const folderId =
    (await findChildFolder(companyFolderId, "Company Documents")) || (await createFolder(companyFolderId, "Company Documents"));
  await ref.update({ driveCompanyDocumentsFolderId: folderId });
  return folderId;
}

async function createDriveFile(folderId, fileName, mimeType, buffer) {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: mimeType || "application/octet-stream", body: Readable.from(buffer) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  return { id: res.data.id, webViewLink: res.data.webViewLink };
}

// Service accounts have zero storage quota outside a Shared Drive — this is what Google's
// API returns if a client's cached folder refs still point at a folder created before the
// root was (re)configured to a Shared Drive.
function isQuotaError(err) {
  return /storage quota/i.test(err?.message || "");
}

/** Uploads a file into `folderId`, self-healing once from stale cached folder refs: on a
 *  quota error, clears every cached Drive ref on the client doc, re-resolves the target
 *  folder via `resolveFolderId` (rebuilding fresh under the currently configured root), and
 *  retries — rather than failing the same way forever like a bare cache would. */
async function uploadWithSelfHeal(orgId, clientId, folderId, { fileName, mimeType, buffer }, resolveFolderId) {
  if (!folderId) return null;
  try {
    return await createDriveFile(folderId, fileName, mimeType, buffer);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    await clientRef(orgId, clientId).update({
      driveFolderId: null,
      driveMonthFolders: null,
      driveCompanyDocumentsFolderId: null,
    });
    const freshFolderId = await resolveFolderId();
    if (!freshFolderId) return null;
    return await createDriveFile(freshFolderId, fileName, mimeType, buffer);
  }
}

/** Uploads one invoice file into the right company/month folder. Returns
 *  `{ id, webViewLink }` on success, or `null` if Drive isn't configured/reachable. */
export async function uploadInvoiceToDrive(orgId, clientId, { fileName, mimeType, buffer, date = new Date() }) {
  const folderId = await ensureMonthFolder(orgId, clientId, date);
  return uploadWithSelfHeal(orgId, clientId, folderId, { fileName, mimeType, buffer }, () =>
    ensureMonthFolder(orgId, clientId, date)
  );
}

/** Uploads one GST/TDS workflow-checklist document into this client's "Company Documents"
 *  folder — separate from the invoice month folders above. Returns `{ id, webViewLink }` on
 *  success, or `null` if Drive isn't configured/reachable. */
export async function uploadCompanyDocumentToDrive(orgId, clientId, { fileName, mimeType, buffer }) {
  const folderId = await ensureCompanyDocumentsFolder(orgId, clientId);
  return uploadWithSelfHeal(orgId, clientId, folderId, { fileName, mimeType, buffer }, () =>
    ensureCompanyDocumentsFolder(orgId, clientId)
  );
}

/** This client's month folders that already exist in Drive (from cache on the client doc —
 *  no live Drive query needed), newest first, for a "pick an existing invoice" browser. */
export async function listMonthFolders(orgId, clientId) {
  if (!driveConfigured) return [];
  const snap = await clientRef(orgId, clientId).get();
  if (!snap.exists) return [];
  const map = snap.data().driveMonthFolders || {};
  return Object.entries(map)
    .map(([monthKey, folderId]) => ({ monthKey, label: monthLabelFromKey(monthKey), folderId }))
    .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));
}

/** Non-folder files sitting directly inside a Drive folder, newest first. */
export async function listFilesInFolder(folderId) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: "files(id, name, mimeType, size, webViewLink, createdTime)",
    orderBy: "createdTime desc",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files || [];
}

/** Downloads a file already in Drive by ID — used when the extractor is asked to process a
 *  file the user picked from Drive instead of uploading one fresh from their device. */
export async function downloadDriveFile(fileId) {
  const drive = getDrive();
  const metaRes = await drive.files.get({ fileId, fields: "id, name, mimeType, size, webViewLink", supportsAllDrives: true });
  const mediaRes = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  return {
    name: metaRes.data.name,
    mimeType: metaRes.data.mimeType,
    webViewLink: metaRes.data.webViewLink,
    buffer: Buffer.from(mediaRes.data),
  };
}
