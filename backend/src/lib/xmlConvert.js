import * as XLSX from "xlsx";

const SUPPORTED_EXTENSIONS = ["csv", "xlsx", "xls", "json"];

function extensionOf(fileName) {
  const m = String(fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export function isConvertibleFile(fileName) {
  return SUPPORTED_EXTENSIONS.includes(extensionOf(fileName));
}

export const CONVERTIBLE_EXTENSIONS = SUPPORTED_EXTENSIONS;

// XML element names can't start with a digit/punctuation or contain spaces — column headers
// routinely do (e.g. "Invoice #", "Amount (INR)"), so this maps anything invalid to "_".
function sanitizeTagName(name, fallback) {
  let tag = String(name ?? "").trim().replace(/[^A-Za-z0-9_.-]/g, "_");
  if (!tag || /^[0-9.-]/.test(tag) || /^xml/i.test(tag)) {
    tag = `field_${tag || fallback}`;
  }
  return tag;
}

function escapeXml(value) {
  return String(value ?? "").replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]
  );
}

function rowsFromSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
}

function rowsFromJson(buffer) {
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new Error("That file isn't valid JSON");
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") return [parsed];
  throw new Error("JSON must be an object or an array of objects");
}

/** Turns a CSV/Excel/JSON file's rows into a flat XML document — one <record> per row, one
 *  child element per column/field, in whatever order they appeared in the source file. Uses
 *  the same battle-tested parser (xlsx) for CSV and Excel so quoting/escaping edge cases are
 *  handled correctly rather than by a hand-rolled CSV splitter. */
export function convertFileToXml(buffer, fileName) {
  const ext = extensionOf(fileName);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type — only ${SUPPORTED_EXTENSIONS.join(", ").toUpperCase()} are supported`);
  }

  const rows = ext === "json" ? rowsFromJson(buffer) : rowsFromSpreadsheet(buffer);
  if (rows.length === 0) {
    throw new Error("No rows found in this file");
  }

  const recordBlocks = rows.map((row) => {
    const usedTags = new Map();
    const fields = Object.entries(row)
      .map(([key, value], i) => {
        let tag = sanitizeTagName(key, `col${i + 1}`);
        const seen = usedTags.get(tag) || 0;
        usedTags.set(tag, seen + 1);
        if (seen > 0) tag = `${tag}_${seen + 1}`;
        return `    <${tag}>${escapeXml(value)}</${tag}>`;
      })
      .join("\n");
    return `  <record>\n${fields}\n  </record>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<records source_file="${escapeXml(fileName)}" count="${rows.length}">\n${recordBlocks.join(
    "\n"
  )}\n</records>\n`;
}
