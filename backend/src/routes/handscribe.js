import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import ExcelJS from "exceljs";
import { randomBytes } from "node:crypto";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { canAccessClient } from "../lib/clientAccess.js";
import {
  uploadInvoiceToDrive,
  uploadChecklistDocumentToDrive,
  uploadConsolidatedExcelToDrive,
  updateDriveFile,
  downloadDriveFile,
  driveFileExists,
  listClientPeriodFolders,
} from "../lib/googleDrive.js";
import { applyDateFormat } from "../lib/dateUtils.js";
import { applyClientIdentityOverride } from "../lib/clientIdentityOverride.js";
import { resolveChecklistMatches, markChecklistDocumentUploaded } from "../lib/documentChecklist.js";
import { currentPeriod } from "../lib/workflowProgress.js";

const HANDSCRIBE_BASE_URL = process.env.HANDSCRIBE_BASE_URL || "http://localhost:8000";

/**
 * HandScribe (see /handscribe at the repo root) is a separate Python/FastAPI
 * service doing OCR + LLM structuring of handwritten documents — it has no
 * concept of orgs/clients at all. This file is the multi-tenant layer around
 * it: every route here checks the caller can access the client first, then
 * proxies to HandScribe, then (for extractions) persists the result under
 * that client in our own Firestore so "client-wise" history lives here, not
 * in HandScribe's own local SQLite db.
 */
async function callHandscribe(method, path, { json, formData } = {}) {
  let res;
  try {
    res = await fetch(`${HANDSCRIBE_BASE_URL}${path}`, {
      method,
      headers: json ? { "Content-Type": "application/json" } : undefined,
      body: formData ?? (json ? JSON.stringify(json) : undefined),
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      message: `Couldn't reach the HandScribe extraction service at ${HANDSCRIBE_BASE_URL} — is it running? (${err.message})`,
    };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.detail === "string" ? data.detail : data?.detail ? JSON.stringify(data.detail) : `HandScribe request failed (${res.status})`;
    return { ok: false, status: res.status >= 400 && res.status < 600 ? res.status : 502, message };
  }
  return { ok: true, data };
}

/** Org-wide field templates (e.g. "GST Invoice") — shared across every client, not client-specific. */
export const handscribeTemplatesRouter = Router();
handscribeTemplatesRouter.use(requireAuth, requireCompanyMember);

handscribeTemplatesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const result = await callHandscribe("GET", "/api/templates");
    if (!result.ok) return res.status(result.status).json({ error: result.message });
    res.json({ templates: result.data });
  })
);

handscribeTemplatesRouter.post(
  "/",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const result = await callHandscribe("POST", "/api/templates", { json: req.body });
    if (!result.ok) return res.status(result.status).json({ error: result.message });
    res.status(201).json(result.data);
  })
);

handscribeTemplatesRouter.put(
  "/:templateId",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const result = await callHandscribe("PUT", `/api/templates/${req.params.templateId}`, { json: req.body });
    if (!result.ok) return res.status(result.status).json({ error: result.message });
    res.json(result.data);
  })
);

handscribeTemplatesRouter.delete(
  "/:templateId",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const result = await callHandscribe("DELETE", `/api/templates/${req.params.templateId}`);
    if (!result.ok) return res.status(result.status).json({ error: result.message });
    res.json({ ok: true });
  })
);

// HandScribe's own MAX_UPLOAD_MB defaults to 10 — match that here so a file
// that's fine for OCR doesn't get rejected a step earlier by our own proxy.
// Shared by both the client-scoped and the general (common) extract routes.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

function uploadMiddleware(req, res, next) {
  upload.single("image")(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "File must be under 10MB" : "Upload failed";
      return res.status(400).json({ error: message });
    }
    next();
  });
}

function safeFileName(name) {
  return (name || "extraction").replace(/[^a-z0-9]+/gi, "_").slice(0, 80) || "extraction";
}

function escapeXml(value) {
  return String(value ?? "").replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]
  );
}

