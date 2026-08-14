import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useUserProfile } from "../context/UserProfileContext";
import { ProgressBar } from "../components/ProgressBar";
import { FileDropZone } from "../components/FileDropZone";

function DocumentRow({ clientId, workflowKey, period, doc, readOnly, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFilesChanged(newFiles) {
    setFiles(newFiles);
    const file = newFiles[newFiles.length - 1];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadFile(`/api/documents/client/${clientId}/${workflowKey}/upload`, "file", file, {
        documentName: doc.name,
        period,
      });
      setFiles([]);
      await onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: doc.uploaded ? 4 : 10 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          {doc.uploaded ? "✅" : "⬜"} {doc.name}
        </p>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {doc.uploaded && (
            <a
              href={`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/documents/client/${clientId}/${workflowKey}/file?documentName=${encodeURIComponent(doc.name)}&period=${period}`}
              target="_blank"
              rel="noreferrer"
            >
              View
            </a>
          )}
          {doc.uploaded && doc.driveWebViewLink && (
            <a href={doc.driveWebViewLink} target="_blank" rel="noreferrer" title="Open in Google Drive">
              Drive
            </a>
          )}
        </div>
      </div>

      {doc.uploaded && doc.fileName && (
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
          {doc.fileName}
          {doc.uploadedAt && ` — uploaded ${new Date(doc.uploadedAt).toLocaleString()}`}
        </p>
      )}

      {!readOnly && (
        <>
          <FileDropZone
            id={`doc-${workflowKey}-${doc.name}`}
            files={files}
            onChange={handleFilesChanged}
            disabled={uploading}
            maxFiles={1}
          />
          {uploading && (
            <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
              Uploading...
            </p>
          )}
          {error && (
            <p className="error-text" style={{ margin: "6px 0 0" }}>
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Dedicated full-page document checklist — one place to upload every required document for a
 *  client's workflow and see each one marked received, instead of the compact summary embedded
 *  on the client's page. Surfaces load errors directly (e.g. "this workflow isn't assigned to
 *  you") rather than silently showing nothing, which is what made this hard to diagnose before. */
export function DocumentChecklistPage() {
  const { clientId, workflowKey } = useParams();
  const { profile } = useUserProfile();
  const isAdmin = profile?.role === "COMPANY_ADMIN";

  const [client, setClient] = useState(null);
  const [period, setPeriod] = useState(null);
  const [wfProgress, setWfProgress] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [allUploaded, setAllUploaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [markingFiled, setMarkingFiled] = useState(false);
  const [markError, setMarkError] = useState(null);

  async function load() {
    setLoadError(null);
    try {
      const [clientRes, progressRes, checklistRes] = await Promise.all([
        api.get(`/api/clients/${clientId}`),
        api.get(`/api/progress/client/${clientId}`),
        api.get(`/api/documents/client/${clientId}/${workflowKey}`),
      ]);
      setClient(clientRes);
      setPeriod(progressRes.period);
      setWfProgress(progressRes.progress?.[workflowKey] ?? null);
      setDocuments(checklistRes.documents);
      setAllUploaded(checklistRes.allUploaded);
    } catch (err) {
      setLoadError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, workflowKey]);

  async function handleMarkFiled() {
    setMarkingFiled(true);
    setMarkError(null);
    try {
      await api.post(`/api/documents/client/${clientId}/${workflowKey}/mark-filed`, { period });
      await load();
    } catch (err) {
      setMarkError(err.message);
    } finally {
      setMarkingFiled(false);
    }
  }

  if (loadError) {
    return (
      <div className="stack">
        <Link to={`/clients/${clientId}`}>&larr; Back to client</Link>
        <p className="error-text">Couldn't load this checklist: {loadError}</p>
        <p className="muted">
          If this keeps happening, it likely means this workflow isn't assigned to you for this
          client — ask your company admin to check under the client's "Assigned to" and per-workflow
          assignment settings.
        </p>
      </div>
    );
  }

  if (!client || documents === null) return <p>Loading...</p>;

  return (
    <div className="stack">
      <div>
        <Link to={`/clients/${clientId}`} style={{ fontSize: 13 }}>
          &larr; Back to {client.name}
        </Link>
        <h1 style={{ margin: "6px 0 0" }}>
          {client.name} — {workflowKey} document checklist
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {period}
        </p>
      </div>

      <div className="card">
        <ProgressBar
          stage={wfProgress?.stage ?? "not_started"}
          percent={wfProgress?.percent ?? 0}
          documentsUploaded={wfProgress?.documentsUploaded ?? 0}
          documentsTotal={wfProgress?.documentsTotal ?? documents.length}
        />
        {isAdmin && (
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>
            Read-only — company users handle document uploads and filing for this workflow.
          </p>
        )}
        {!isAdmin && allUploaded && wfProgress?.stage === "ready_for_filing" && (
          <>
            <button style={{ marginTop: 10 }} disabled={markingFiled} onClick={handleMarkFiled}>
              {markingFiled ? "Saving..." : `Mark ${workflowKey} as filed`}
            </button>
            {markError && <p className="error-text">{markError}</p>}
          </>
        )}
        {wfProgress?.stage === "filed" && wfProgress?.filedOn && (
          <p className="success-text" style={{ margin: "10px 0 0" }}>
            Filed on {new Date(wfProgress.filedOn).toLocaleDateString()}.
          </p>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="muted">
          No documents selected for this client yet — a company admin can pick which ones apply
          under Clients → this client → Edit client → "Document checklist."
        </p>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {documents.map((doc) => (
            <DocumentRow
              key={doc.name}
              clientId={clientId}
              workflowKey={workflowKey}
              period={period}
              doc={doc}
              readOnly={isAdmin}
              onUploaded={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
