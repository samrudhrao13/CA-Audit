import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useUserProfile } from "../context/UserProfileContext";
import { ProgressBar } from "../components/ProgressBar";
import { FileDropZone } from "../components/FileDropZone";
import { FilePreviewModal } from "../components/FilePreviewModal";

// Must match backend/src/routes/documents.js's CHALLAN_WORKFLOWS.
const CHALLAN_WORKFLOWS = ["TDS", "GST"];

function DocumentRow({ clientId, workflowKey, period, doc, readOnly, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  async function handleFilesChanged(newFiles) {
    const file = newFiles[newFiles.length - 1];
    if (!file) {
      setFiles(newFiles);
      return;
    }
    if (doc.uploaded && doc.fileName) {
      const proceed = confirm(`"${doc.name}" already has a file uploaded (${doc.fileName}). Replace it with "${file.name}"?`);
      if (!proceed) return;
    }
    setFiles(newFiles);
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
          {doc.uploaded && doc.hasFile && (
            <button type="button" className="link-btn" onClick={() => setPreviewing(true)}>
              View
            </button>
          )}
        </div>
      </div>

      {doc.uploaded && doc.fileName && (
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
          {doc.fileName}
          {doc.uploadedAt && ` — uploaded ${new Date(doc.uploadedAt).toLocaleString()}`}
          {doc.source === "extraction" && " — via Extract documents"}
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

      {previewing && (
        <FilePreviewModal
          url={`/api/documents/client/${clientId}/${workflowKey}/file?documentName=${encodeURIComponent(doc.name)}&period=${period}`}
          fileName={doc.fileName || doc.name}
          driveWebViewLink={doc.driveWebViewLink}
          onClose={() => setPreviewing(false)}
        />
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
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [markingBilled, setMarkingBilled] = useState(false);
  const [billError, setBillError] = useState(null);

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

  async function handleMarkBilled() {
    const invoiceFile = invoiceFiles[0];
    if (!invoiceFile) return;
    setMarkingBilled(true);
    setBillError(null);
    try {
      await api.uploadFile(`/api/documents/client/${clientId}/${workflowKey}/mark-billed`, "file", invoiceFile, { period });
      setInvoiceFiles([]);
      await load();
    } catch (err) {
      setBillError(err.message);
    } finally {
      setMarkingBilled(false);
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

  const challanDoc = CHALLAN_WORKFLOWS.includes(workflowKey) ? documents.find((d) => d.name === "Challan") : null;
  const regularDocs = challanDoc ? documents.filter((d) => d.name !== "Challan") : documents;
  const regularDone = regularDocs.length > 0 && regularDocs.every((d) => d.uploaded);

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
        {wfProgress?.filedOn && (
          <p className="success-text" style={{ margin: "10px 0 0" }}>
            Filed on {new Date(wfProgress.filedOn).toLocaleDateString()}.
          </p>
        )}
        {!isAdmin && wfProgress?.stage === "filed" && (
          <div style={{ marginTop: 10 }}>
            <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
              Attach the invoice for this period's {workflowKey} services — it's saved to Drive and
              emailed to the client automatically.
            </p>
            <FileDropZone
              id={`invoice-${workflowKey}`}
              files={invoiceFiles}
              onChange={setInvoiceFiles}
              disabled={markingBilled}
              maxFiles={1}
              hint="Invoice as PDF or image"
            />
            <button style={{ marginTop: 10 }} disabled={invoiceFiles.length === 0 || markingBilled} onClick={handleMarkBilled}>
              {markingBilled ? "Sending..." : `Mark ${workflowKey} as billed & send invoice`}
            </button>
            {billError && <p className="error-text">{billError}</p>}
          </div>
        )}
        {wfProgress?.stage === "billed" && wfProgress?.billedOn && (
          <p className="success-text" style={{ margin: "10px 0 0" }}>
            Billed on {new Date(wfProgress.billedOn).toLocaleDateString()}.
            {wfProgress.invoiceFileName && ` Invoice: ${wfProgress.invoiceFileName}`}
            {wfProgress.invoiceDriveWebViewLink && (
              <>
                {" — "}
                <a href={wfProgress.invoiceDriveWebViewLink} target="_blank" rel="noreferrer">
                  Open in Drive
                </a>
              </>
            )}
          </p>
        )}
      </div>

      {regularDocs.length === 0 ? (
        <p className="muted">
          No documents selected for this client yet — a company admin can pick which ones apply
          under Clients → this client → Edit client → "Document checklist."
        </p>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {regularDocs.map((doc) => (
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

      {challanDoc && (
        <div className="card">
          <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Final step — {workflowKey} challan</p>
          {regularDone ? (
            <>
              <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
                Upload the challan for this period. It's saved to Drive and a copy is emailed
                automatically to the client's configured contact.
              </p>
              <DocumentRow
                clientId={clientId}
                workflowKey={workflowKey}
                period={period}
                doc={challanDoc}
                readOnly={isAdmin}
                onUploaded={load}
              />
            </>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Upload all the documents above first to unlock the challan upload.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