const exportFieldSchema = z.object({
  name: z.string(),
  value: z.string().optional().default(""),
  valid: z.boolean().optional().default(false),
  required: z.boolean().optional().default(false),
  field_type: z.string().optional().default(""),
  reason: z.string().nullable().optional(),
});

const exportSchema = z.object({
  fields: z.array(exportFieldSchema).min(1),
  fileName: z.string().trim().optional().default("extraction"),
});

const exportBatchSchema = z.object({
  items: z
    .array(
      z.object({
        fields: z.array(exportFieldSchema).min(1),
        fileName: z.string().trim().optional().default("extraction"),
      })
    )
    .min(1),
  fileName: z.string().trim().optional().default("extractions"),
});

/** Union of field names across every item, in first-seen order, so the sheet/XML has a
 *  stable column order even when different files used different templates. */
function batchHeaderOrder(items) {
  const order = ["Source File"];
  const seen = new Set(order);
  for (const item of items) {
    for (const f of item.fields) {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        order.push(f.name);
      }
    }
  }
  return order;
}

// Light orange — flags a cell whose field came back marked "Check" (not confidently valid),
// same status shown as an orange dot in the app. exceljs is the one writing this export (not
// the "xlsx" package used elsewhere in the app) specifically because the free "xlsx" package
// silently drops cell styling on write — confirmed it produces no <fills> at all in the output.
const FLAG_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE0B2" } };

/** One row per extraction, one column per field, with any "Check"-status field's cell
 *  highlighted. `rows` is `[{ values: {colName: value}, invalidCols: Set<colName> }]`. */
async function buildExtractionWorkbook(headerOrder, rows, sheetName) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.addRow(headerOrder);
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const addedRow = sheet.addRow(headerOrder.map((col) => row.values[col] ?? ""));
    headerOrder.forEach((col, i) => {
      if (row.invalidCols.has(col)) {
        addedRow.getCell(i + 1).fill = FLAG_FILL;
      }
    });
  }

  sheet.columns.forEach((col) => {
    col.width = 18;
  });

  return workbook.xlsx.writeBuffer();
}

/** Same single-row shape /export/xlsx builds, but straight from a saved extraction's stored
 *  fields — reused both right after extraction (to save an editable Excel copy alongside the
 *  source file) and whenever that extraction's fields are edited later (routes below), so
 *  fixing a value never requires re-running the paid OCR/LLM extraction just to get a fresh
 *  spreadsheet out of it. */
function buildFieldsWorkbook(fileName, fields) {
  const headerOrder = ["Source File", ...fields.map((f) => f.name)];
  const values = { "Source File": fileName };
  const invalidCols = new Set();
  for (const f of fields) {
    values[f.name] = f.value;
    if (!f.valid) invalidCols.add(f.name);
  }
  return buildExtractionWorkbook(headerOrder, [{ values, invalidCols }], "Extraction");
}

/**
 * General-purpose (not tied to any client) extraction + export — the
 * "common extractor" every company member can reach from the sidebar,
 * separate from the admin-only template management page and from the
 * per-client extractor embedded in a client's own page. Results here
 * aren't persisted anywhere; export happens straight from what's already
 * in the browser's state, which is also why /export takes the field data
 * directly in the request body instead of an extraction ID to look up.
 */
export const handscribeGeneralRouter = Router();
handscribeGeneralRouter.use(requireAuth, requireCompanyMember);

