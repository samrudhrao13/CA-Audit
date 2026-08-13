import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { FileDropZone } from "./FileDropZone";

const MAX_FILES = 20;

/** Free-form company documents (not invoices) straight into this client's dedicated
 *  "Company Documents" Drive folder — a separate bucket from the invoice month folders
 *  above, so each upload flow maps to exactly one Drive destination. */
export function CompanyDocumentsUpload({ clientId }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState(null);

  async function loadHistory() {
    const { documents } = await api.get(`/api/clients/${clientId}/company-documents`);
    setHistory(documents);
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleUpload(e) {
    e.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    setResults([]);

    const collected = [];
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length });
      const file = files[i];
      try {
        const res = await api.uploadFile(`/api/clients/${clientId}/company-documents/upload`, "file", file);
        collected.push({ fileName: file.name, driveWebViewLink: res.driveWebViewLink });
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }
    setProgress(null);
    setResults(collected);
    if (errors.length > 0) setError(errors.join("; "));
    if (collected.length > 0) {
      setFiles([]);
      await loadHistory();
    }
    setUploading(false);
  }

  return (
    <div className="card stack" style={{ gap: 16 }}>
      <div>
        <p style={{ margin: 0, fontWeight: 600 }}>Upload company documents</p>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Upload up to {MAX_FILES} documents at once — registration certificates, agreements,
          board resolutions, and anything else that isn't an invoice. These go into this
          client's "Company Documents" folder in Drive, separate from invoice storage.
        </p>
      </div>

      <form onSubmit={handleUpload} className="stack" style={{ gap: 12 }}>
        <FileDropZone
          id={`companyDocFiles-${clientId}`}
          accept="image/jpeg,image/png,image/webp,application/pdf"
          files={files}
          onChange={setFiles}
          disabled={uploading}
          maxFiles={MAX_FILES}
        />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={files.length === 0 || uploading} style={{ alignSelf: "flex-start" }}>
          {uploading
            ? progress
              ? `Uploading ${progress.done + 1} of ${progress.total}...`
              : "Uploading..."
            : files.length > 1
              ? `Upload ${files.length} documents`
              : "Upload"}
        </button>
      </form>

      {results.length > 0 && (
        <div className="stack" style={{ gap: 6, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Uploaded</p>
          {results.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>{r.fileName}</span>
              {r.driveWebViewLink && (
                <a href={r.driveWebViewLink} target="_blank" rel="noreferrer">
                  Open in Drive
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {history && history.length > 0 && (
        <div className="stack" style={{ gap: 6, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Recent uploads</p>
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {history.slice(0, 10).map((h) => (
              <li key={h.id} className="muted" style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                <span>
                  {h.fileName} — {new Date(h.uploadedAt).toLocaleString()}
                </span>
                {h.driveWebViewLink && (
                  <a href={h.driveWebViewLink} target="_blank" rel="noreferrer">
                    Drive
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
