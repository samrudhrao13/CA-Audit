import { useEffect, useState } from "react";
import { api } from "../lib/api";

/** Popup document viewer — fetches the file through the authenticated API (a plain `<a href>`
 *  to these routes 401s, since it can't carry the Authorization header) and previews it inline
 *  for images/PDFs, with Download and an optional "Open in Drive" action, all without leaving
 *  the page. Replaces separate "View file" (broken) + "Drive" (new tab) links. */
export function FilePreviewModal({ url, fileName, driveWebViewLink, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [objectUrl, setObjectUrl] = useState(null);
  const [contentType, setContentType] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;
    setLoading(true);
    setError(null);
    api
      .getBlob(url)
      .then(({ blob, contentType }) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
        setContentType(contentType);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  function handleDownload() {
    if (!objectUrl) return;
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName || "document";
    link.click();
  }

  const isImage = contentType?.startsWith("image/");
  const isPdf = contentType === "application/pdf";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.6)",
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
        style={{ gap: 12, maxWidth: 860, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ margin: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fileName || "Document"}
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {driveWebViewLink && (
              <a href={driveWebViewLink} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                Open in Drive
              </a>
            )}
            <button type="button" className="secondary" onClick={handleDownload} disabled={!objectUrl}>
              Download
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg)",
            borderRadius: "var(--radius)",
            minHeight: 320,
          }}
        >
          {loading && <p className="muted">Loading preview...</p>}
          {error && <p className="error-text">{error}</p>}
          {!loading && !error && isImage && (
            <img src={objectUrl} alt={fileName} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }} />
          )}
          {!loading && !error && isPdf && (
            <iframe src={objectUrl} title={fileName} style={{ width: "100%", height: "70vh", border: "none" }} />
          )}
          {!loading && !error && !isImage && !isPdf && (
            <p className="muted">Preview isn't available for this file type — use Download instead.</p>
          )}
        </div>
      </div>
    </div>
  );
}