handscribeGeneralRouter.post(
  "/extract",
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    if (!req.file && !req.body.driveFileId) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    if (!req.body.templateId && !req.body.fieldsJson) {
      return res.status(400).json({ error: "Provide a templateId or fieldsJson describing the fields to extract" });
    }

    let fileBuffer, fileName, fileMimeType, clientData;
    if (req.file) {
      fileBuffer = req.file.buffer;
      fileName = req.file.originalname;
      fileMimeType = req.file.mimetype;
    } else {
      // Drive files are organized per client — confirm the caller can actually access the
      // client this file is supposed to belong to before fetching it, same as the per-client
      // extractor route does implicitly via its :clientId path param.
      if (!req.body.clientId) {
        return res.status(400).json({ error: "clientId is required when extracting a file from Drive" });
      }
      const clientSnap = await db
        .collection("organizations")
        .doc(req.orgId)
        .collection("clients")
        .doc(req.body.clientId)
        .get();
      if (!clientSnap.exists || !canAccessClient(req, clientSnap.data())) {
        return res.status(403).json({ error: "This client isn't assigned to you" });
      }
      clientData = clientSnap.data();

      try {
        const driveSource = await downloadDriveFile(req.body.driveFileId);
        fileBuffer = driveSource.buffer;
        fileName = driveSource.name;
        fileMimeType = driveSource.mimeType;
      } catch (err) {
        return res.status(400).json({ error: `Couldn't read that file from Drive: ${err.message}` });
      }
      if (fileBuffer.length > MAX_UPLOAD_BYTES) {
        return res.status(400).json({ error: "File must be under 10MB" });
      }
    }

    const formData = new FormData();
    formData.append("image", new Blob([fileBuffer], { type: fileMimeType }), fileName);
    if (req.body.templateId) formData.append("template_id", req.body.templateId);
    if (req.body.fieldsJson) formData.append("fields_json", req.body.fieldsJson);

    const result = await callHandscribe("POST", "/api/extract", { formData });
    if (!result.ok) return res.status(result.status).json({ error: result.message });

    const data = clientData ? { ...result.data, fields: applyClientIdentityOverride(result.data.fields, clientData) } : result.data;
    res.json(data);
  })
);

/** Shared by the common extractor and the per-client one — both already have the extracted
 *  field data client-side, so export just transforms what's given rather than looking anything up. */
