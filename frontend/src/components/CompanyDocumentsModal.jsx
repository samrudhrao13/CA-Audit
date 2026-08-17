import { useEffect, useState } from "react";
import { api } from "../lib/api";

/** Read-only popup listing everything in a client's "Company Documents" Drive folder —
 *  a quick way to check what's on file without opening the full client page. */
export function CompanyDocumentsModal({ clientId, clientName, onClose }) {
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/clients/${clientId}/company-documents`)
      .then(({ documents }) => {
        if (!cancelled) setDocuments(documents);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

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
        style={{ gap: 12, maxWidth: 520, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>Company documents</p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              {clientName}
            </p>
          </div>
          <button type="button" className="secondary" onClick={onClose} style={{ padding: "4px 10px", fontSize: 12 }}>
            Close
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}
        {documents === null && !error && <p className="muted">Loading...</p>}
        {documents && documents.length === 0 && (
          <p className="muted">No company documents uploaded for this client yet.</p>
        )}
        {documents && documents.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {documents.map((d) => (
              <li
                key={d.id}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}
              >
                <span>
                  {d.fileName}
                  <br />
                  <span className="muted">{new Date(d.uploadedAt).toLocaleString()}</span>
                </span>
                {d.driveWebViewLink && (
                  <a href={d.driveWebViewLink} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                    Open in Drive
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
