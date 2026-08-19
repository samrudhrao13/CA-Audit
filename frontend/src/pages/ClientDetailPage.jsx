import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ProgressBar } from "../components/ProgressBar";
import { useUserProfile } from "../context/UserProfileContext";
import { PROGRESS_STAGES, nextStage } from "../lib/progressStages";
import { CopyField } from "../components/CopyField";
import { ClientFormFields } from "../components/ClientFormFields";
import { describeTdsCode } from "../lib/tdsCodes";
import { describeSacCode } from "../lib/sacCodes";
import { CompanyDocumentsUpload } from "../components/CompanyDocumentsUpload";
import { CompanyDocumentsModal } from "../components/CompanyDocumentsModal";
import { HandscribeExtract } from "../components/HandscribeExtract";

// Workflows with their own dedicated workspace page (credentials + fetch + export).
// Anything not listed here just shows "Enabled" once the client is enrolled.
const WORKFLOW_WORKSPACE_PATHS = { GST: "gst", TDS: "tds" };

export function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const isAdmin = profile?.role === "COMPANY_ADMIN";
  const [client, setClient] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [progress, setProgress] = useState({});
  const [period, setPeriod] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [notifyPrefs, setNotifyPrefs] = useState(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError] = useState(null);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [members, setMembers] = useState([]);
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState(null);
  const [assignmentSaved, setAssignmentSaved] = useState(false);
  const [emailLog, setEmailLog] = useState([]);
  const [workflowAssignmentDrafts, setWorkflowAssignmentDrafts] = useState({});
  const [workflowAssignmentStatus, setWorkflowAssignmentStatus] = useState({});
  const [editing, setEditing] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  async function load() {
    const [clientRes, catalogRes, subsRes, progressRes, membersRes, emailLogRes] = await Promise.all([
      api.get(`/api/clients/${clientId}`),
      api.get("/api/workflows/catalog"),
      api.get("/api/workflows/subscriptions"),
      api.get(`/api/progress/client/${clientId}`),
      api.get("/api/team/members"),
      api.get(`/api/clients/${clientId}/email-log`),
    ]);
    setClient(clientRes);
    setCatalog(catalogRes.workflows);
    setSubscriptions(subsRes.subscriptions);
    setProgress(progressRes.progress);
    setPeriod(progressRes.period);
    setNotifyPrefs({
      notifyCompanyEmail: !!clientRes.notifyCompanyEmail,
      notifyContactPersonEmail: !!clientRes.notifyContactPersonEmail,
    });
    setMembers(membersRes.members);
    setAssignedUserIds(clientRes.assignedUserIds || []);
    setEmailLog(emailLogRes.emailLog);
    setWorkflowAssignmentDrafts(clientRes.workflowAssignments || {});
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function enable(workflowKey) {
    setBusyKey(workflowKey);
    try {
      await api.post(`/api/clients/${clientId}/workflows`, { workflowKey });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function advanceStage(workflowKey, currentStage) {
    setBusyKey(`progress:${workflowKey}`);
    try {
      await api.post(`/api/progress/client/${clientId}`, {
        workflowKey,
        period,
        stage: nextStage(currentStage || PROGRESS_STAGES[0]),
      });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function saveNotifyPrefs(e) {
    e.preventDefault();
    setSavingPrefs(true);
    setPrefsError(null);
    setPrefsSaved(false);
    try {
      await api.put(`/api/clients/${clientId}/notification-prefs`, notifyPrefs);
      setPrefsSaved(true);
    } catch (err) {
      setPrefsError(err.message);
    } finally {
      setSavingPrefs(false);
    }
  }

  function toggleAssignee(uid) {
    setAssignedUserIds((ids) => (ids.includes(uid) ? ids.filter((id) => id !== uid) : [...ids, uid]));
  }

  async function saveAssignment(e) {
    e.preventDefault();
    setSavingAssignment(true);
    setAssignmentError(null);
    setAssignmentSaved(false);
    try {
      await api.put(`/api/clients/${clientId}/assignment`, { assignedUserIds });
      setAssignmentSaved(true);
    } catch (err) {
      setAssignmentError(err.message);
    } finally {
      setSavingAssignment(false);
    }
  }

  function toggleWorkflowAssignee(workflowKey, uid) {
    setWorkflowAssignmentDrafts((drafts) => {
      const current = drafts[workflowKey] || [];
      const next = current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid];
      return { ...drafts, [workflowKey]: next };
    });
    setWorkflowAssignmentStatus((s) => ({ ...s, [workflowKey]: null }));
  }

  async function saveWorkflowAssignment(workflowKey) {
    setWorkflowAssignmentStatus((s) => ({ ...s, [workflowKey]: "saving" }));
    try {
      await api.put(`/api/clients/${clientId}/workflows/${workflowKey}/assignment`, {
        assignedUserIds: workflowAssignmentDrafts[workflowKey] || [],
      });
      setWorkflowAssignmentStatus((s) => ({ ...s, [workflowKey]: "saved" }));
      await load();
    } catch (err) {
      setWorkflowAssignmentStatus((s) => ({ ...s, [workflowKey]: err.message }));
    }
  }

  function startEdit() {
    setEditForm({
      name: client.name || "",
      companyType: client.companyType || "",
      natureOfBusiness: client.natureOfBusiness || "",
      gstin: client.gstin || "",
      pan: client.pan || "",
      tan: client.tan || "",
      hsnCode: client.hsnCode || "",
      cin: client.cin || "",
      sacCode: client.sacCode || "",
      addressLine1: client.addressLine1 || "",
      addressLine2: client.addressLine2 || "",
      addressLine3: client.addressLine3 || "",
      city: client.city || "",
      state: client.state || "",
      pinCode: client.pinCode || "",
      phoneNumber: client.phoneNumber || "",
      email: client.email || "",
      contactPersonName: client.contactPersonName || "",
      contactPersonPhone: client.contactPersonPhone || "",
      contactPersonEmail: client.contactPersonEmail || "",
      tdsApplicability: client.tdsApplicability || [],
      customFields: client.customFields || [],
      documentChecklistConfig: client.documentChecklistConfig || {},
    });
    setEditError(null);
    setEditing(true);
  }

  function setEditField(field) {
    return (e) => setEditForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function setEditFormValue(field, value) {
    setEditForm((f) => ({ ...f, [field]: value }));
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSavingEdit(true);
    setEditError(null);
    try {
      await api.put(`/api/clients/${clientId}`, editForm);
      setEditing(false);
      await load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${client.name}"? This removes the client and all its records from the app — but anything already stored in Drive (invoices, company documents) is kept exactly as is. This can't be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/clients/${clientId}`);
      navigate("/clients");
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  if (!client || !notifyPrefs) return <p>Loading...</p>;

  // Admins assign work to users, not to themselves/each other.
  const assignableMembers = members.filter((m) => m.role === "COMPANY_USER");

  const subscribedKeys = new Set(subscriptions.filter((s) => s.status === "active").map((s) => s.workflowKey));
  const enrolledKeys = new Set(client.enrolledWorkflows || []);
  // Company users only see workflows the admin has both enabled for this client AND (if it's
  // been split between teammates) assigned to them specifically — see visibleWorkflowKeys.
  const visibleCatalog = isAdmin ? catalog : catalog.filter((wf) => (client.visibleWorkflowKeys || []).includes(wf.key));

  return (
    <div className="stack">
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ margin: 0 }}>{client.name}</h1>
          {!editing && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {deleteError && <span className="error-text">{deleteError}</span>}
              <button type="button" className="secondary" onClick={() => setShowDocsModal(true)}>
                View company documents
              </button>
              {isAdmin && (
                <>
                  <button onClick={startEdit}>Edit client</button>
                  <button type="button" className="secondary" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Deleting..." : "Delete client"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <form onSubmit={saveEdit} className="card stack" style={{ gap: 20 }}>
            <ClientFormFields
              form={editForm}
              setField={setEditField}
              setFormValue={setEditFormValue}
              subscriptions={subscriptions}
            />
            {editError && <p className="error-text">{editError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save changes"}
              </button>
              <button type="button" className="secondary" disabled={savingEdit} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="card stack" style={{ gap: 20 }}>
            <div className="form-section">
              <h3>Company details</h3>
              <div className="row">
                <CopyField label="Client name" value={client.name} />
                <CopyField label="Type of company" value={client.companyType} />
                <CopyField label="Nature of company" value={client.natureOfBusiness} />
              </div>
            </div>

            <div className="form-section">
              <h3>Registration details</h3>
              <div className="row">
                <CopyField label="GSTIN" value={client.gstin} />
                <CopyField label="PAN number" value={client.pan} />
                <CopyField label="TAN number" value={client.tan} />
                <CopyField label="HSN code (goods)" value={client.hsnCode} />
                <CopyField label="CIN" value={client.cin} />
              </div>
              {client.sacCode && (
                <p className="muted" style={{ margin: 0 }}>
                  SAC code: {client.sacCode} — {describeSacCode(client.sacCode) || "Unknown code"}
                </p>
              )}
            </div>

            <div className="form-section">
              <h3>Address</h3>
              <CopyField label="Address line 1" value={client.addressLine1} />
              <CopyField label="Address line 2" value={client.addressLine2} />
              <CopyField label="Address line 3" value={client.addressLine3} />
              <div className="row">
                <CopyField label="City" value={client.city} />
                <CopyField label="State" value={client.state} />
                <CopyField label="PIN code" value={client.pinCode} />
                <CopyField label="Country" value={client.country} />
              </div>
            </div>

            <div className="form-section">
              <h3>Company contact</h3>
              <div className="row">
                <CopyField label="Phone number" value={client.phoneNumber} />
                <CopyField label="Email" value={client.email} />
              </div>
            </div>

            <div className="form-section">
              <h3>TDS applicability</h3>
              {(client.tdsApplicability || []).length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No TDS sections recorded.</p>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {client.tdsApplicability.map((entry, i) => (
                    <div key={i} className="copy-field">
                      <span className="copy-field-value">
                        {entry.code} ({entry.regime === "old" ? "old code" : "new code"}) —{" "}
                        {describeTdsCode(entry.regime, entry.code) || "Unknown code"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-section">
              <h3>Contact person</h3>
              <div className="row">
                <CopyField label="Name" value={client.contactPersonName} />
                <CopyField label="Contact number" value={client.contactPersonPhone} />
                <CopyField label="Email" value={client.contactPersonEmail} />
              </div>
            </div>

            <div className="form-section">
              <h3>Custom fields</h3>
              {(client.customFields || []).length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No extra fields added.</p>
              ) : (
                <div className="row">
                  {client.customFields.map((f, i) => (
                    <CopyField key={i} label={f.name} value={f.value} />
                  ))}
                </div>
              )}
            </div>

            <div className="form-section">
              <h3>Document checklist</h3>
              {Object.entries(client.documentChecklistConfig || {}).filter(
                ([, sel]) => (sel.predefinedSelected?.length || 0) + (sel.otherDocuments?.length || 0) > 0
              ).length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No documents selected yet.</p>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {Object.entries(client.documentChecklistConfig || {}).map(([workflowKey, sel]) => {
                    const docs = [...(sel.predefinedSelected || []), ...(sel.otherDocuments || [])];
                    if (docs.length === 0) return null;
                    const workflowName = subscriptions.find((s) => s.workflowKey === workflowKey)?.name || workflowKey;
                    return (
                      <div key={workflowKey}>
                        <p className="muted" style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600 }}>
                          {workflowName}
                        </p>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                          {docs.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={saveNotifyPrefs} className="card">
        <p style={{ marginTop: 0, fontWeight: 600 }}>Document-request email recipients</p>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={notifyPrefs.notifyContactPersonEmail}
            onChange={(e) => setNotifyPrefs((p) => ({ ...p, notifyContactPersonEmail: e.target.checked }))}
          />
          Contact person email ({client.contactPersonEmail})
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginTop: 4 }}>
          <input
            type="checkbox"
            checked={notifyPrefs.notifyCompanyEmail}
            onChange={(e) => setNotifyPrefs((p) => ({ ...p, notifyCompanyEmail: e.target.checked }))}
          />
          Company email ({client.email || "none on file"})
        </label>
        {prefsError && <p className="error-text">{prefsError}</p>}
        {prefsSaved && <p className="success-text">Saved — this will be used for every future document request.</p>}
        <button type="submit" className="secondary" disabled={savingPrefs} style={{ marginTop: 8 }}>
          {savingPrefs ? "Saving..." : "Save"}
        </button>
      </form>

      <div className="card">
        <p style={{ marginTop: 0, fontWeight: 600 }}>Document-request email history</p>
        {emailLog.length === 0 ? (
          <p className="muted">No document-request emails sent yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Sent</th>
                <th>Workflows</th>
                <th>Sent to</th>
              </tr>
            </thead>
            <tbody>
              {emailLog.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.period}</td>
                  <td>{new Date(entry.sentAt).toLocaleString()}</td>
                  <td>{(entry.workflows || []).join(", ")}</td>
                  <td>{(entry.recipients || []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <p style={{ marginTop: 0, fontWeight: 600 }}>Assigned team members</p>
        {isAdmin ? (
          <form onSubmit={saveAssignment}>
            {assignableMembers.length === 0 ? (
              <p className="muted">No team members yet — add some under Settings → Team.</p>
            ) : (
              assignableMembers.map((m) => (
                <label key={m.uid} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={assignedUserIds.includes(m.uid)}
                    onChange={() => toggleAssignee(m.uid)}
                  />
                  {m.name} <span className="muted">({m.userId})</span>
                </label>
              ))
            )}
            {assignmentError && <p className="error-text">{assignmentError}</p>}
            {assignmentSaved && <p className="success-text">Saved.</p>}
            <button type="submit" className="secondary" disabled={savingAssignment} style={{ marginTop: 8 }}>
              {savingAssignment ? "Saving..." : "Save"}
            </button>
          </form>
        ) : assignedUserIds.length === 0 ? (
          <p className="muted">Not assigned to anyone yet — ask your company admin.</p>
        ) : (
          <p className="muted">
            {members
              .filter((m) => assignedUserIds.includes(m.uid))
              .map((m) => m.name)
              .join(", ")}
          </p>
        )}
      </div>

      <div>
        <h2>Workflows{period ? ` — ${period}` : ""}</h2>
        {visibleCatalog.length === 0 && (
          <p className="muted">No workflows enabled for this client yet — ask your company admin.</p>
        )}
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleCatalog.map((wf) => {
            const enrolled = enrolledKeys.has(wf.key);
            const subscribed = subscribedKeys.has(wf.key);
            const wfProgress = progress[wf.key];
            // This client's own selected documents for this workflow (see the "Document
            // checklist" section above) — not the admin's company-wide default list, since
            // not every default is applicable to every client.
            const clientDocSelection = client.documentChecklistConfig?.[wf.key];
            const clientDocCount =
              (clientDocSelection?.predefinedSelected?.length || 0) + (clientDocSelection?.otherDocuments?.length || 0);

            return (
              <li key={wf.key} className="card">
                <div className="list-item-row" style={{ padding: 0, marginBottom: enrolled ? 12 : 0 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{wf.name}</p>
                    <p className="muted" style={{ margin: 0 }}>
                      {wf.description}
                    </p>
                  </div>
                  {enrolled ? (
                    WORKFLOW_WORKSPACE_PATHS[wf.key] ? (
                      <Link to={`/clients/${client.id}/${WORKFLOW_WORKSPACE_PATHS[wf.key]}`}>
                        <button>Open {wf.name} workspace</button>
                      </Link>
                    ) : (
                      <span className="success-text">Enabled</span>
                    )
                  ) : subscribed ? (
                    <button className="secondary" disabled={busyKey === wf.key} onClick={() => enable(wf.key)}>
                      {busyKey === wf.key ? "Enabling..." : "Enable"}
                    </button>
                  ) : (
                    <span className="muted">Not in your subscription</span>
                  )}
                </div>

                {enrolled && (
                  <div>
                    {clientDocCount > 0 ? (
                      <ProgressBar
                        stage={wfProgress?.stage ?? "not_started"}
                        documentsUploaded={wfProgress?.documentsUploaded ?? 0}
                        documentsTotal={wfProgress?.documentsTotal ?? clientDocCount}
                        linkTo={`/clients/${client.id}/documents/${wf.key}`}
                      />
                    ) : (
                      <>
                        <ProgressBar stage={wfProgress?.stage ?? "not_started"} documentsUploaded={0} documentsTotal={null} />
                        {(wfProgress?.stage ?? null) !== "filed" &&
                          (isAdmin ? (
                            <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
                              Read-only — company users advance this workflow's progress.
                            </p>
                          ) : (
                            <button
                              className="secondary"
                              style={{ marginTop: 8 }}
                              disabled={busyKey === `progress:${wf.key}`}
                              onClick={() => advanceStage(wf.key, wfProgress?.stage)}
                            >
                              Advance to next stage
                            </button>
                          ))}
                      </>
                    )}

                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
                      {isAdmin ? (
                        assignedUserIds.length === 0 ? (
                          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                            Assign team members to this client above before splitting {wf.name} between them.
                          </p>
                        ) : (
                          <>
                            <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 13 }}>Assigned to</p>
                            {assignableMembers
                              .filter((m) => assignedUserIds.includes(m.uid))
                              .map((m) => (
                                <label
                                  key={m.uid}
                                  style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={(workflowAssignmentDrafts[wf.key] || []).includes(m.uid)}
                                    onChange={() => toggleWorkflowAssignee(wf.key, m.uid)}
                                  />
                                  {m.name} <span className="muted">({m.userId})</span>
                                </label>
                              ))}
                            {(workflowAssignmentDrafts[wf.key] || []).length === 0 && (
                              <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                                Nobody selected — everyone assigned to this client can work on {wf.name}.
                              </p>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                              <button
                                type="button"
                                className="secondary"
                                disabled={workflowAssignmentStatus[wf.key] === "saving"}
                                onClick={() => saveWorkflowAssignment(wf.key)}
                              >
                                {workflowAssignmentStatus[wf.key] === "saving" ? "Saving..." : "Save"}
                              </button>
                              {workflowAssignmentStatus[wf.key] === "saved" && (
                                <span className="success-text">Saved.</span>
                              )}
                              {workflowAssignmentStatus[wf.key] &&
                                !["saving", "saved"].includes(workflowAssignmentStatus[wf.key]) && (
                                  <span className="error-text">{workflowAssignmentStatus[wf.key]}</span>
                                )}
                            </div>
                          </>
                        )
                      ) : (
                        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                          Assigned to:{" "}
                          {(client.workflowAssignments?.[wf.key] || []).length === 0
                            ? "everyone assigned to this client"
                            : members
                                .filter((m) => (client.workflowAssignments?.[wf.key] || []).includes(m.uid))
                                .map((m) => m.name)
                                .join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {!isAdmin && <HandscribeExtract clientId={client.id} />}

      {isAdmin && <CompanyDocumentsUpload clientId={client.id} />}

      {showDocsModal && (
        <CompanyDocumentsModal
          clientId={client.id}
          clientName={client.name}
          onClose={() => setShowDocsModal(false)}
        />
      )}
    </div>
  );
}
