import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { normalizeDateToDdMmYyyy, periodFromDdMmYyyy } from "./dateUtils.js";

/**
 * GSTR-2B reconciliation: compares a client's purchase-invoice Excel against the government's
 * GSTR-2B statement (B2B sheet only — credit/debit notes, ISD, imports etc. are out of scope,
 * since those aren't "invoices" in the sense being compared here) for one period, keyed on
 * supplier GSTIN + invoice number.
 *
 * Both sides are uploaded directly as Excel files — the GSTR-2B is the real government export,
 * the Invoice Excel is a fixed layout this app defines (see INVOICE_EXCEL_COLUMNS) that the
 * firm fills in with the client's purchase invoices for the period.
 */

export const INVOICE_EXCEL_COLUMNS = [
  { key: "gstin", header: "GSTIN" },
  { key: "invoiceNumber", header: "Invoice Number" },
  { key: "invoiceDate", header: "Invoice Date" },
  { key: "taxableValue", header: "Taxable Value" },
  { key: "igst", header: "IGST" },
  { key: "cgst", header: "CGST" },
  { key: "sgst", header: "SGST" },
];
const INVOICE_EXCEL_COLUMN_KEYS = INVOICE_EXCEL_COLUMNS.map((c) => c.key);

// Rupees — absorbs paise-level rounding differences between the two files, without treating
// every rounding blip as a real mismatch.
const AMOUNT_TOLERANCE = 1;

function parseAmount(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeGstin(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeInvoiceNumber(value) {
  return String(value ?? "").trim().toUpperCase();
}

function matchKey(gstin, invoiceNumber) {
  return `${normalizeGstin(gstin)}|${normalizeInvoiceNumber(invoiceNumber)}`;
}

function sheetRows(buffer, sheetName) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const name = sheetName ?? workbook.SheetNames[0];
  if (!workbook.Sheets[name]) {
    throw new Error(`Couldn't find a "${name}" sheet in this file. Sheets found: ${workbook.SheetNames.join(", ")}`);
  }
  return { rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }), sheetNames: workbook.SheetNames };
}

/** Finds the header row by scanning the first few rows for one that satisfies every marker —
 *  handles files with title/metadata rows before the real column headers. */
function findHeaderRowIndex(rows, markers, maxScan = 10) {
  for (let i = 0; i < Math.min(maxScan, rows.length); i++) {
    const row = rows[i].map((c) => String(c ?? "").toLowerCase());
    if (markers.every((test) => row.some((c) => test(c)))) return i;
  }
  return -1;
}

/** Merges two adjacent header rows column-by-column, preferring the lower (child) row's text
 *  and falling back to the upper (group) row's — handles the GSTN portal's actual B2B layout,
 *  where a group header ("Invoice Details", "Tax Amount") spans several columns on one row and
 *  the real per-column names ("Invoice number", "Integrated Tax(₹)", ...) sit on the row below,
 *  with columns that have no sub-header (e.g. "GSTIN of supplier") left blank underneath. */
function mergeHeaderRows(parentRow, childRow) {
  const width = Math.max(parentRow.length, childRow?.length ?? 0);
  const merged = [];
  for (let col = 0; col < width; col++) {
    const child = String(childRow?.[col] ?? "").trim();
    const parent = String(parentRow[col] ?? "").trim();
    merged.push(child || parent);
  }
  return merged;
}

/** Like findHeaderRowIndex, but also tries merging each candidate row with the row beneath it
 *  (see mergeHeaderRows) before giving up — for exports whose real header spans two rows. */
function findHeaders(rows, markers, maxScan = 15) {
  for (let i = 0; i < Math.min(maxScan, rows.length); i++) {
    const single = rows[i].map((c) => String(c ?? "").toLowerCase());
    if (markers.every((test) => single.some((c) => test(c)))) {
      return { headers: rows[i].map((c) => String(c ?? "").trim()), dataStartIndex: i + 1 };
    }
    if (i + 1 < rows.length) {
      const merged = mergeHeaderRows(rows[i], rows[i + 1]);
      const mergedLower = merged.map((h) => h.toLowerCase());
      if (markers.every((test) => mergedLower.some((c) => test(c)))) {
        return { headers: merged, dataStartIndex: i + 2 };
      }
    }
  }
  return null;
}

