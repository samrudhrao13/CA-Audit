import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import * as XLSX from "xlsx";
import { randomBytes } from "node:crypto";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { canAccessClient } from "../lib/clientAccess.js";
import { uploadInvoiceToDrive, downloadDriveFile } from "../lib/googleDrive.js";

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

const MONTH_NAMES = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Handwritten/printed invoices show dates in whatever format the source used — this pins
// every date field to dd/mm/yyyy in exports regardless of that. 2-digit years use the
// standard 79/80 pivot (26 -> 2026, 95 -> 1995); ambiguous numeric-only dates (both parts
// <=12, e.g. "03/04/2026") default to day-first per Indian date convention rather than
// guessing MM/DD.
function fullYear(y) {
  if (y >= 100) return y;
  return y <= 79 ? 2000 + y : 1900 + y;
}

function formatDdMmYyyy(day, month, year) {
  return `${pad2(day)}/${pad2(month)}/${fullYear(year)}`;
}

function normalizeDateToDdMmYyyy(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return value;

  // "15 March 2024" / "2 May 26"
  let m = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})$/);
  if (m && MONTH_NAMES[m[2].toLowerCase()]) {
    return formatDdMmYyyy(Number(m[1]), MONTH_NAMES[m[2].toLowerCase()], Number(m[3]));
  }

  // "March 15, 2024" / "May 2, 2026"
  m = value.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (m && MONTH_NAMES[m[1].toLowerCase()]) {
    return formatDdMmYyyy(Number(m[2]), MONTH_NAMES[m[1].toLowerCase()], Number(m[3]));
  }

  // "2-May-26" / "2/May/2026"
  m = value.match(/^(\d{1,2})[-/]([A-Za-z]{3,9})[-/](\d{2,4})$/);
  if (m && MONTH_NAMES[m[2].toLowerCase()]) {
    return formatDdMmYyyy(Number(m[1]), MONTH_NAMES[m[2].toLowerCase()], Number(m[3]));
  }

  // ISO-ish, year first: 2024-03-15, 2024/3/15
  m = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    return formatDdMmYyyy(Number(m[3]), Number(m[2]), Number(m[1]));
  }

  // Numeric, year last: 15-03-2024, 3/15/24, 03/04/2026 (ambiguous -> day-first)
  m = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let day, month;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      day = b;
      month = a;
    } else if (a <= 12 && b <= 12) {
      day = a;
      month = b;
    } else {
      return value; // neither part is a valid month — leave untouched rather than guess.
    }
    return formatDdMmYyyy(day, month, Number(m[3]));
  }

  // Unrecognized shape — leave as extracted rather than risk mangling it.
  return value;
}

/** Applied only to field_type "date" — every other field type passes through unchanged. */
function applyDateFormat(fields) {
  return fields.map((f) => (f.field_type === "date" && f.value ? { ...f, value: normalizeDateToDdMmYyyy(f.value) } : f));
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

    let fileBuffer, fileName, fileMimeType;
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

    res.json(result.data);
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
      const row = { "Source File": fileName || base };
      for (const f of fields) {
        row[f.name] = f.value;
      }
      const sheet = XLSX.utils.json_to_sheet([row]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Extraction");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.xlsx"`);
      return res.send(buffer);
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
        const row = { "Source File": item.fileName };
        for (const f of item.fields) row[f.name] = f.value;
        for (const key of headerOrder) if (!(key in row)) row[key] = "";
        return row;
      });
      const sheet = XLSX.utils.json_to_sheet(rows, { header: headerOrder });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Extractions");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.xlsx"`);
      return res.send(buffer);
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
    const extractionId = randomBytes(12).toString("hex");
    const canStoreFile = fileBuffer.length <= MAX_STORED_FILE_BYTES;

    // A Drive-sourced file is already up there — no need to re-upload it. A fresh upload
    // gets mirrored into Drive (company folder / this month's folder) best-effort, same as
    // before — never blocks the extraction itself if Drive isn't configured or the call fails.
    let driveFile = sourcedFromDrive
      ? { id: req.body.driveFileId, webViewLink: sourcedFromDrive.webViewLink }
      : null;
    if (!sourcedFromDrive) {
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
        createdAt: new Date().toISOString(),
        createdByUid: req.uid,
      });

    res.json({ id: extractionId, ...extraction, driveWebViewLink: driveFile?.webViewLink ?? null });
  })
);

handscribeRouter.get(
  "/extractions",
  asyncHandler(async (req, res) => {
    const client = await loadClient(req, res);
    if (!client) return;

    const snap = await clientRef(req.orgId, req.params.clientId)
      .collection("extractions")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    res.json({
      extractions: snap.docs.map((d) => {
        const { dataBase64, ...rest } = d.data();
        return { id: d.id, hasFile: !!dataBase64, ...rest };
      }),
    });
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
