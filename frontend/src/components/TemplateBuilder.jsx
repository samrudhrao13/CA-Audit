import { useState } from "react";
import { api } from "../lib/api";

// Must match handscribe/backend/app/schemas.py's FieldType enum.
export const FIELD_TYPES = [
  { value: "numeric", label: "Numeric" },
  { value: "alphabetic", label: "Alphabetic" },
  { value: "alphanumeric", label: "Alphanumeric" },
  { value: "date", label: "Date" },
  { value: "currency", label: "Currency" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "gst_number", label: "GST Number" },
  { value: "pan_number", label: "PAN Number" },
  { value: "custom_regex", label: "Custom Regex" },
];

const EMPTY_FIELD = { name: "", field_type: "alphanumeric", required: false, regex_pattern: "" };

function toFormFields(template) {
  if (!template?.fields?.length) return [{ ...EMPTY_FIELD }];
  return template.fields.map((f) => ({
    name: f.name,
    field_type: f.field_type,
    required: f.required,
    regex_pattern: f.regex_pattern || "",
  }));
}

/** Create or edit a HandScribe field template — pass `template` to edit, omit it to create. */
export function TemplateBuilder({ template, onSaved, onCancel }) {
  const [name, setName] = useState(template?.name || "");
  const [fields, setFields] = useState(toFormFields(template));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function updateField(index, patch) {
    setFields((f) => f.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  function addField() {
    setFields((f) => [...f, { ...EMPTY_FIELD }]);
  }

  function removeField(index) {
    setFields((f) => f.filter((_, i) => i !== index));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        fields: fields.map((f) => ({
          name: f.name,
          field_type: f.field_type,
          required: f.required,
          regex_pattern: f.field_type === "custom_regex" ? f.regex_pattern : null,
        })),
      };
      const saved = template
        ? await api.put(`/api/handscribe/templates/${template.id}`, payload)
        : await api.post("/api/handscribe/templates", payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="stack" style={{ gap: 12 }}>
      <div className="field">
        <label htmlFor="hsTemplateName">Template name</label>
        <input id="hsTemplateName" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {fields.map((f, index) => (
        <div key={index} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 180px" }}>
            <label>Field name</label>
            <input required value={f.name} onChange={(e) => updateField(index, { name: e.target.value })} />
          </div>
          <div className="field" style={{ flex: "0 1 170px" }}>
            <label>Type</label>
            <select value={f.field_type} onChange={(e) => updateField(index, { field_type: e.target.value })}>
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {f.field_type === "custom_regex" && (
            <div className="field" style={{ flex: "1 1 200px" }}>
              <label>Regex pattern</label>
              <input
                required
                value={f.regex_pattern}
                onChange={(e) => updateField(index, { regex_pattern: e.target.value })}
              />
            </div>
          )}
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, paddingBottom: 9 }}>
            <input type="checkbox" checked={f.required} onChange={(e) => updateField(index, { required: e.target.checked })} />
            Required
          </label>
          <button type="button" className="secondary" onClick={() => removeField(index)} disabled={fields.length === 1}>
            Remove
          </button>
        </div>
      ))}

      <button type="button" className="secondary" onClick={addField} style={{ alignSelf: "flex-start" }}>
        + Add field
      </button>

      {error && <p className="error-text">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save template"}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
