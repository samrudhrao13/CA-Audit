// Light orange — flags a cell whose field came back marked "Check" (not confidently valid),
// same color used for flagged cells in the Excel export (backend/src/routes/handscribe.js).
const FLAG_BG = "#fff3e0";
// Light blue — a cell filled from the client's own profile data instead of read off the
// document (see backend/src/lib/clientIdentityOverride.js). Confidently correct, just worth
// distinguishing from an OCR-read value at a glance.
const PROFILE_FILL_BG = "#e0f2fe";

/** Union of field names across every result, in first-seen order — matches
 *  backend/src/routes/handscribe.js's batchHeaderOrder, so the on-screen grid lines up with
 *  what the Excel export produces. */
function unionFieldNames(results) {
  const order = [];
  const seen = new Set();
  for (const r of results) {
    for (const f of r.fields) {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        order.push(f.name);
      }
    }
  }
  return order;
}

const thStyle = {
  textAlign: "left",
  padding: "6px 10px",
  borderBottom: "2px solid #e2e8f0",
  whiteSpace: "nowrap",
  fontSize: 13,
};

const fileColStyle = {
  position: "sticky",
  left: 0,
  background: "#fff",
  whiteSpace: "nowrap",
};

/** Spreadsheet-style view of a batch of extractions — one row per document, one column per
 *  field, matching what the Excel export produces. Cells are inline-editable; a field flagged
 *  "Check" gets the same light-orange highlight the exported Excel uses, with the reason
 *  available on hover. Replaces stacking a full editable form per document, which doesn't
 *  scale to a batch of dozens of files. */
export function ExtractionGrid({ results, onFieldChange }) {
  if (results.length === 0) return null;
  const columns = unionFieldNames(results);

  return (
    <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, ...fileColStyle }}>Source File</th>
            {columns.map((name) => (
              <th key={name} style={thStyle}>
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r, rowIndex) => (
            <tr key={`${r.fileName}-${rowIndex}`}>
              <td style={{ ...fileColStyle, padding: "4px 10px", borderBottom: "1px solid #e2e8f0", fontSize: 13 }} title={r.fileName}>
                {r.fileName}
              </td>
              {columns.map((name) => {
                const fieldIndex = r.fields.findIndex((f) => f.name === name);
                const field = fieldIndex === -1 ? null : r.fields[fieldIndex];
                const flagged = field && !field.valid;
                const profileFilled = field && field.valid && field.reason;
                return (
                  <td
                    key={name}
                    style={{
                      padding: 0,
                      borderBottom: "1px solid #e2e8f0",
                      background: flagged ? FLAG_BG : profileFilled ? PROFILE_FILL_BG : "transparent",
                    }}
                    title={flagged ? field.reason || "Needs a second look" : profileFilled ? field.reason : undefined}
                  >
                    <input
                      type="text"
                      value={field?.value ?? ""}
                      disabled={!field}
                      placeholder={field ? "" : "—"}
                      onChange={(e) => field && onFieldChange(rowIndex, fieldIndex, e.target.value)}
                      style={{
                        width: "100%",
                        minWidth: 130,
                        border: "none",
                        background: "transparent",
                        padding: "6px 10px",
                        font: "inherit",
                        fontSize: 13,
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