// GSTR-2B B2B header text -> canonical key, matched by the stable distinguishing substring
// rather than the full header, since the GSTN portal's exact wording has shifted across
// versions.
const GSTR2B_HEADER_MATCHERS = [
  { key: "gstin", test: (h) => h.includes("gstin") && h.includes("supplier") },
  { key: "invoiceNumber", test: (h) => h.includes("invoice number") },
  { key: "invoiceDate", test: (h) => h.includes("invoice date") },
  { key: "taxableValue", test: (h) => h.includes("taxable value") },
  { key: "igst", test: (h) => h.includes("integrated tax") },
  { key: "cgst", test: (h) => h.includes("central tax") },
  { key: "sgst", test: (h) => h.includes("state/ut tax") || h.includes("state tax") },
];

/** Parses the B2B sheet of a GSTR-2B portal export (.xlsx buffer) into reconciliation-ready
 *  rows. Throws a descriptive error rather than guessing if the file doesn't look right. */
export function parseGstr2bWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === "b2b");
  if (!sheetName) {
    throw new Error(`Couldn't find a "B2B" sheet in this file. Sheets found: ${workbook.SheetNames.join(", ")}`);
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
  const found = findHeaders(rows, [
    (h) => h.includes("gstin") && h.includes("supplier"),
    (h) => h.includes("invoice number"),
  ]);
  if (!found) {
    throw new Error(
      'Couldn\'t find the B2B header row (looking for "GSTIN of supplier" and "Invoice number" columns) in the first 15 rows of the B2B sheet.'
    );
  }

  const headers = found.headers.map((h) => h.toLowerCase());
  const colIndexByKey = {};
  headers.forEach((header, i) => {
    const matcher = GSTR2B_HEADER_MATCHERS.find((m) => m.test(header));
    if (matcher && !(matcher.key in colIndexByKey)) {
      colIndexByKey[matcher.key] = i;
    }
  });

  const missing = INVOICE_EXCEL_COLUMN_KEYS.filter((k) => !(k in colIndexByKey));
  if (missing.length > 0) {
    throw new Error(`Couldn't find these expected B2B columns in the file: ${missing.join(", ")}`);
  }

  const entries = [];
  for (const row of rows.slice(found.dataStartIndex)) {
    const gstin = row[colIndexByKey.gstin];
    const invoiceNumber = row[colIndexByKey.invoiceNumber];
    if (!gstin || !invoiceNumber) continue; // trailing blank/total rows

    entries.push({
      gstin: normalizeGstin(gstin),
      invoiceNumber: normalizeInvoiceNumber(invoiceNumber),
      invoiceDate: String(row[colIndexByKey.invoiceDate] ?? "").trim(),
      taxableValue: parseAmount(row[colIndexByKey.taxableValue]),
      igst: parseAmount(row[colIndexByKey.igst]),
      cgst: parseAmount(row[colIndexByKey.cgst]),
      sgst: parseAmount(row[colIndexByKey.sgst]),
    });
  }
  return entries;
}

/** Parses the client's Invoice Excel (see INVOICE_EXCEL_COLUMNS for the required columns —
 *  any order, first sheet, header row anywhere in the first 10 rows) and keeps only rows whose
 *  Invoice Date falls in `period` (YYYY-MM). A row with an unparseable date is skipped and
 *  counted separately rather than guessed at. */
