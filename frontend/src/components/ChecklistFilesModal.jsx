import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { FilePreviewModal } from "./FilePreviewModal";

/** Popup listing every file uploaded against one checklist document slot -- a slot like
 *  "Purchase Invoices" can hold dozens of individual files for a period, which is too many to
 *  list inline on the checklist page itself, so they live behind this "View documents" button
 *  instead. */
export function ChecklistFilesModal({ clientId, workflowKey, documentName, period, onClose }) {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState(null);
  const [previewing, setPreviewing] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(
        `/api/documents/client/${clientId}/${workflowKey}/files?documentName=${encodeURIComponent(documentName)}&period=${period}`
      )
      .then(({ files }) => {
        if (!cancelled) setFiles(files);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, workflowKey, documentName, period]);

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
        style={{ gap: 12, maxWidth: 560, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>{documentName}</p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              {files ? `${files.length} document${files.length === 1 ? "" : "s"} — ${period}` : period}
            </p>
          </div>
          <button type="button" className="secondary" onClick={onClose} style={{ padding: "4px 10px", fontSize: 12 }}>
            Close
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}
        {files === null && !error && <p className="muted">Loading...</p>}
        {files && files.length === 0 && <p className="muted">No documents uploaded here yet.</p>}
        {files && files.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {files.map((f) => (
              <li
                key={f.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 13,
                  borderBottom: "1px solid #e2e8f0",
                  paddingBottom: 8,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.fileName}
                  <br />
                  <span className="muted">{new Date(f.uploadedAt).toLocaleString()}</span>
                </span>
                <span style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                  {f.hasFile && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() =>
                        setPreviewing({
                          url: `/api/documents/client/${clientId}/${workflowKey}/files/${f.id}?period=${period}`,
                          fileName: f.fileName,
                          driveWebViewLink: f.driveWebViewLink,
                        })
                      }
                    >
                      View
                    </button>
                  )}
                  {f.driveWebViewLink && !f.hasFile && (
                    <a href={f.driveWebViewLink} target="_blank" rel="noreferrer">
                      Drive
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

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
