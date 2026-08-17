import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useUserProfile } from "../context/UserProfileContext";
import { HandscribeLogo } from "../components/HandscribeLogo";
import { ExtractionGrid } from "../components/ExtractionGrid";
import { FileDropZone } from "../components/FileDropZone";
import { DriveFilePicker } from "../components/DriveFilePicker";
import { ConvertToXmlCard } from "../components/ConvertToXmlCard";
import { applyDateFormat } from "../lib/normalizeDate";

const MAX_FILES = 50;

/** General-purpose extractor, not tied to any client — available to every company member.
 *  For extraction saved against a specific client's history, use the "Extract documents"
 *  card on that client's own page instead (backed by a different, client-scoped endpoint). */
export function ExtractorPage() {
  const { profile } = useUserProfile();
  const isAdmin = profile?.role === "COMPANY_ADMIN";
  const [templates, setTemplates] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [clients, setClients] = useState(null);
  const [driveClientId, setDriveClientId] = useState("");
  const [files, setFiles] = useState([]);
  const [driveFiles, setDriveFiles] = useState([]);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [extractError, setExtractError] = useState(null);
  const [results, setResults] = useState([]);
  const [batchExporting, setBatchExporting] = useState(null);
  const [batchExportError, setBatchExportError] = useState(null);

  const totalSelected = files.length + driveFiles.length;

  async function loadTemplates() {
    const { templates } = await api.get("/api/handscribe/templates");
    setTemplates(templates);
    if (templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(templates[0].id);
    }
  }

  async function loadClients() {
    const { clients } = await api.get("/api/clients");
    setClients(clients);
  }

  useEffect(() => {
    loadTemplates();
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectDriveClient(clientId) {
    setDriveClientId(clientId);
    setDriveFiles([]);
    setShowDrivePicker(false);
  }

  function addDriveFiles(newOnes) {
    setDriveFiles((prev) => {
      const existingIds = new Set(prev.map((f) => f.id));
      const additions = newOnes.filter((f) => !existingIds.has(f.id));
      const remaining = Math.max(0, MAX_FILES - files.length - prev.length);
      return [...prev, ...additions.slice(0, remaining)];
    });
  }

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
            ? await api.uploadFile("/api/handscribe/extract", "image", entry.file, { templateId: selectedTemplateId })
            : await api.post("/api/handscribe/extract", {
                templateId: selectedTemplateId,
                driveFileId: entry.driveFileId,
                clientId: driveClientId,
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
        fileName: "extractions",
      });
    } catch (err) {
      setBatchExportError(err.message);
    } finally {
      setBatchExporting(null);
    }
  }

  if (templates === null || clients === null) return <p>Loading...</p>;

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>Extractor</h1>
        <div style={{ margin: "8px 0" }}>
          <HandscribeLogo />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Upload up to {MAX_FILES} photos or PDFs of handwritten documents at once and pull them into
          structured, editable fields — general-purpose, not tied to a specific client. For extraction
          saved to a client's own history, use the "Extract documents" card on that client's page instead.
        </p>
      </div>

      <form onSubmit={handleExtract} className="card stack" style={{ gap: 16 }}>
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
              <Link to="/settings/extractor">add one under Manage templates</Link>
            ) : (
              "ask your company admin to add one"
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
          <label htmlFor="hsDriveClient">Or pick a file already in a client's Drive folder</label>
          <select
            id="hsDriveClient"
            value={driveClientId}
            onChange={(e) => selectDriveClient(e.target.value)}
            disabled={extracting}
          >
            <option value="">Select a client to browse their Drive files...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

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

          {driveClientId && (
            <>
              <button
                type="button"
                className="secondary"
                style={{ marginTop: 8, padding: "4px 10px", fontSize: 12 }}
                disabled={extracting}
                onClick={() => setShowDrivePicker((s) => !s)}
              >
                {showDrivePicker ? "Hide" : "Browse Drive"}
              </button>
              {showDrivePicker && (
                <DriveFilePicker
                  clientId={driveClientId}
                  onAdd={addDriveFiles}
                  disabled={extracting || totalSelected >= MAX_FILES}
                />
              )}
            </>
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
        <div className="card stack" style={{ gap: 10 }}>
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

      <ConvertToXmlCard />
    </div>
  );
}
