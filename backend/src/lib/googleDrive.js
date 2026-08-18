import { Readable } from "node:stream";
import { google } from "googleapis";
import { db, serviceAccount } from "./firebaseAdmin.js";
import { getOrgDriveRootFolderId } from "./orgDriveConfig.js";

/**
 * Invoice storage in Google Drive, organized as:
 *   <org's configured root folder> / <company name> / <YYYY - Month> / <invoice files>
 *
 * Reuses the same service account as Firebase Admin (see firebaseAdmin.js) rather than a
 * second credential — it just needs the Drive API enabled on that project.
 *
 * The root folder is **per-organization**, not a single shared platform-wide folder — every
 * company admin configures their own Drive destination (see routes/driveSettings.js), and that
 * folder must be shared with the service account's client_email as an editor/Content Manager.
 * This keeps every company's documents fully separated in Drive, matching the existing
 * per-org data isolation everywhere else in the app.
 *
 * Client and month folders are created lazily (on first invoice of that company/month) and
 * their IDs are cached on the client's Firestore doc (`driveFolderId`, `driveMonthFolders`)
 * so normal uploads don't re-query Drive's folder listing every time.
 *
 * Every export here is best-effort: if this org hasn't configured a Drive root, or a Drive call
 * fails, callers get `null` back rather than a thrown error — Drive sync mirrors the existing
 * Firestore-based file storage, it never gates it.
 */
export const serviceAccountEmail = serviceAccount.client_email;

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

/** Reverses monthFolderName — "2026 - August" back to "2026-08" — or `null` if a folder's name
 *  doesn't look like one of these period folders at all (a client's root can hold other things
 *  too, so this is used to filter, not assumed to always match). */
