/**
 * Repeatable, free-form "field name" + "information" rows for whatever a client needs beyond
 * the standard registration fields (GSTIN, PAN, TAN, HSN code, CIN — those stay fixed for
 * every client and live in their own inputs above this). "Add field" appends a blank row.
 */
export function CustomFieldsEditor({ entries, onChange }) {
  function updateEntry(index, patch) {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  function addEntry() {
    onChange([...entries, { name: "", value: "" }]);
  }

  function removeEntry(index) {
    onChange(entries.filter((_, i) => i !== index));
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {entries.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No extra fields added yet.
        </p>
      )}

      {entries.map((entry, index) => (
        <div key={index} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 220px" }}>
            <label htmlFor={`custom-field-name-${index}`}>Field name</label>
            <input
              id={`custom-field-name-${index}`}
              placeholder="e.g. Udyam Registration No."
              value={entry.name}
              onChange={(e) => updateEntry(index, { name: e.target.value })}
            />
          </div>
          <div className="field" style={{ flex: "2 1 280px" }}>
            <label htmlFor={`custom-field-value-${index}`}>Information</label>
            <input
              id={`custom-field-value-${index}`}
              value={entry.value}
              onChange={(e) => updateEntry(index, { value: e.target.value })}
            />
          </div>
          <button type="button" className="secondary" onClick={() => removeEntry(index)}>
            Remove
          </button>
        </div>
      ))}

      <button type="button" className="secondary" onClick={addEntry} style={{ alignSelf: "flex-start" }}>
        + Add field
      </button>
    </div>
  );
}