export function parseInvoiceExcel(buffer, period) {
  const { rows } = sheetRows(buffer);
  const headerRowIndex = findHeaderRowIndex(rows, [
    (h) => h === "gstin" || h.includes("gstin"),
    (h) => h.includes("invoice number"),
  ]);
  if (headerRowIndex === -1) {
    throw new Error(
      `Couldn't find the header row. The Invoice Excel needs these columns: ${INVOICE_EXCEL_COLUMNS.map((c) => c.header).join(", ")}.`
    );
  }

  const headers = rows[headerRowIndex].map((c) => String(c ?? "").trim().toLowerCase());
  const colIndexByKey = {};
  for (const { key, header } of INVOICE_EXCEL_COLUMNS) {
    let idx = -1;
    if (key === "gstin") {
      // A Purchase Invoice export also has the buyer's (the firm's own) GSTIN column —
      // reconciliation needs the *supplier's* GSTIN, so prefer a vendor/supplier-qualified
      // header and explicitly skip anything that reads as the buyer's own GSTIN.
      idx = headers.findIndex((h) => h.includes("gstin") && (h.includes("vendor") || h.includes("supplier")));
      if (idx === -1) {
        idx = headers.findIndex((h) => h.includes("gstin") && !h.includes("buyer") && !h.includes("your co"));
      }
    } else {
      idx = headers.findIndex((h) => h === header.toLowerCase() || h.includes(header.toLowerCase()));
    }
    if (idx !== -1) colIndexByKey[key] = idx;
  }

  const missing = INVOICE_EXCEL_COLUMN_KEYS.filter((k) => !(k in colIndexByKey));
  if (missing.length > 0) {
    const missingHeaders = INVOICE_EXCEL_COLUMNS.filter((c) => missing.includes(c.key)).map((c) => c.header);
    throw new Error(`The Invoice Excel is missing these columns: ${missingHeaders.join(", ")}.`);
  }

  const [wantYear, wantMonth] = period.split("-").map(Number);
  const rowsOut = [];
  let outsidePeriod = 0;
  let unparseableDate = 0;

  for (const row of rows.slice(headerRowIndex + 1)) {
    const gstin = row[colIndexByKey.gstin];
    const invoiceNumber = row[colIndexByKey.invoiceNumber];
    if (!gstin || !invoiceNumber) continue; // trailing blank rows

    const invoiceDate = normalizeDateToDdMmYyyy(String(row[colIndexByKey.invoiceDate] ?? "").trim());
    const parsedPeriod = periodFromDdMmYyyy(invoiceDate);
    if (!parsedPeriod) {
      unparseableDate++;
      continue;
    }
    if (parsedPeriod.year !== wantYear || parsedPeriod.month !== wantMonth) {
      outsidePeriod++;
      continue;
    }

    rowsOut.push({
      gstin: normalizeGstin(gstin),
      invoiceNumber: normalizeInvoiceNumber(invoiceNumber),
      invoiceDate,
      taxableValue: parseAmount(row[colIndexByKey.taxableValue]),
      igst: parseAmount(row[colIndexByKey.igst]),
      cgst: parseAmount(row[colIndexByKey.cgst]),
      sgst: parseAmount(row[colIndexByKey.sgst]),
    });
  }

  return { rows: rowsOut, outsidePeriod, unparseableDate };
}

/** Compares GSTR-2B rows against the client's own invoice rows for the same period, keyed on
 *  normalized GSTIN + invoice number. */
export function reconcile(gstr2bRows, clientRows) {
  const gstr2bByKey = new Map(gstr2bRows.map((row) => [matchKey(row.gstin, row.invoiceNumber), row]));
  const clientByKey = new Map(clientRows.map((row) => [matchKey(row.gstin, row.invoiceNumber), row]));

  const matched = [];
  const mismatched = [];
  const clientOnly = [];
  const gstr2bOnly = [];

  for (const [key, clientRow] of clientByKey) {
    const gstr2bRow = gstr2bByKey.get(key);
    if (!gstr2bRow) {
      clientOnly.push(clientRow);
      continue;
    }
    const differs =
      Math.abs(clientRow.taxableValue - gstr2bRow.taxableValue) > AMOUNT_TOLERANCE ||
      Math.abs(clientRow.igst - gstr2bRow.igst) > AMOUNT_TOLERANCE ||
      Math.abs(clientRow.cgst - gstr2bRow.cgst) > AMOUNT_TOLERANCE ||
      Math.abs(clientRow.sgst - gstr2bRow.sgst) > AMOUNT_TOLERANCE;
    (differs ? mismatched : matched).push({ client: clientRow, gstr2b: gstr2bRow });
  }

  for (const [key, gstr2bRow] of gstr2bByKey) {
    if (!clientByKey.has(key)) gstr2bOnly.push(gstr2bRow);
  }

  // The ITC on invoices the client claims that GSTR-2B doesn't back up can't legitimately be
  // availed under Section 16(2)(aa)/Rule 36(4) — this is the principal amount that reversal
  // would cover, not the full corrective action (no interest/penalty computed here).
  const amountToPay = clientOnly.reduce((sum, r) => sum + r.igst + r.cgst + r.sgst, 0);

  return { matched, mismatched, clientOnly, gstr2bOnly, amountToPay: Math.round(amountToPay * 100) / 100 };
}

