import { useState } from "react";
import { api } from "../lib/api";

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ResultField({ field, onChange }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!field.value) return;
    try {
      await navigator.clipboard.writeText(String(field.value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing else to fall back to.
    }
  }

  return (
    <div className="field">
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {field.name}
        {field.required && <span className="muted">(required)</span>}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: field.valid ? "#059669" : "#d97706",
            display: "inline-block",
          }}
          title={field.valid ? "Valid" : field.reason || "Needs a second look"}
        />
      </label>
      <div className="copy-field">
        <input
          type="text"
          className="copy-field-input"
          value={field.value}
          placeholder="Not set — leave blank or type a value"
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="copy-field-btn"
          onClick={handleCopy}
          title={copied ? "Copied" : "Copy"}
          aria-label={`Copy ${field.name}`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      {!field.valid && field.reason && (
        <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
          {field.reason}
        </p>
      )}
    </div>
  );
}

/** Extraction result fields (editable — corrections here are what gets exported) +
 *  Export Excel/XML — shared by the common extractor and the per-client one. Fully
 *  controlled: the caller owns `fields` so edits here can also feed a combined,
 *  multi-file export up the tree. */
export function ExtractionResults({ fields, onFieldsChange, fileNameHint }) {
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);

  function handleFieldChange(index, value) {
    onFieldsChange(fields.map((f, i) => (i === index ? { ...f, value } : f)));
  }

  async function handleExport(format) {
    setExporting(format);
    setExportError(null);
    try {
      await api.postDownload(`/api/handscribe/export/${format}`, {
        fields,
        fileName: fileNameHint || "extraction",
      });
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(null);
    }
  }

  if (!fields || fields.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Result — edit any field before exporting</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="secondary"
            disabled={exporting === "xlsx"}
            onClick={() => handleExport("xlsx")}
          >
            {exporting === "xlsx" ? "Exporting..." : "Export Excel"}
          </button>
          <button type="button" className="secondary" disabled={exporting === "xml"} onClick={() => handleExport("xml")}>
            {exporting === "xml" ? "Exporting..." : "Export XML"}
          </button>
        </div>
      </div>
      {exportError && <p className="error-text">{exportError}</p>}
      {fields.map((f, i) => (
        <ResultField key={f.name} field={f} onChange={(value) => handleFieldChange(i, value)} />
      ))}
    </div>
  );
}