handscribeGeneralRouter.post(
  "/export/:format",
  asyncHandler(async (req, res) => {
    if (req.params.format !== "xlsx" && req.params.format !== "xml") {
      return res.status(400).json({ error: "format must be xlsx or xml" });
    }
    const parsed = exportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid export data" });
    }
    const { fileName } = parsed.data;
    const fields = applyDateFormat(parsed.data.fields);
    const base = safeFileName(fileName);

    if (req.params.format === "xlsx") {
      // One row per extraction, one column per field — matches how the user wants to
      // stack multiple extractions into a single running sheet, rather than one row
      // per field (which read as a fixed 5-column report, not tabular data).
      const headerOrder = ["Source File", ...fields.map((f) => f.name)];
      const values = { "Source File": fileName || base };
      const invalidCols = new Set();
      for (const f of fields) {
        values[f.name] = f.value;
        if (!f.valid) invalidCols.add(f.name);
      }
      const buffer = await buildExtractionWorkbook(headerOrder, [{ values, invalidCols }], "Extraction");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.xlsx"`);
      return res.send(Buffer.from(buffer));
    }

    const xmlFields = fields
      .map((f) => {
        const reasonTag = f.reason ? `\n    <reason>${escapeXml(f.reason)}</reason>` : "";
        return `  <field>
    <name>${escapeXml(f.name)}</name>
    <value>${escapeXml(f.value)}</value>
    <valid>${f.valid ? "true" : "false"}</valid>
    <required>${f.required ? "true" : "false"}</required>
    <type>${escapeXml(f.field_type)}</type>${reasonTag}
  </field>`;
      })
      .join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<extraction>\n${xmlFields}\n</extraction>\n`;
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", `attachment; filename="${base}.xml"`);
    res.send(xml);
  })
);

/** Combined export for a batch of extractions (e.g. 10 files run through the extractor at
 *  once) — one row per file for xlsx, one <extraction> block per file for xml, instead of
 *  making the user download and stitch together N separate files by hand. */
handscribeGeneralRouter.post(
  "/export-batch/:format",
  asyncHandler(async (req, res) => {
    if (req.params.format !== "xlsx" && req.params.format !== "xml") {
      return res.status(400).json({ error: "format must be xlsx or xml" });
    }
    const parsed = exportBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid export data" });
    }
    const { fileName } = parsed.data;
    const items = parsed.data.items.map((item) => ({ ...item, fields: applyDateFormat(item.fields) }));
    const base = safeFileName(fileName);

    if (req.params.format === "xlsx") {
      const headerOrder = batchHeaderOrder(items);
      const rows = items.map((item) => {
        const values = { "Source File": item.fileName };
        const invalidCols = new Set();
        for (const f of item.fields) {
          values[f.name] = f.value;
          if (!f.valid) invalidCols.add(f.name);
        }
        return { values, invalidCols };
      });
      const buffer = await buildExtractionWorkbook(headerOrder, rows, "Extractions");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.xlsx"`);
      return res.send(Buffer.from(buffer));
    }

    const extractionBlocks = items
      .map((item) => {
        const xmlFields = item.fields
          .map((f) => {
            const reasonTag = f.reason ? `\n      <reason>${escapeXml(f.reason)}</reason>` : "";
            return `    <field>
      <name>${escapeXml(f.name)}</name>
      <value>${escapeXml(f.value)}</value>
      <valid>${f.valid ? "true" : "false"}</valid>
      <required>${f.required ? "true" : "false"}</required>
      <type>${escapeXml(f.field_type)}</type>${reasonTag}
    </field>`;
          })
          .join("\n");
        return `  <extraction source_file="${escapeXml(item.fileName)}">\n${xmlFields}\n  </extraction>`;
      })
      .join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<extractions>\n${extractionBlocks}\n</extractions>\n`;
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", `attachment; filename="${base}.xml"`);
    res.send(xml);
  })
);

/** Client-scoped extraction — mounted at /api/clients/:clientId/handscribe (mergeParams). */
export const handscribeRouter = Router({ mergeParams: true });
handscribeRouter.use(requireAuth, requireCompanyMember);

// Firestore documents cap out at 1MiB; only keep a copy of the original
// image/PDF alongside the extraction when it comfortably fits. Extraction
// still runs against the full file either way — this only affects whether
// we can show/redownload the original afterward.
const MAX_STORED_FILE_BYTES = 500 * 1024;

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

/** Union of field names across every extraction, in first-seen order — same logic as the
 *  frontend's ExtractionGrid, so the consolidated workbook's columns match what the in-app
 *  bulk-edit grid shows for the same set of extractions. */
function unionFieldNames(fieldLists) {
  const order = [];
  const seen = new Set();
  for (const fields of fieldLists) {
    for (const f of fields) {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        order.push(f.name);
      }
    }
  }
  return order;
}

/** "Aug 2026" from a "YYYY-MM" period — used in the consolidated workbook's filename so it
 *  reads naturally (e.g. "Purchase Invoices extracted Aug 2026.xlsx") without needing to open
 *  it to know which period it covers. */
function shortPeriodLabel(period) {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

/** Whether this exact file (by name, case-insensitive) has already been extracted for this
 *  client, and if so, the Drive reference it was saved under — checked server-side so a
 *  duplicate physical upload can't happen no matter what the frontend's own "upload again
 *  anyway?" confirmation does. Scans this client's most recent extractions rather than doing an
 *  exact-match Firestore query, since Firestore can't compare case-insensitively. */
async function findDriveFileForDuplicateName(orgId, clientId, fileName) {
  const target = (fileName || "").trim().toLowerCase();
  if (!target) return null;
  const snap = await clientRef(orgId, clientId).collection("extractions").orderBy("createdAt", "desc").limit(200).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if ((data.fileName || "").trim().toLowerCase() === target && data.driveFileId) {
      return { id: data.driveFileId, webViewLink: data.driveWebViewLink };
    }
  }
  return null;
}

/** Rebuilds the ONE consolidated "<document type> extracted <Mon YYYY>.xlsx" for every
 *  extraction of that document type in this period, from what's currently stored in Firestore
 *  (the source of truth) — one row per extraction, newest last. Lives inside that document
 *  type's own subfolder, alongside its source images. Called after every new extraction of that
 *  type and after every field edit, so the file in Drive always matches what's saved in the
 *  app, without ever needing to be parsed back apart. Also stamps the resulting file's ID/link
 *  onto every contributing extraction record, so each one's "Excel" link and future edits
 *  target the same shared file. Returns `{ id, webViewLink }`, or `null` if there's nothing to
 *  build yet — any template can end up here, not just Purchase/Sales invoices, since matching
 *  is purely by document name (see resolveChecklistMatches), not a hardcoded list. */
async function regenerateConsolidatedExcel(orgId, clientId, period, documentName) {
  const collRef = clientRef(orgId, clientId).collection("extractions");
  const snap = await collRef.where("checklistDocumentName", "==", documentName).where("period", "==", period).get();
  if (snap.empty) return null;

  const docs = snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .sort((a, b) => (a.data.createdAt || "").localeCompare(b.data.createdAt || ""));

  const headerOrder = ["Source File", ...unionFieldNames(docs.map(({ data }) => data.fields || []))];
  const rows = docs.map(({ data }) => {
    const values = { "Source File": data.fileName };
    const invalidCols = new Set();
    for (const f of data.fields || []) {
      values[f.name] = f.value;
      if (!f.valid) invalidCols.add(f.name);
    }
    return { values, invalidCols };
  });

  const sheetName = documentName.replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Extractions";
  const buffer = await buildExtractionWorkbook(headerOrder, rows, sheetName);
  const excelFile = await uploadConsolidatedExcelToDrive(orgId, clientId, period, documentName, {
    fileName: `${documentName} extracted ${shortPeriodLabel(period)}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(buffer),
  });

  if (excelFile) {
    const batch = db.batch();
    for (const { id } of docs) {
      batch.update(collRef.doc(id), { excelDriveFileId: excelFile.id, excelDriveWebViewLink: excelFile.webViewLink });
    }
    await batch.commit();
  }
  return excelFile;
}