const FLAG_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE0B2" } };
const HEADER_ROW = ["GSTIN", "Invoice Number", "Invoice Date", "Taxable Value", "IGST", "CGST", "SGST"];

function addRowsSheet(workbook, sheetName, rows, mapRow) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(HEADER_ROW);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(mapRow(row));
  }
  sheet.columns.forEach((col) => {
    col.width = 18;
  });
}

/** Builds the downloadable Excel for a reconciliation result: one sheet per bucket, plus a
 *  Summary sheet with the headline totals. Mismatched-amount cells are highlighted the same
 *  light orange used elsewhere in the app for flagged values. */
export async function buildReconciliationExcelBuffer(result, { clientName, period }) {
  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet("Summary");
  summary.addRow(["Client", clientName]);
  summary.addRow(["Period", period]);
  summary.addRow([]);
  summary.addRow(["Matched invoices", result.matched.length]);
  summary.addRow(["Matched but amounts differ", result.mismatched.length]);
  summary.addRow(["Client invoices missing from GSTR-2B", result.clientOnly.length]);
  summary.addRow(["GSTR-2B entries with no invoice from client", result.gstr2bOnly.length]);
  summary.addRow(["ITC to be reversed/paid (client invoices not in GSTR-2B)", result.amountToPay]);
  summary.getColumn(1).width = 55;
  summary.getColumn(2).width = 20;

  addRowsSheet(workbook, "Client invoices missing from 2B", result.clientOnly, (r) => [
    r.gstin,
    r.invoiceNumber,
    r.invoiceDate,
    r.taxableValue,
    r.igst,
    r.cgst,
    r.sgst,
  ]);

  addRowsSheet(workbook, "Invoices missing from client", result.gstr2bOnly, (r) => [
    r.gstin,
    r.invoiceNumber,
    r.invoiceDate,
    r.taxableValue,
    r.igst,
    r.cgst,
    r.sgst,
  ]);

  const mismatchSheet = workbook.addWorksheet("Matched but amounts differ");
  mismatchSheet.addRow(["GSTIN", "Invoice Number", "Taxable (client)", "Taxable (2B)", "IGST (client)", "IGST (2B)", "CGST (client)", "CGST (2B)", "SGST (client)", "SGST (2B)"]);
  mismatchSheet.getRow(1).font = { bold: true };
  for (const { client, gstr2b } of result.mismatched) {
    const row = mismatchSheet.addRow([
      client.gstin,
      client.invoiceNumber,
      client.taxableValue,
      gstr2b.taxableValue,
      client.igst,
      gstr2b.igst,
      client.cgst,
      gstr2b.cgst,
      client.sgst,
      gstr2b.sgst,
    ]);
    [3, 4, 5, 6, 7, 8, 9, 10].forEach((col) => {
      row.getCell(col).fill = FLAG_FILL;
    });
  }
  mismatchSheet.columns.forEach((col) => {
    col.width = 16;
  });

  return workbook.xlsx.writeBuffer();
}