function parsePeriodFolderName(name) {
  const match = String(name || "").match(/^(\d{4}) - ([A-Za-z]+)$/);
  if (!match) return null;
  const [, year, monthName] = match;
  const parsed = new Date(`${monthName} 1, ${year}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${year}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
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
  const rootFolderId = await getOrgDriveRootFolderId(orgId);
  if (!rootFolderId) return null;
  const ref = clientRef(orgId, clientId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const client = snap.data();
  if (client.driveFolderId) return client.driveFolderId;

  const folderId = (await findChildFolder(rootFolderId, client.name)) || (await createFolder(rootFolderId, client.name));
  await ref.update({ driveFolderId: folderId });
  return folderId;
}

/** Creates (or finds) the month folder for "now" inside this client's company folder,
 *  named "YYYY - Month" — e.g. "2026 - August". A new one appears automatically the first
 *  time an invoice is uploaded after the calendar rolls into a new month. */
export async function ensureMonthFolder(orgId, clientId, date = new Date()) {
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
 *  separate bucket, sitting alongside the invoice month folders, for free-form company
 *  documents that aren't tied to a workflow's fixed checklist (see routes/companyDocuments.js).
 *  Not further split by month/period — just one flat folder per client. */
export async function ensureCompanyDocumentsFolder(orgId, clientId) {
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

/** Creates (or finds) the flat "Documents" folder itself — <client> / <period, "YYYY - Month">
 *  / "Documents" — one level above the per-document-type subfolders below. This is also where
 *  the one consolidated extracted-fields workbook per document type lives (e.g. "Purchase
 *  Invoices extracted file.xlsx"), as a sibling of those subfolders rather than duplicated
 *  inside each one. Sibling "GST"/"TDS" folders exist alongside "Documents" at the same level
 *  for whatever workflow-specific material ends up needing its own place later — not created
 *  by this function. Cached on the client doc under `driveDocumentsFolders`, keyed by period. */
export async function ensureDocumentsFolder(orgId, clientId, period) {
  const ref = clientRef(orgId, clientId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const client = snap.data();

  const cached = client.driveDocumentsFolders?.[period];
  if (cached) return cached;

  const companyFolderId = client.driveFolderId || (await ensureCompanyFolder(orgId, clientId));
  if (!companyFolderId) return null;

  const periodName = monthLabelFromKey(period);
  const periodFolderId =
    (await findChildFolder(companyFolderId, periodName)) || (await createFolder(companyFolderId, periodName));

  const documentsFolderId =
    (await findChildFolder(periodFolderId, "Documents")) || (await createFolder(periodFolderId, "Documents"));

  await ref.set({ driveDocumentsFolders: { [period]: documentsFolderId } }, { merge: true });
  return documentsFolderId;
}

/** Creates (or finds) the folder a document-checklist file belongs in — the "Documents" folder
 *  above, then a subfolder per document type (e.g. "Purchase Invoices"). One shared subfolder
 *  per period, not split per workflow: the same Purchase/Sales invoice etc. is often required
 *  by more than one enrolled workflow (GST and TDS both, for the same client), and it's the
 *  same physical document either way, so it's stored once here rather than duplicated once per
 *  workflow. Used for every checklist upload: manual (routes/documents.js), challan, and
 *  extraction auto-fulfillment (routes/handscribe.js) alike. `period` is "YYYY-MM". Cached on
 *  the client doc under `driveChecklistFolders`, keyed by period+document name. */
export async function ensureChecklistDocumentFolder(orgId, clientId, period, documentName) {
  const ref = clientRef(orgId, clientId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const client = snap.data();

  const cacheKey = `${period}__${documentName}`;
  const cached = client.driveChecklistFolders?.[cacheKey];
  if (cached) return cached;

  const documentsFolderId = await ensureDocumentsFolder(orgId, clientId, period);
  if (!documentsFolderId) return null;

  const docFolderId =
    (await findChildFolder(documentsFolderId, documentName)) || (await createFolder(documentsFolderId, documentName));

  // Plain object merge (not a dotted update path) so a document name containing "." — a
  // free-form "Other documents" entry could have one — can't be misread as a nested path.
  await ref.set({ driveChecklistFolders: { [cacheKey]: docFolderId } }, { merge: true });
  return docFolderId;
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

/** Overwrites an existing Drive file's content in place — same file ID, same shareable link.
 *  Used to refresh a saved extraction's Excel copy after its fields are edited, instead of
 *  uploading a new file and leaving the stale one behind. */
export async function updateDriveFile(fileId, { mimeType, buffer }) {
  const drive = getDrive();
  const res = await drive.files.update({
    fileId,
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
      driveChecklistFolders: null,
      driveDocumentsFolders: null,
      driveConsolidatedExcel: null,
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

/** Uploads one document-checklist file into its <period>/<workflow>/<document type> folder
 *  (see ensureChecklistDocumentFolder). Returns `{ id, webViewLink }` on success, or `null` if
 *  Drive isn't configured/reachable. */
export async function uploadChecklistDocumentToDrive(orgId, clientId, period, documentName, { fileName, mimeType, buffer }) {
  const folderId = await ensureChecklistDocumentFolder(orgId, clientId, period, documentName);
  return uploadWithSelfHeal(orgId, clientId, folderId, { fileName, mimeType, buffer }, () =>
    ensureChecklistDocumentFolder(orgId, clientId, period, documentName)
  );
}

/** Uploads (or, if one already exists for this period+document type, overwrites in place) the
 *  ONE consolidated extracted-fields workbook — e.g. "Purchase Invoices extracted Aug 2026.xlsx"
 *  — sitting inside that document type's own subfolder (the same one its source images land in
 *  via uploadChecklistDocumentToDrive), not a separate location. Every extraction of that
 *  document type shares this single file instead of getting its own; see
 *  routes/handscribe.js's regenerateConsolidatedExcel for how rows are built. Cached on the
 *  client doc under `driveConsolidatedExcel`, keyed by period+document name, so this always
 *  updates the same file rather than piling up copies. */
export async function uploadConsolidatedExcelToDrive(orgId, clientId, period, documentName, { fileName, mimeType, buffer }) {
  const ref = clientRef(orgId, clientId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const client = snap.data();
  const cacheKey = `${period}__${documentName}`;
  const existingFileId = client.driveConsolidatedExcel?.[cacheKey];

  if (existingFileId) {
    try {
      // Drive happily overwrites a trashed file's content without complaint or un-trashing it
      // — checked explicitly here rather than just catching a throw, since a stale reference to
      // a trashed file would otherwise "succeed" into something invisible in the user's Drive.
      if (await driveFileExists(existingFileId)) {
        return await updateDriveFile(existingFileId, { mimeType, buffer });
      }
    } catch {
      // Some other lookup/update failure — fall through and create a fresh one below rather
      // than failing the whole save.
    }
  }

  const folderId = await ensureChecklistDocumentFolder(orgId, clientId, period, documentName);
  if (!folderId) return null;
  const created = await createDriveFile(folderId, fileName, mimeType, buffer);
  await ref.set({ driveConsolidatedExcel: { [cacheKey]: created.id } }, { merge: true });
  return created;
}

/** This client's month folders that already exist in Drive (from cache on the client doc —
 *  no live Drive query needed), newest first, for a "pick an existing invoice" browser. */
export async function listMonthFolders(orgId, clientId) {
  const snap = await clientRef(orgId, clientId).get();
  if (!snap.exists) return [];
  const map = snap.data().driveMonthFolders || {};
  return Object.entries(map)
    .map(([monthKey, folderId]) => ({ monthKey, label: monthLabelFromKey(monthKey), folderId }))
    .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));
}

/** This client's period folders ("2026 - August", ...) as they actually exist in Drive right
 *  now — a live query, not read from any Firestore cache, since this drives a filter that
 *  should only ever offer months real data actually exists for. Newest first. */
export async function listClientPeriodFolders(orgId, clientId) {
  const snap = await clientRef(orgId, clientId).get();
  if (!snap.exists) return [];
  const companyFolderId = snap.data().driveFolderId;
  if (!companyFolderId) return [];

  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${companyFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
    fields: "files(id, name)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const periods = [];
  for (const f of res.data.files || []) {
    const period = parsePeriodFolderName(f.name);
    if (period) periods.push({ period, label: f.name });
  }
  return periods.sort((a, b) => (a.period < b.period ? 1 : -1));
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

/** Whether a Drive file still exists and hasn't been trashed — used to reconcile records
 *  (e.g. an extraction's "Past extractions" entry) against a file someone deleted directly in
 *  Drive, outside the app. A transient/network error is re-thrown rather than treated as
 *  "deleted", so an outage can't wrongly wipe out records that are actually fine. */
export async function driveFileExists(fileId) {
  if (!fileId) return false;
  try {
    const drive = getDrive();
    const res = await drive.files.get({ fileId, fields: "id, trashed", supportsAllDrives: true });
    return !res.data.trashed;
  } catch (err) {
    if (err?.code === 404 || err?.response?.status === 404) return false;
    throw err;
  }
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
