import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { HandscribeLogo } from "./HandscribeLogo";
import { ExtractionGrid } from "./ExtractionGrid";
import { FileDropZone } from "./FileDropZone";
import { DriveFilePicker } from "./DriveFilePicker";
import { applyDateFormat } from "../lib/normalizeDate";

const MAX_FILES = 50;

/** Client-wise document extraction via HandScribe (OCR + LLM structuring) — see handscribe/README.md.
 *  Templates are maintained by the company admin under Settings → Extractor; this component only
 *  picks from what already exists. */
export function HandscribeExtract({ clientId, isAdmin }) {
  const [templates, setTemplates] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [files, setFiles] = useState([]);
  const [driveFiles, setDriveFiles] = useState([]);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [extractError, setExtractError] = useState(null);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState(null);
  const [batchExporting, setBatchExporting] = useState(null);
  const [batchExportError, setBatchExportError] = useState(null);

  const totalSelected = files.length + driveFiles.length;

  function addDriveFiles(newOnes) {
    setDriveFiles((prev) => {
      const existingIds = new Set(prev.map((f) => f.id));
      const additions = newOnes.filter((f) => !existingIds.has(f.id));
      const remaining = Math.max(0, MAX_FILES - files.length - prev.length);
      return [...prev, ...additions.slice(0, remaining)];
    });
  }

  async function loadTemplates() {
    const { templates } = await api.get("/api/handscribe/templates");
    setTemplates(templates);
    if (templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(templates[0].id);
    }
  }

  async function loadHistory() {
    const { extractions } = await api.get(`/api/clients/${clientId}/handscribe/extractions`);
    setHistory(extractions);
  }

  useEffect(() => {
    loadTemplates();
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleExtract(e) {
    e.preventDefault();
    const entries = [
      ...files.map((file) => ({ kind: "local", file, name: file.name })),
      ...driveFiles.map((f) => ({ kind: "drive", driveFileId: f.id, name: f.name })),
    ];
    if (entries.length === 0 || !selectedTemplateId) return;
    setExtracting(true);
    setExtractError(null);
    setResults([]);
    setBatchExportError(null);

    const collected = [];
    const errors = [];
    for (let i = 0; i < entries.length; i++) {
      setProgress({ done: i, total: entries.length });
      const entry = entries[i];
      try {
        const extraction =
          entry.kind === "local"
            ? await api.uploadFile(`/api/clients/${clientId}/handscribe/extract`, "image", entry.file, {
                templateId: selectedTemplateId,
              })
            : await api.post(`/api/clients/${clientId}/handscribe/extract`, {
                templateId: selectedTemplateId,
                driveFileId: entry.driveFileId,
              });
        collected.push({ fileName: entry.name, fields: applyDateFormat(extraction.fields), templateName: extraction.template_name });
      } catch (err) {
        errors.push(`${entry.name}: ${err.message}`);
      }
    }
    setProgress(null);
    setResults(collected);
    if (errors.length > 0) setExtractError(errors.join("; "));
    if (collected.length > 0) {
      setFiles([]);
      setDriveFiles([]);
      await loadHistory();
    }
    setExtracting(false);
  }

  function updateResultField(rowIndex, fieldIndex, value) {
    setResults((prev) =>
      prev.map((r, i) =>
        i === rowIndex ? { ...r, fields: r.fields.map((f, fi) => (fi === fieldIndex ? { ...f, value } : f)) } : r
      )
    );
  }

  async function handleBatchExport(format) {
    setBatchExporting(format);
    setBatchExportError(null);
    try {
      await api.postDownload(`/api/handscribe/export-batch/${format}`, {
        items: results.map((r) => ({ fields: r.fields, fileName: r.fileName })),
        fileName: `extractions_${clientId}`,
      });
    } catch (err) {
      setBatchExportError(err.message);
    } finally {
      setBatchExporting(null);
    }
  }

  if (templates === null) return null;

  return (
    <div className="card stack" style={{ gap: 16 }}>
      <div>
        <p style={{ margin: 0, fontWeight: 600 }}>Extract documents</p>
        <div style={{ margin: "4px 0 8px" }}>
          <HandscribeLogo size="sm" />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Upload up to {MAX_FILES} photos or PDFs of handwritten documents (e.g. GST invoices) at once and
          pull them into structured, editable fields.
        </p>
      </div>

      <form onSubmit={handleExtract} className="stack" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="hsTemplate">Template</label>
          <select id="hsTemplate" value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
            <option value="">Select...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {templates.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>
            No templates yet —{" "}
            {isAdmin ? (
              <Link to="/settings/extractor">add one under Settings → Extractor</Link>
            ) : (
              "ask your company admin to add one under Settings → Extractor"
            )}
            .
          </p>
        )}

        <div className="field">
          <label htmlFor="hsFile">Documents (image or PDF)</label>
          <FileDropZone
            id="hsFile"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            files={files}
            onChange={setFiles}
            disabled={extracting}
            maxFiles={MAX_FILES}
          />
        </div>

        <div className="field">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ margin: 0 }}>Or pick a file already in Drive</label>
            <button
              type="button"
              className="secondary"
              style={{ padding: "4px 10px", fontSize: 12 }}
              disabled={extracting}
              onClick={() => setShowDrivePicker((s) => !s)}
            >
              {showDrivePicker ? "Hide" : "Browse Drive"}
            </button>
          </div>

          {driveFiles.length > 0 && (
            <ul className="file-drop-list">
              {driveFiles.map((f) => (
                <li key={f.id} className="file-drop-list-item">
                  <span>{f.name}</span>
                  <button
                    type="button"
                    className="file-drop-remove-btn"
                    disabled={extracting}
                    onClick={() => setDriveFiles((prev) => prev.filter((x) => x.id !== f.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showDrivePicker && (
            <DriveFilePicker clientId={clientId} onAdd={addDriveFiles} disabled={extracting || totalSelected >= MAX_FILES} />
          )}
        </div>

        {extractError && <p className="error-text">{extractError}</p>}
        <button type="submit" disabled={totalSelected === 0 || !selectedTemplateId || extracting} style={{ alignSelf: "flex-start" }}>
          {extracting
            ? progress
              ? `Extracting ${progress.done + 1} of ${progress.total}...`
              : "Extracting..."
            : totalSelected > 1
              ? `Extract ${totalSelected} files`
              : "Extract"}
        </button>
      </form>

      {results.length > 0 && (
        <div className="stack" style={{ gap: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {results.length} extraction{results.length === 1 ? "" : "s"} — edit any cell before exporting
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {batchExportError && <span className="error-text">{batchExportError}</span>}
              <button type="button" className="secondary" disabled={batchExporting === "xlsx"} onClick={() => handleBatchExport("xlsx")}>
                {batchExporting === "xlsx" ? "Exporting..." : "Export Excel"}
              </button>
              <button type="button" className="secondary" disabled={batchExporting === "xml"} onClick={() => handleBatchExport("xml")}>
                {batchExporting === "xml" ? "Exporting..." : "Export XML"}
              </button>
            </div>
          </div>
          <ExtractionGrid results={results} onFieldChange={updateResultField} />
        </div>
      )}

      {history && history.length > 0 && (
        <div className="stack" style={{ gap: 8, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Past extractions</p>
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {history.map((h) => (
              <li key={h.id} className="muted" style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                <span>
                  {h.templateName || "Untitled template"} — {new Date(h.createdAt).toLocaleString()}
                </span>
                <span style={{ display: "flex", gap: 10 }}>
                  {h.hasFile && (
                    <a
                      href={`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/clients/${clientId}/handscribe/extractions/${h.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View file
                    </a>
                  )}
                  {h.driveWebViewLink && (
                    <a href={h.driveWebViewLink} target="_blank" rel="noreferrer" title="Open in Google Drive">
                      Drive
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