handscribeRouter.post(
  "/extract",
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;

    if (!req.file && !req.body.driveFileId) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    if (!req.body.templateId && !req.body.fieldsJson) {
      return res.status(400).json({ error: "Provide a templateId or fieldsJson describing the fields to extract" });
    }

    // Either a fresh multipart upload, or a reference to a file already sitting in this
    // client's Drive folder — either way we end up with the same buffer/name/mimeType to
    // hand to HandScribe below.
    let fileBuffer, fileName, fileMimeType, sourcedFromDrive;
    if (req.file) {
      fileBuffer = req.file.buffer;
      fileName = req.file.originalname;
      fileMimeType = req.file.mimetype;
    } else {
      try {
        sourcedFromDrive = await downloadDriveFile(req.body.driveFileId);
      } catch (err) {
        return res.status(400).json({ error: `Couldn't read that file from Drive: ${err.message}` });
      }
      fileBuffer = sourcedFromDrive.buffer;
      fileName = sourcedFromDrive.name;
      fileMimeType = sourcedFromDrive.mimeType;
      if (fileBuffer.length > MAX_UPLOAD_BYTES) {
        return res.status(400).json({ error: "File must be under 10MB" });
      }
    }

    const formData = new FormData();
    formData.append("image", new Blob([fileBuffer], { type: fileMimeType }), fileName);
    if (req.body.templateId) formData.append("template_id", req.body.templateId);
    if (req.body.fieldsJson) formData.append("fields_json", req.body.fieldsJson);
    if (req.body.verificationsJson) formData.append("verifications_json", req.body.verificationsJson);

    const result = await callHandscribe("POST", "/api/extract", { formData });
    if (!result.ok) return res.status(result.status).json({ error: result.message });

    const extraction = result.data;
    extraction.fields = applyClientIdentityOverride(extraction.fields, client);
    const extractionId = randomBytes(12).toString("hex");
    const canStoreFile = fileBuffer.length <= MAX_STORED_FILE_BYTES;

    // If this file's template name matches a document this client's checklist is waiting on
    // (e.g. template "Purchase Invoice" vs. checklist item "Purchase Invoices"), it gets filed
    // straight into that checklist slot's own Drive folder (<client>/<period>/<workflow>/
    // <document type>) and marked received — same place a manual checklist upload would land,
    // so there's no reason to make the user upload the same file again on the checklist page.
    // Anything that doesn't match a checklist item falls back to the flat invoice/month folder,
    // same as before.
    const checklistMatches = resolveChecklistMatches(client, extraction.template_name);
    const period = currentPeriod();

    // Server-side duplicate guard: this exact file (by name) may already have been extracted
    // and uploaded for this client before — reuse that Drive reference rather than creating a
    // second physical copy. Enforced here, not just as the frontend's "upload again anyway?"
    // confirmation, so a duplicate can't slip through regardless of what the browser does.
    const duplicateDriveFile = sourcedFromDrive ? null : await findDriveFileForDuplicateName(req.orgId, req.params.clientId, fileName);

    let driveFile = sourcedFromDrive
      ? { id: req.body.driveFileId, webViewLink: sourcedFromDrive.webViewLink }
      : duplicateDriveFile;

    // Best-effort — never blocks the extraction itself if Drive isn't configured or a call
    // fails. Uploaded once per distinct document name, not once per matched workflow — GST and
    // TDS often share the exact same checklist item (e.g. both want "Purchase Invoices"), and
    // it's the same physical document either way, so every match with that document name reuses
    // the one upload instead of duplicating it in Drive. A file already sourced from Drive, or
    // already uploaded once under this same name, isn't re-uploaded — the same existing Drive
    // reference is reused for every match instead.
    const checklistDriveFiles = [];
    if (checklistMatches.length > 0) {
      const uploadedByDocName = new Map();
      for (const match of checklistMatches) {
        if (sourcedFromDrive || duplicateDriveFile) {
          checklistDriveFiles.push({ match, driveFile });
          continue;
        }
        if (!uploadedByDocName.has(match.documentName)) {
          try {
            const uploaded = await uploadChecklistDocumentToDrive(req.orgId, req.params.clientId, period, match.documentName, {
              fileName,
              mimeType: fileMimeType,
              buffer: fileBuffer,
            });
            uploadedByDocName.set(match.documentName, uploaded);
          } catch (err) {
            console.error(`Drive: failed to upload checklist document for client ${req.params.clientId} (${match.documentName}):`, err.message);
            uploadedByDocName.set(match.documentName, null);
          }
        }
        checklistDriveFiles.push({ match, driveFile: uploadedByDocName.get(match.documentName) });
      }
      // The extraction record itself (and the "Past extractions" list) shows one representative
      // link — the first matched document's copy (unless this is a Drive-sourced or duplicate
      // file, which already has its own single reference set above).
      if (!sourcedFromDrive && !duplicateDriveFile) driveFile = checklistDriveFiles[0]?.driveFile ?? null;
    } else if (!sourcedFromDrive && !duplicateDriveFile) {
      try {
        driveFile = await uploadInvoiceToDrive(req.orgId, req.params.clientId, {
          fileName,
          mimeType: fileMimeType,
          buffer: fileBuffer,
        });
      } catch (err) {
        console.error(`Drive: failed to upload invoice for client ${req.params.clientId}:`, err.message);
      }
    }

    // Which document type (if any) this extraction's fields will be consolidated under —
    // stamped on the record now so regenerateConsolidatedExcel can find every extraction of
    // this type for this period with a plain Firestore query.
    const checklistDocumentName = checklistMatches[0]?.documentName ?? null;

    await clientRef(req.orgId, req.params.clientId)
      .collection("extractions")
      .doc(extractionId)
      .set({
        templateId: extraction.template_id ?? null,
        templateName: extraction.template_name ?? null,
        fields: extraction.fields ?? [],
        verifications: extraction.verifications ?? [],
        rawOcrText: extraction.raw_ocr_text ?? "",
        fileName,
        mimeType: fileMimeType,
        dataBase64: canStoreFile ? fileBuffer.toString("base64") : null,
        fileTooLargeToStore: !canStoreFile,
        driveFileId: driveFile?.id ?? null,
        driveWebViewLink: driveFile?.webViewLink ?? null,
        checklistDocumentName,
        period,
        excelDriveFileId: null,
        excelDriveWebViewLink: null,
        createdAt: new Date().toISOString(),
        createdByUid: req.uid,
      });

    // Excel copy of the extracted fields. For a checklist-matched document (Purchase/Sales
    // invoice, etc.) this regenerates the ONE shared "<document type> extracted file.xlsx" that
    // every extraction of that type in this period contributes a row to, rather than spawning a
    // new file per extraction. Anything unmatched — no document type to group under — still
    // gets its own individual copy, same as before.
    let excelDriveFile = null;
    try {
      if (checklistDocumentName) {
        excelDriveFile = await regenerateConsolidatedExcel(req.orgId, req.params.clientId, period, checklistDocumentName);
      } else {
        const excelBuffer = await buildFieldsWorkbook(fileName, extraction.fields ?? []);
        excelDriveFile = await uploadInvoiceToDrive(req.orgId, req.params.clientId, {
          fileName: `${fileName.replace(/\.[^./]+$/, "")}.xlsx`,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: Buffer.from(excelBuffer),
        });
        if (excelDriveFile) {
          await clientRef(req.orgId, req.params.clientId).collection("extractions").doc(extractionId).update({
            excelDriveFileId: excelDriveFile.id,
            excelDriveWebViewLink: excelDriveFile.webViewLink,
          });
        }
      }
    } catch (err) {
      console.error(`Drive: failed to update Excel copy for client ${req.params.clientId}:`, err.message);
    }

    for (const { match, driveFile: matchDriveFile } of checklistDriveFiles) {
      const selection = client.documentChecklistConfig?.[match.workflowKey];
      const requiredDocuments = [...(selection?.predefinedSelected || []), ...(selection?.otherDocuments || [])];
      try {
        await markChecklistDocumentUploaded({
          orgId: req.orgId,
          clientId: req.params.clientId,
          workflowKey: match.workflowKey,
          requiredDocuments,
          documentName: match.documentName,
          period,
          fileName,
          fileSize: fileBuffer.length,
          mimeType: fileMimeType,
          dataBase64: canStoreFile ? fileBuffer.toString("base64") : null,
          driveFileId: matchDriveFile?.id ?? null,
          driveWebViewLink: matchDriveFile?.webViewLink ?? null,
          uploadedByUid: req.uid,
          source: "extraction",
        });
      } catch (err) {
        console.error(`Checklist auto-fulfill failed for client ${req.params.clientId} (${match.workflowKey}/${match.documentName}):`, err.message);
      }
    }

    res.json({
      id: extractionId,
      ...extraction,
      driveWebViewLink: driveFile?.webViewLink ?? null,
      excelDriveWebViewLink: excelDriveFile?.webViewLink ?? null,
      checklistMatches,
    });
  })
);

