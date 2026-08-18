import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { HandscribeLogo } from "./HandscribeLogo";
import { ExtractionGrid } from "./ExtractionGrid";
import { FileDropZone } from "./FileDropZone";
import { DriveFilePicker } from "./DriveFilePicker";
import { FilePreviewModal } from "./FilePreviewModal";
import { ExtractionEditModal } from "./ExtractionEditModal";
import { applyDateFormat } from "../lib/normalizeDate";

const MAX_FILES = 50;

/** Client-wise document extraction via HandScribe (OCR + LLM structuring) — see handscribe/README.md.
 *  Templates are maintained by the company admin under Settings → Extractor; this component only
 *  picks from what already exists. */
export function HandscribeExtract({ clientId, isAdmin }) {
  const [templates, setTemplates] = useState(null);
  const [templatesError, setTemplatesError] = useState(null);
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
  const [editingExtraction, setEditingExtraction] = useState(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyTemplateFilter, setHistoryTemplateFilter] = useState("");
  const [availablePeriods, setAvailablePeriods] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [periodExtractions, setPeriodExtractions] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState(null);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkFields, setBulkFields] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [bulkError, setBulkError] = useState(null);

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
    setTemplatesError(null);
    try {
      const { templates } = await api.get("/api/handscribe/templates");
      setTemplates(templates);
      if (templates.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(templates[0].id);
      }
    } catch (err) {
      // Previously this whole component just silently rendered nothing on failure (e.g. the
      // HandScribe service being unreachable) — surfacing the error instead so a broken
      // extractor is visibly broken, not invisible.
      setTemplatesError(err.message);
    }
  }

  async function loadHistory() {
    const { extractions } = await api.get(`/api/clients/${clientId}/handscribe/extractions`);
    setHistory(extractions);
  }

  async function toggleHistory() {
    const opening = !historyExpanded;
    setHistoryExpanded(opening);
    if (opening) {
      // Best-effort: drop any "Past extractions" entry whose source file was deleted directly
      // in Google Drive outside the app, so this list never shows something that's actually
      // gone. Only runs when the list is actually opened, not on every load.
      try {
        await api.post(`/api/clients/${clientId}/handscribe/extractions/reconcile`, {});
      } catch {
        // Non-fatal — worst case a stale entry lingers until the next time this is opened.
      }
      await loadHistory();
      try {
        const { periods } = await api.get(`/api/clients/${clientId}/handscribe/extraction-periods`);
        setAvailablePeriods(periods);
      } catch {
        setAvailablePeriods([]);
      }
    }
  }

  // A month must be picked before anything is shown — the available options come straight from
  // Drive (which months actually have a folder for this client), not an open-ended date range.
  async function handlePeriodChange(period) {
    setSelectedPeriod(period);
    setPeriodError(null);
    if (!period) {
      setPeriodExtractions(null);
      return;
    }
    setPeriodLoading(true);
    try {
      const { extractions } = await api.get(
        `/api/clients/${clientId}/handscribe/extractions?period=${encodeURIComponent(period)}`
      );
      setPeriodExtractions(extractions);
    } catch (err) {
      setPeriodError(err.message);
      setPeriodExtractions([]);
    } finally {
      setPeriodLoading(false);
    }
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

  const filteredHistory = (periodExtractions || []).filter((h) => {
    if (historyTemplateFilter && h.templateId !== historyTemplateFilter) return false;
    return true;
  });
  const editableHistory = filteredHistory.filter((h) => h.fields?.length > 0);

  function startBulkEdit() {
    setBulkFields(editableHistory.map((h) => ({ id: h.id, fileName: h.fileName, fields: h.fields })));
    setBulkError(null);
    setBulkEditing(true);
  }

  function updateBulkField(rowIndex, fieldIndex, value) {
    setBulkFields((prev) =>
      prev.map((r, i) => (i === rowIndex ? { ...r, fields: r.fields.map((f, fi) => (fi === fieldIndex ? { ...f, value } : f)) } : r))
    );
  }

  async function handleBulkSave() {
    setBulkSaving(true);
    setBulkError(null);
    const errors = [];
    for (let i = 0; i < bulkFields.length; i++) {
      setBulkProgress({ done: i, total: bulkFields.length });
      try {
        await api.put(`/api/clients/${clientId}/handscribe/extractions/${bulkFields[i].id}`, { fields: bulkFields[i].fields });
      } catch (err) {
        errors.push(`${bulkFields[i].fileName}: ${err.message}`);
      }
    }
    setBulkProgress(null);
    setBulkSaving(false);
    await loadHistory();
    await handlePeriodChange(selectedPeriod);
    if (errors.length > 0) {
      setBulkError(errors.join("; "));
    } else {
      setBulkEditing(false);
    }
  }
  const historyFiltersActive = Boolean(historyTemplateFilter);

  if (templatesError) {
    return (
      <div className="card stack" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Extract documents</p>
        <p className="error-text" style={{ margin: 0 }}>Couldn't reach the extraction service: {templatesError}</p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          The HandScribe service (used for OCR extraction) isn't responding — this doesn't affect the rest of the
          app. Ask your company admin to check it's running.
        </p>
        <div>
          <button type="button" className="secondary" onClick={loadTemplates}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (templates === null) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>Loading extractor...</p>
      </div>
    );
  }

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
            onClick={toggleHistory}
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
            <div className="field" style={{ flex: "1 1 200px" }}>
              <label htmlFor="histPeriod">Month *</label>
              <select id="histPeriod" value={selectedPeriod} onChange={(e) => handlePeriodChange(e.target.value)} required>
                <option value="">
                  {availablePeriods === null ? "Loading..." : "Select a month..."}
                </option>
                {(availablePeriods || []).map((p) => (
                  <option key={p.period} value={p.period}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
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
            {historyFiltersActive && (
              <button type="button" className="secondary" onClick={() => setHistoryTemplateFilter("")}>
                Clear filters
              </button>
            )}
            {selectedPeriod && !bulkEditing && editableHistory.length > 1 && (
              <button type="button" className="secondary" onClick={startBulkEdit}>
                Edit multiple
              </button>
            )}
          </div>

          {!selectedPeriod ? (
            <p className="muted" style={{ margin: 0 }}>
              {availablePeriods && availablePeriods.length === 0
                ? "No months with extractions in Drive yet."
                : "Please select the month."}
            </p>
          ) : periodLoading ? (
            <p className="muted" style={{ margin: 0 }}>
              Loading...
            </p>
          ) : periodError ? (
            <p className="error-text">Couldn't load that month: {periodError}</p>
          ) : bulkEditing ? (
            <div className="stack" style={{ gap: 10 }}>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Editing {bulkFields.length} extraction{bulkFields.length === 1 ? "" : "s"} — edit any cell, then save all
                at once. Each row's stored Excel copy is refreshed the same way single-file editing does; the
                documents themselves aren't re-extracted.
              </p>
              <ExtractionGrid results={bulkFields} onFieldChange={updateBulkField} />
              {bulkError && <p className="error-text">{bulkError}</p>}
              <div className="row" style={{ gap: 8 }}>
                <button type="button" disabled={bulkSaving} onClick={handleBulkSave}>
                  {bulkSaving
                    ? bulkProgress
                      ? `Saving ${bulkProgress.done + 1} of ${bulkProgress.total}...`
                      : "Saving..."
                    : "Save all changes"}
                </button>
                <button type="button" className="secondary" disabled={bulkSaving} onClick={() => setBulkEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : filteredHistory.length === 0 ? (
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
                    {h.fields?.length > 0 && (
                      <button type="button" className="link-btn" onClick={() => setEditingExtraction(h)}>
                        Edit
                      </button>
                    )}
                    {h.excelDriveWebViewLink && (
                      <a href={h.excelDriveWebViewLink} target="_blank" rel="noreferrer">
                        Excel
                      </a>
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

      {editingExtraction && (
        <ExtractionEditModal
          clientId={clientId}
          extraction={editingExtraction}
          onClose={() => setEditingExtraction(null)}
          onSaved={async () => {
            await loadHistory();
            await handlePeriodChange(selectedPeriod);
          }}
        />
      )}
    </div>
  );
}
