/** Repeatable list of plain-text entries — add/edit/remove a row at a time. Used for both
 *  a company's default document checklist and a client's "other documents" list. */
export function StringListEditor({ items, onChange, placeholder }) {
  function updateItem(index, value) {
    onChange(items.map((item, i) => (i === index ? value : item)));
  }

  function addItem() {
    onChange([...items, ""]);
  }

  function removeItem(index) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {items.length === 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          None added yet.
        </p>
      )}

      {items.map((item, index) => (
        <div key={index} className="row" style={{ alignItems: "center", gap: 8 }}>
          <input
            value={item}
            placeholder={placeholder}
            onChange={(e) => updateItem(index, e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" className="secondary" onClick={() => removeItem(index)}>
            Remove
          </button>
        </div>
      ))}

      <button type="button" className="secondary" onClick={addItem} style={{ alignSelf: "flex-start" }}>
        + Add
      </button>
    </div>
  );
}