handscribeRouter.get(
  "/extractions",
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;

    // Filtering by ?period=YYYY-MM (the frontend's mandatory month picker) queries Firestore
    // directly rather than paging through everything, so an older month's extractions aren't
    // silently cut off by the unfiltered list's 50-record cap.
    let query = clientRef(req.orgId, req.params.clientId).collection("extractions");
    if (req.query.period) {
      query = query.where("period", "==", String(req.query.period)).limit(200);
    } else {
      query = query.orderBy("createdAt", "desc").limit(50);
    }
    const snap = await query.get();
    const extractions = snap.docs.map((d) => {
      const { dataBase64, ...rest } = d.data();
      return { id: d.id, hasFile: !!dataBase64, ...rest };
    });
    extractions.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json({ extractions });
  })
);

/** Which months actually have data for this client in Drive right now — drives the "Past
 *  extractions" month picker, so it only ever offers a month that really has something in it
 *  instead of an open-ended date range. */
handscribeRouter.get(
  "/extraction-periods",
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;

    const periods = await listClientPeriodFolders(req.orgId, req.params.clientId);
    res.json({ periods });
  })
);

/** Removes the Firestore record for any extraction whose source file was deleted (or moved to
 *  trash) directly in Google Drive, outside the app — so "Past extractions" doesn't keep
 *  showing entries pointing at nothing. Run by the frontend when the history list is opened,
 *  not on every poll, to keep Drive API usage bounded. Only checks extractions that actually
 *  have a Drive-linked source file; one with Drive sync never configured is left alone. */
