import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
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
