const MONTH_NAMES = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08" -> "August2026" — used to name/label period-specific files like the TDS challan. */
export function formatPeriodLabel(period) {
  const m = String(period ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(period ?? "");
  const monthIndex = Number(m[2]) - 1;
  const monthName = MONTH_LABELS[monthIndex] || m[2];
  return `${monthName}${m[1]}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Handwritten/printed invoices show dates in whatever format the source used — this pins
// every date field to dd/mm/yyyy regardless of that. 2-digit years use the standard 79/80
// pivot (26 -> 2026, 95 -> 1995); ambiguous numeric-only dates (both parts <=12, e.g.
// "03/04/2026") default to day-first per Indian date convention rather than guessing MM/DD.
function fullYear(y) {
  if (y >= 100) return y;
  return y <= 79 ? 2000 + y : 1900 + y;
}

function formatDdMmYyyy(day, month, year) {
  return `${pad2(day)}/${pad2(month)}/${fullYear(year)}`;
}

export function normalizeDateToDdMmYyyy(raw) {
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
export function applyDateFormat(fields) {
  return fields.map((f) => (f.field_type === "date" && f.value ? { ...f, value: normalizeDateToDdMmYyyy(f.value) } : f));
}

/** Extracts {year, month} (month 1-12) from a dd/mm/yyyy string, or null if it isn't one
 *  (i.e. normalizeDateToDdMmYyyy couldn't recognize the source format). */
export function periodFromDdMmYyyy(value) {
  const m = String(value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return { year: Number(m[3]), month: Number(m[2]) };
}
