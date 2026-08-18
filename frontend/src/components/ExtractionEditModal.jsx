import { useState } from "react";
import { api } from "../lib/api";
import { ExtractionGrid } from "./ExtractionGrid";

/** Edit a past extraction's field values and re-save — rewrites the stored fields and
 *  regenerates the Excel copy already saved in Drive, instead of requiring the document to be
 *  re-extracted (which costs another OCR/LLM run) just to fix a value. */
export function ExtractionEditModal({ clientId, extraction, onClose, onSaved }) {
  const [fields, setFields] = useState(extraction.fields || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function updateField(_rowIndex, fieldIndex, value) {
    setFields((prev) => prev.map((f, i) => (i === fieldIndex ? { ...f, value } : f)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await api.put(`/api/clients/${clientId}/handscribe/extractions/${extraction.id}`, { fields });
      onSaved(result);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card stack"
        style={{ gap: 12, maxWidth: 900, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>Edit extraction</p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              {extraction.fileName}
            </p>
          </div>
          <button type="button" className="secondary" onClick={onClose} style={{ padding: "4px 10px", fontSize: 12 }}>
            Close
          </button>
        </div>

        <ExtractionGrid results={[{ fileName: extraction.fileName, fields }]} onFieldChange={updateField} />

        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Saving updates the values here and refreshes the Excel copy already saved in Drive —
          the document itself isn't re-extracted.
        </p>

        {error && <p className="error-text">{error}</p>}
        <div>
          <button type="button" disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