const PDF_MONEY = (n) => `Rs ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PDF_INK = "#0f172a";
const PDF_MUTED = "#475569";
const PDF_HEADER_BG = "#e2e8f0";
const PDF_STRIPE_BG = "#f8fafc";
const PDF_FLAG_BG = "#ffe0b2";
const PDF_TABLE_COLS = [
  { label: "GSTIN", width: 82 },
  { label: "Invoice No.", width: 68 },
  { label: "Date", width: 52 },
  { label: "Taxable Value", width: 62 },
  { label: "IGST", width: 48 },
  { label: "CGST", width: 48 },
  { label: "SGST", width: 48 },
  { label: "Total Tax", width: 62 },
];

/** Draws a paginated table starting at the document's current y position. Redraws the header
 *  row on every new page so a table split across pages is still readable on its own. */
function drawInvoiceTable(doc, rows) {
  const startX = doc.page.margins.left;
  const tableWidth = PDF_TABLE_COLS.reduce((sum, c) => sum + c.width, 0);
  const rowHeight = 16;
  const headerHeight = 18;

  function drawHeader() {
    const y = doc.y;
    doc.rect(startX, y, tableWidth, headerHeight).fill(PDF_HEADER_BG);
    doc.fillColor(PDF_INK).font("Helvetica-Bold").fontSize(7.5);
    let x = startX;
    for (const col of PDF_TABLE_COLS) {
      doc.text(col.label, x + 3, y + 5, { width: col.width - 6, height: 9, ellipsis: true });
      x += col.width;
    }
    doc.y = y + headerHeight;
  }

  function ensureSpace(height) {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
  }

  drawHeader();
  doc.font("Helvetica").fontSize(7.5);
  rows.forEach((r, idx) => {
    ensureSpace(rowHeight);
    const y = doc.y;
    if (idx % 2 === 1) {
      doc.rect(startX, y, tableWidth, rowHeight).fill(PDF_STRIPE_BG);
    }
    doc.fillColor(PDF_INK);
    const cells = [
      r.gstin,
      r.invoiceNumber,
      r.invoiceDate,
      PDF_MONEY(r.taxableValue),
      PDF_MONEY(r.igst),
      PDF_MONEY(r.cgst),
      PDF_MONEY(r.sgst),
      PDF_MONEY(r.igst + r.cgst + r.sgst),
    ];
    let x = startX;
    cells.forEach((cell, i) => {
      doc.text(String(cell), x + 3, y + 4, { width: PDF_TABLE_COLS[i].width - 6, height: 9, ellipsis: true });
      x += PDF_TABLE_COLS[i].width;
    });
    doc.y = y + rowHeight;
  });
  doc.moveDown(1);
}

/** Draws the "matched but amounts differ" section — a client line and a GSTR-2B line per
 *  invoice, since fitting a 10-column side-by-side table in portrait isn't legible. */
function drawMismatchSection(doc, mismatched) {
  const startX = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  for (const { client, gstr2b } of mismatched) {
    if (doc.y + 46 > doc.page.height - doc.page.margins.bottom) doc.addPage();

    doc.font("Helvetica-Bold").fontSize(8).fillColor(PDF_INK);
    doc.text(`Invoice ${client.invoiceNumber}  —  GSTIN ${client.gstin}`, startX, doc.y, { width });

    doc.font("Helvetica").fontSize(7.5).fillColor(PDF_MUTED);
    doc.text(
      `Client:   Taxable ${PDF_MONEY(client.taxableValue)}   IGST ${PDF_MONEY(client.igst)}   CGST ${PDF_MONEY(client.cgst)}   SGST ${PDF_MONEY(client.sgst)}`,
      startX,
      doc.y + 2,
      { width }
    );
    doc.rect(startX, doc.y + 2, width, 12).fill(PDF_FLAG_BG);
    doc.fillColor(PDF_INK).text(
      `GSTR-2B:  Taxable ${PDF_MONEY(gstr2b.taxableValue)}   IGST ${PDF_MONEY(gstr2b.igst)}   CGST ${PDF_MONEY(gstr2b.cgst)}   SGST ${PDF_MONEY(gstr2b.sgst)}`,
      startX + 3,
      doc.y + 4,
      { width: width - 6 }
    );
    doc.moveDown(1.1);
  }
}

function drawSectionHeading(doc, title, note) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  if (doc.y + 40 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  doc.font("Helvetica-Bold").fontSize(11).fillColor(PDF_INK).text(title, doc.page.margins.left, doc.y, { width });
  doc.font("Helvetica").fontSize(8.5).fillColor(PDF_MUTED).text(note, doc.page.margins.left, doc.y + 3, { width });
  doc.moveDown(0.6);
}

/** Builds an auditor-facing PDF: client name and period up front, a highlighted amount-pending
 *  summary, then the same three buckets as the Excel export (in full — every invoice number,
 *  not just counts) plus a short plain-language note per bucket on what it actually means for
 *  the client's ITC position. */
export function buildReconciliationPdfBuffer(result, { clientName, period }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font("Helvetica-Bold").fontSize(18).fillColor(PDF_INK).text("GSTR-2B Reconciliation Report");
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(14).text(`Client: ${clientName}`);
    doc.font("Helvetica").fontSize(10).fillColor(PDF_MUTED);
    doc.text(`Period: ${period}`);
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`);
    doc.moveDown(0.8);

    // Summary
    doc.font("Helvetica-Bold").fontSize(11).fillColor(PDF_INK).text("Summary");
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(9).fillColor(PDF_INK);
    const summaryLines = [
      `Matched invoices (present and agreeing on both sides): ${result.matched.length}`,
      `Matched but amounts differ: ${result.mismatched.length}`,
      `Client invoices missing from GSTR-2B: ${result.clientOnly.length}`,
      `GSTR-2B entries with no invoice from client: ${result.gstr2bOnly.length}`,
    ];
    for (const line of summaryLines) doc.text(line);
    doc.moveDown(0.4);

    const boxY = doc.y;
    doc.rect(doc.page.margins.left, boxY, width, 34).fill("#fff3e0");
    doc.fillColor("#7c2d12").font("Helvetica-Bold").fontSize(11);
    doc.text("ITC to be reversed / paid by the client", doc.page.margins.left + 10, boxY + 6, { width: width - 20 });
    doc.fontSize(14).text(PDF_MONEY(result.amountToPay), doc.page.margins.left + 10, boxY + 18, { width: width - 20 });
    doc.y = boxY + 34;
    doc.moveDown(1);

    // Section 1
    drawSectionHeading(
      doc,
      `Client invoices missing from GSTR-2B (${result.clientOnly.length})`,
      "The client provided these invoices, but the supplier hasn't reflected them in their GSTR-1/IFF filing (as shown in GSTR-2B). Under Section 16(2)(aa) / Rule 36(4), ITC on these invoices isn't currently eligible to claim — the amount above is what would need to be reversed or paid until the supplier files the matching invoice."
    );
    if (result.clientOnly.length > 0) {
      drawInvoiceTable(doc, result.clientOnly);
    } else {
      doc.font("Helvetica").fontSize(9).fillColor(PDF_MUTED).text("None — every client invoice is backed by GSTR-2B.");
      doc.moveDown(1);
    }

    // Section 2
    drawSectionHeading(
      doc,
      `In GSTR-2B but not provided by client (${result.gstr2bOnly.length})`,
      "ITC is available on these per GSTR-2B, but the client hasn't submitted the invoice yet. This is unclaimed credit sitting on the table — worth following up with the client to collect these invoices so the ITC can actually be availed."
    );
    if (result.gstr2bOnly.length > 0) {
      drawInvoiceTable(doc, result.gstr2bOnly);
    } else {
      doc.font("Helvetica").fontSize(9).fillColor(PDF_MUTED).text("None — every GSTR-2B entry has a matching client invoice.");
      doc.moveDown(1);
    }

    // Section 3
    if (result.mismatched.length > 0) {
      drawSectionHeading(
        doc,
        `Matched but amounts differ (${result.mismatched.length})`,
        "Same GSTIN and invoice number appear on both sides, but the taxable value or tax amounts don't agree — verify against the original invoice. This often points to a data-entry error on one side, but can also mean the supplier amended the invoice after the client recorded it."
      );
      drawMismatchSection(doc, result.mismatched);
    }

    // Footer note on every page
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(7).fillColor(PDF_MUTED).text(
        "Matching is by supplier GSTIN + invoice number, from the GSTR-2B B2B sheet only (credit/debit notes, ISD, imports excluded). " +
          `Page ${i + 1} of ${pageCount}.`,
        doc.page.margins.left,
        doc.page.height - doc.page.margins.bottom + 10,
        { width, align: "center" }
      );
    }

    doc.end();
  });
}
