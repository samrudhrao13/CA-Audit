import { codesForRegime, describeTdsCode } from "../lib/tdsCodes";

/**
 * Repeatable list of TDS section applicability entries — each row is a
 * regime (old section codes vs. the new numeric codes effective April 2026)
 * + a code from that regime, with a read-only description that updates the
 * moment the code changes. "Add code" appends another blank row.
 */
export function TdsCodePicker({ entries, onChange }) {
  function updateEntry(index, patch) {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  function addEntry() {
    onChange([...entries, { regime: "new", code: "" }]);
  }

  function removeEntry(index) {
    onChange(entries.filter((_, i) => i !== index));
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {entries.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No TDS sections added yet.
        </p>
      )}

      {entries.map((entry, index) => (
        <div key={index} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "0 1 200px" }}>
            <label htmlFor={`tds-regime-${index}`}>Regime</label>
            <select
              id={`tds-regime-${index}`}
              value={entry.regime}
              onChange={(e) => updateEntry(index, { regime: e.target.value, code: "" })}
            >
              <option value="new">New (numeric, Apr 2026+)</option>
              <option value="old">Old (pre-Apr 2026)</option>
            </select>
          </div>
          <div className="field" style={{ flex: "0 1 160px" }}>
            <label htmlFor={`tds-code-${index}`}>Section code</label>
            <select id={`tds-code-${index}`} value={entry.code} onChange={(e) => updateEntry(index, { code: e.target.value })}>
              <option value="">Select...</option>
              {codesForRegime(entry.regime).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: "2 1 280px" }}>
            <label>Description</label>
            <div className="copy-field">
              <span className="copy-field-value">{describeTdsCode(entry.regime, entry.code) || "—"}</span>
            </div>
          </div>
          <button type="button" className="secondary" onClick={() => removeEntry(index)}>
            Remove
          </button>
        </div>
      ))}

      <button type="button" className="secondary" onClick={addEntry} style={{ alignSelf: "flex-start" }}>
        + Add code
      </button>
    </div>
  );
}
