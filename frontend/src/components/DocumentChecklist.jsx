import { useEffect, useState } from "react";
import { api } from "../lib/api";

/**
 * Generic across every workflow with a requiredDocuments catalog entry —
 * driven entirely by that list, not hardcoded to TDS. Uploading every
 * required document automatically moves the workflow to "ready_for_filing";
 * "Mark as filed" is the one manual step, since actual filing happens
 * outside this app (on the government portal) — this just records that it
 * happened, and when.
 */
export function DocumentChecklist({
  clientId,
  workflowKey,
  workflowName,
  period,
  progressStage,
  filedOn,
  onChanged,
  readOnly,
}) {
  const [documents, setDocuments] = useState(null);
  const [allUploaded, setAllUploaded] = useState(false);
  const [busyDoc, setBusyDoc] = useState(null);
  const [markingFiled, setMarkingFiled] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    const res = await api.get(`/api/documents/client/${clientId}/${workflowKey}?period=${period}`);
    setDocuments(res.documents);
    setAllUploaded(res.allUploaded);
  }

  useEffect(() => {
    if (period) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, workflowKey, period]);

  async function handleUpload(documentName, file) {
    setBusyDoc(documentName);
    setError(null);
    try {
      await api.uploadFile(`/api/documents/client/${clientId}/${workflowKey}/upload`, "file", file, {
        documentName,
        period,
      });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyDoc(null);
    }
  }

  async function handleMarkFiled() {
    setMarkingFiled(true);
    setError(null);
    try {
      await api.post(`/api/documents/client/${clientId}/${workflowKey}/mark-filed`, { period });
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setMarkingFiled(false);
    }
  }

  if (documents === null) return null;
  if (documents.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {progressStage === "filed" && filedOn ? (
        <p className="success-text" style={{ margin: "0 0 8px" }}>
          {workflowName} filed on {new Date(filedOn).toLocaleDateString()}.
        </p>
      ) : null}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {documents.map((doc) => (
          <li
            key={doc.name}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, gap: 8 }}
          >
            <span>
              {doc.uploaded ? "✅" : "⬜"} {doc.name}
              {doc.uploaded && doc.fileName && <span className="muted"> — {doc.fileName}</span>}
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {doc.uploaded && (
                <a
                  href={`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/documents/client/${clientId}/${workflowKey}/file?documentName=${encodeURIComponent(doc.name)}&period=${period}`}
                  className="muted"
                  onClick={(e) => e.stopPropagation()}
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>
              )}
              {doc.uploaded && doc.driveWebViewLink && (
                <a
                  href={doc.driveWebViewLink}
                  className="muted"
                  onClick={(e) => e.stopPropagation()}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in Google Drive"
                >
                  Drive
                </a>
              )}
              {!readOnly && (
                <label className="secondary" style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, border: "1px solid #cbd5e1", cursor: "pointer", fontSize: 12 }}>
                  {busyDoc === doc.name ? "Uploading..." : doc.uploaded ? "Replace" : "Upload"}
                  <input
                    type="file"
                    style={{ display: "none" }}
                    disabled={busyDoc === doc.name}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) handleUpload(doc.name, file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </span>
          </li>
        ))}
      </ul>

      {error && (
        <p className="error-text" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}

      {!readOnly && allUploaded && progressStage === "ready_for_filing" && (
        <button className="secondary" style={{ marginTop: 10 }} disabled={markingFiled} onClick={handleMarkFiled}>
          {markingFiled ? "Saving..." : `Mark ${workflowName} as filed`}
        </button>
      )}

      {readOnly && (
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>
          Read-only — company users handle document uploads and filing for this workflow.
        </p>
      )}
    </div>
  );
}
