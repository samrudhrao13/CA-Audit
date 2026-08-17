import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { HandscribeLogo } from "./HandscribeLogo";
import { ExtractionGrid } from "./ExtractionGrid";
import { FileDropZone } from "./FileDropZone";
import { DriveFilePicker } from "./DriveFilePicker";
import { FilePreviewModal } from "./FilePreviewModal";
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
  const [previewing, setPreviewing] = useState(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyTemplateFilter, setHistoryTemplateFilter] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

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

    // Local uploads only — a Drive-sourced file is already the one copy in Drive, so
    // "duplicate" doesn't apply the same way to it.
    const existingFileNames = new Set((history || []).map((h) => (h.fileName || "").toLowerCase()));

    const collected = [];
    const errors = [];
    const skipped = [];
    for (let i = 0; i < entries.length; i++) {
      setProgress({ done: i, total: entries.length });
      const entry = entries[i];

      if (entry.kind === "local" && existingFileNames.has(entry.name.toLowerCase())) {
        const proceed = confirm(
          `"${entry.name}" has the same name as a file already extracted for this client. Upload it again anyway?`
        );
        if (!proceed) {
          skipped.push(entry.name);
          continue;
        }
      }

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
        collected.push({
          fileName: entry.name,
          fields: applyDateFormat(extraction.fields),
          templateName: extraction.template_name,
          checklistMatches: extraction.checklistMatches || [],
        });
        if (entry.kind === "local") existingFileNames.add(entry.name.toLowerCase());
      } catch (err) {
        errors.push(`${entry.name}: ${err.message}`);
      }
    }
    setProgress(null);
    setResults(collected);
    const messages = [];
    if (errors.length > 0) messages.push(errors.join("; "));
    if (skipped.length > 0) messages.push(`Skipped (duplicate, not uploaded): ${skipped.join(", ")}`);
    setExtractError(messages.length > 0 ? messages.join(" | ") : null);
    if (collected.length > 0) {
      setFiles((prev) => prev.filter((f) => skipped.includes(f.name)));
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

  const checklistFulfillments = Array.from(
    new Map(
      results.flatMap((r) => (r.checklistMatches || []).map((m) => [`${m.workflowKey}::${m.documentName}`, m]))
    ).values()
  );

  const filteredHistory = (history || []).filter((h) => {
    if (historyTemplateFilter && h.templateId !== historyTemplateFilter) return false;
    if (historyFrom && new Date(h.createdAt) < new Date(`${historyFrom}T00:00:00`)) return false;
    if (historyTo && new Date(h.createdAt) > new Date(`${historyTo}T23:59:59`)) return false;
    return true;
  });
  const historyFiltersActive = historyTemplateFilter || historyFrom || historyTo;

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
          pull them into structured, editable fields. Files are also saved to this client's Drive folder
          automatically — no need to upload them again below.
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
          {checklistFulfillments.length > 0 && (
            <p className="success-text" style={{ margin: 0, fontSize: 13 }}>
              Also marked as received on the document checklist:{" "}
              {checklistFulfillments.map((m, i) => (
                <span key={`${m.workflowKey}-${m.documentName}`}>
                  {i > 0 && ", "}
                  {m.workflowKey} → {m.documentName}
                </span>
              ))}
              . No need to upload these again there.
            </p>
          )}
          <ExtractionGrid results={results} onFieldChange={updateResultField} />
        </div>
      )}

      {history && history.length > 0 && (
        <div className="stack" style={{ gap: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
          <button
            type="button"
            onClick={() => setHistoryExpanded((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "none",
              border: "none",
              boxShadow: "none",
              padding: 0,
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              Past extractions ({history.length})
              {!historyExpanded && historyFiltersActive ? ` — ${filteredHistory.length} match filters` : ""}
            </span>
            <span className="muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
              {historyExpanded ? "Hide" : "Show"}
              <span style={{ transform: historyExpanded ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}>▾</span>
            </span>
          </button>

          {historyExpanded && (
            <>
          <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "1 1 160px" }}>
              <label htmlFor="histTemplateFilter">Template</label>
              <select
                id="histTemplateFilter"
                value={historyTemplateFilter}
                onChange={(e) => setHistoryTemplateFilter(e.target.value)}
              >
                <option value="">All templates</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: "1 1 130px" }}>
              <label htmlFor="histFrom">From</label>
              <input id="histFrom" type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
            </div>
            <div className="field" style={{ flex: "1 1 130px" }}>
              <label htmlFor="histTo">To</label>
              <input id="histTo" type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
            </div>
            {historyFiltersActive && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setHistoryTemplateFilter("");
                  setHistoryFrom("");
                  setHistoryTo("");
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          {filteredHistory.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No extractions match these filters.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredHistory.map((h) => (
                <li key={h.id} className="muted" style={{ fontSize: 13, display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.fileName && <strong style={{ color: "var(--text)" }}>{h.fileName}</strong>}
                    {h.fileName && " — "}
                    {h.templateName || "Untitled template"} — {new Date(h.createdAt).toLocaleString()}
                  </span>
                  <span style={{ display: "flex", gap: 10 }}>
                    {h.hasFile && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          setPreviewing({
                            url: `/api/clients/${clientId}/handscribe/extractions/${h.id}/file`,
                            fileName: h.fileName || h.templateName || "document",
                            driveWebViewLink: h.driveWebViewLink,
                          })
                        }
                      >
                        View
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
            </>
          )}
        </div>
      )}

      {previewing && (
        <FilePreviewModal
          url={previewing.url}
          fileName={previewing.fileName}
          driveWebViewLink={previewing.driveWebViewLink}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