handscribeRouter.post(
  "/extractions/reconcile",
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;

    const collRef = clientRef(req.orgId, req.params.clientId).collection("extractions");
    const snap = await collRef.where("driveFileId", "!=", null).limit(200).get();

    let removed = 0;
    for (const doc of snap.docs) {
      const { driveFileId } = doc.data();
      try {
        const exists = await driveFileExists(driveFileId);
        if (!exists) {
          await doc.ref.delete();
          removed++;
        }
      } catch (err) {
        console.error(`Drive: couldn't check file ${driveFileId} for extraction ${doc.id}:`, err.message);
      }
    }
    res.json({ removed });
  })
);

const updateExtractionFieldsSchema = z.object({
  fields: z.array(exportFieldSchema).min(1),
});

/** Edits a past extraction's field values in place — no re-extraction, no HandScribe call.
 *  Just rewrites the stored `fields` and regenerates the saved Excel copy from them, overwriting
 *  it in Drive so the same shareable link keeps working. This is the whole point: fixing a
 *  misread value shouldn't cost another OCR/LLM run. */
handscribeRouter.put(
  "/extractions/:extractionId",
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;

    const parsed = updateExtractionFieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid fields" });
    }
    const { fields } = parsed.data;

    const ref = clientRef(req.orgId, req.params.clientId).collection("extractions").doc(req.params.extractionId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Extraction not found" });
    }
    const existing = snap.data();

    // Fields first — regenerateConsolidatedExcel re-queries Firestore for every extraction of
    // this document type, so it needs to see the edited values already saved.
    await ref.update({ fields, updatedAt: new Date().toISOString(), updatedByUid: req.uid });

    let excelDriveFileId = existing.excelDriveFileId ?? null;
    let excelDriveWebViewLink = existing.excelDriveWebViewLink ?? null;
    try {
      if (existing.checklistDocumentName && existing.period) {
        const excelFile = await regenerateConsolidatedExcel(req.orgId, req.params.clientId, existing.period, existing.checklistDocumentName);
        if (excelFile) {
          excelDriveFileId = excelFile.id;
          excelDriveWebViewLink = excelFile.webViewLink;
        }
      } else {
        // Unmatched extraction — no document type to consolidate under, so it keeps its own
        // individual file, updated in place (or created now if it predates this feature).
        const excelBuffer = await buildFieldsWorkbook(existing.fileName || "extraction", fields);
        const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (excelDriveFileId) {
          const updated = await updateDriveFile(excelDriveFileId, { mimeType, buffer: Buffer.from(excelBuffer) });
          excelDriveWebViewLink = updated.webViewLink;
        } else {
          const uploaded = await uploadInvoiceToDrive(req.orgId, req.params.clientId, {
            fileName: `${(existing.fileName || "extraction").replace(/\.[^./]+$/, "")}.xlsx`,
            mimeType,
            buffer: Buffer.from(excelBuffer),
          });
          if (uploaded) {
            excelDriveFileId = uploaded.id;
            excelDriveWebViewLink = uploaded.webViewLink;
          }
        }
        await ref.update({ excelDriveFileId, excelDriveWebViewLink });
      }
    } catch (err) {
      console.error(`Drive: failed to refresh Excel copy for extraction ${req.params.extractionId}:`, err.message);
    }

    res.json({ id: req.params.extractionId, fields, excelDriveFileId, excelDriveWebViewLink });
  })
);

handscribeRouter.get(
  "/extractions/:extractionId/file",
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;

    const snap = await clientRef(req.orgId, req.params.clientId)
      .collection("extractions")
      .doc(req.params.extractionId)
      .get();
    if (!snap.exists || !snap.data().dataBase64) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = snap.data();
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${file.fileName}"`);
    res.send(Buffer.from(file.dataBase64, "base64"));
  })
);
