const MONTH_NAMES = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Same pivot the backend export uses, kept in sync so the field shown while editing already
// matches what exporting would produce — see backend/src/routes/handscribe.js.
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

  let m = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})$/);
  if (m && MONTH_NAMES[m[2].toLowerCase()]) {
    return formatDdMmYyyy(Number(m[1]), MONTH_NAMES[m[2].toLowerCase()], Number(m[3]));
  }

  m = value.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (m && MONTH_NAMES[m[1].toLowerCase()]) {
    return formatDdMmYyyy(Number(m[2]), MONTH_NAMES[m[1].toLowerCase()], Number(m[3]));
  }

  m = value.match(/^(\d{1,2})[-/]([A-Za-z]{3,9})[-/](\d{2,4})$/);
  if (m && MONTH_NAMES[m[2].toLowerCase()]) {
    return formatDdMmYyyy(Number(m[1]), MONTH_NAMES[m[2].toLowerCase()], Number(m[3]));
  }

  m = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    return formatDdMmYyyy(Number(m[3]), Number(m[2]), Number(m[1]));
  }

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
      return value;
    }
    return formatDdMmYyyy(day, month, Number(m[3]));
  }

  return value;
}

/** Applied only to field_type "date" fields in an extraction result — everything else
 *  passes through unchanged. When the source text is successfully recognized and reformatted,
 *  also clears any stale "doesn't match the expected format" flag from the server, since that
 *  was computed against the original text, not the now-standardized dd/mm/yyyy value. */
export function applyDateFormat(fields) {
  return (fields || []).map((f) => {
    if (f.field_type !== "date" || !f.value) return f;
    const normalized = normalizeDateToDdMmYyyy(f.value);
    const recognized = /^\d{2}\/\d{2}\/\d{4}$/.test(normalized);
    return recognized ? { ...f, value: normalized, valid: true, reason: null } : { ...f, value: normalized };
  });
}
