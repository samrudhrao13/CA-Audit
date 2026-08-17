import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useUserProfile } from "../context/UserProfileContext";
import { StatusDot } from "../components/StatusDot";
import { workflowBadge } from "../lib/workflowBadge";
import { CLIENT_STATUS_META } from "../lib/clientStatus";
import { usePagination } from "../hooks/usePagination";
import { Pagination } from "../components/Pagination";
import { ClientFormFields } from "../components/ClientFormFields";
import { CompanyDocumentsUpload } from "../components/CompanyDocumentsUpload";
import { CompanyDocumentsModal } from "../components/CompanyDocumentsModal";

const EMPTY_FORM = {
  name: "",
  companyType: "",
  natureOfBusiness: "",
  gstin: "",
  pan: "",
  tan: "",
  hsnCode: "",
  cin: "",
  sacCode: "",
  addressLine1: "",
  addressLine2: "",
  addressLine3: "",
  city: "",
  state: "",
  pinCode: "",
  phoneNumber: "",
  email: "",
  contactPersonName: "",
  contactPersonPhone: "",
  contactPersonEmail: "",
  tdsApplicability: [],
  customFields: [],
  documentChecklistConfig: {},
  notifyCompanyEmail: false,
  notifyContactPersonEmail: true,
};

function StatCard({ label, count, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card"
      style={{
        flex: "1 1 140px",
        textAlign: "left",
        border: active ? `2px solid ${color}` : "1px solid #e2e8f0",
      }}
    >
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        {label}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, color }}>{count}</p>
    </button>
  );
}

export function ClientsPage() {
  const { profile } = useUserProfile();
  const isAdmin = profile?.role === "COMPANY_ADMIN";
  const [clients, setClients] = useState(null);
  const [timelineByKey, setTimelineByKey] = useState({});
  const [subscriptions, setSubscriptions] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [createdClient, setCreatedClient] = useState(null);
  const [viewingDocsFor, setViewingDocsFor] = useState(null);

  async function load() {
    const [{ clients }, { subscriptions }, { members }] = await Promise.all([
      api.get("/api/clients"),
      api.get("/api/workflows/subscriptions"),
      api.get("/api/team/members"),
    ]);
    setClients(clients);
    setTimelineByKey(Object.fromEntries(subscriptions.map((s) => [s.workflowKey, s.timeline])));
    setSubscriptions(subscriptions);
    setMembers(members);
  }

  useEffect(() => {
    load();
  }, []);

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function setFormValue(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setCheckbox(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.checked }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const client = await api.post("/api/clients", form);
      setForm(EMPTY_FORM);
      // Don't close the form yet — the client now exists, so this is the first point a
      // company-documents upload can target it (Drive folders are per-client). Step into a
      // "upload documents now" stage instead, refreshing the list in the background.
      setCreatedClient(client);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function finishCreateFlow() {
    setCreatedClient(null);
    setShowCreateForm(false);
  }

  async function handleDelete(e, client) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        `Delete "${client.name}"? This removes the client and all its records from the app — but anything already stored in Drive (invoices, company documents) is kept exactly as is. This can't be undone.`
      )
    ) {
      return;
    }
    setDeletingId(client.id);
    setDeleteError(null);
    try {
      await api.delete(`/api/clients/${client.id}`);
      await load();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const statusCounts = (clients || []).reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  const nameByUid = Object.fromEntries(members.map((m) => [m.uid, m.name]));
  // Admins assign work to users, not to themselves/each other — so they're not a valid filter option.
  const assignableMembers = members.filter((m) => m.role === "COMPANY_USER");

  const filteredClients = (clients || []).filter((client) => {
    if (statusFilter !== "all" && client.status !== statusFilter) return false;
    if (workflowFilter !== "all" && !(client.enrolledWorkflows || []).includes(workflowFilter)) return false;
    if (assigneeFilter !== "all" && !(client.assignedUserIds || []).includes(assigneeFilter)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = [
        client.name,
        client.gstin,
        client.pan,
        client.tan,
        client.cin,
        client.contactPersonName,
        client.email,
        client.contactPersonEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const { pageItems: pagedClients, page, setPage, totalPages, pageSize } = usePagination(filteredClients);

  return (
    <div className="stack">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Clients</h1>
        {isAdmin && !showCreateForm && (
          <button type="button" onClick={() => setShowCreateForm(true)}>
            + New client
          </button>
        )}
      </div>

      {isAdmin && showCreateForm && !createdClient && (
      <form onSubmit={handleCreate} className="card stack" style={{ gap: 20 }}>
        <ClientFormFields form={form} setField={setField} setFormValue={setFormValue} subscriptions={subscriptions} />

        <div className="form-section">
          <h3>Document-request emails go to</h3>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={form.notifyContactPersonEmail}
              onChange={setCheckbox("notifyContactPersonEmail")}
            />
            Contact person email ({form.contactPersonEmail || "not filled in yet"})
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="checkbox" checked={form.notifyCompanyEmail} onChange={setCheckbox("notifyCompanyEmail")} />
            Company email ({form.email || "not filled in yet"})
          </label>
          <p className="muted" style={{ margin: 0 }}>
            Saved with the client and reused automatically for every future month.
          </p>
        </div>

        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={creating}>
            {creating ? "Adding..." : "Add client"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={creating}
            onClick={() => {
              setShowCreateForm(false);
              setForm(EMPTY_FORM);
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      </form>
      )}

      {isAdmin && createdClient && (
        <div className="card stack" style={{ gap: 16 }}>
          <p style={{ margin: 0 }}>
            <strong>{createdClient.name}</strong> was added. Upload any registration certificates,
            agreements, or other company documents now, or skip and add them later from the
            client's page.
          </p>
          <CompanyDocumentsUpload clientId={createdClient.id} />
          <div>
            <button type="button" onClick={finishCreateFlow}>
              Done
            </button>
          </div>
        </div>
      )}

      {clients !== null && clients.length > 0 && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 12 }}>
            <StatCard
              label="Total clients"
              count={clients.length}
              color="#0f172a"
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            />
            {Object.entries(CLIENT_STATUS_META).map(([key, meta]) => (
              <StatCard
                key={key}
                label={meta.label}
                count={statusCounts[key] || 0}
                color={meta.color}
                active={statusFilter === key}
                onClick={() => setStatusFilter((f) => (f === key ? "all" : key))}
              />
            ))}
          </div>

          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "2 1 260px" }}>
              <label htmlFor="clientSearch">Search</label>
              <input
                id="clientSearch"
                placeholder="Search by name, GSTIN, PAN, contact..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: "1 1 160px" }}>
              <label htmlFor="statusFilter">Status</label>
              <select id="statusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {Object.entries(CLIENT_STATUS_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: "1 1 160px" }}>
              <label htmlFor="workflowFilter">Workflow</label>
              <select id="workflowFilter" value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value)}>
                <option value="all">All workflows</option>
                {Object.keys(timelineByKey).map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <div className="field" style={{ flex: "1 1 160px" }}>
                <label htmlFor="assigneeFilter">Assigned to</label>
                <select id="assigneeFilter" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                  <option value="all">Everyone</option>
                  {assignableMembers.map((m) => (
                    <option key={m.uid} value={m.uid}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {clients === null ? (
        <p>Loading...</p>
      ) : clients.length === 0 ? (
        <p className="muted">No clients yet — add your first one above.</p>
      ) : filteredClients.length === 0 ? (
        <p className="muted">No clients match your search/filters.</p>
      ) : (
        <>
        {deleteError && <p className="error-text">{deleteError}</p>}
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {pagedClients.map((client, index) => (
            <li key={client.id} className="card">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <Link
                  to={`/clients/${client.id}`}
                  className="stack"
                  style={{ gap: 8, textDecoration: "none", flex: 1, minWidth: 0 }}
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span className="muted" style={{ fontSize: 12, minWidth: 18, display: "inline-block" }}>
                        {(page - 1) * pageSize + index + 1}
                      </span>
                      <strong>{client.name}</strong>
                    </span>
                    <StatusDot status={client.status} />
                  </span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingLeft: 28 }}>
                    {client.enrolledWorkflows?.length ? (
                      client.enrolledWorkflows.map((key) => {
                        const badge = workflowBadge(key, timelineByKey[key], client.progress?.[key]);
                        return (
                          <span
                            key={key}
                            className="muted"
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: badge.color,
                                display: "inline-block",
                                flexShrink: 0,
                              }}
                            />
                            {badge.label}
                          </span>
                        );
                      })
                    ) : (
                      <span className="muted">No workflows enabled</span>
                    )}
                  </span>
                  <span className="muted" style={{ fontSize: 12, paddingLeft: 28 }}>
                    Assigned to:{" "}
                    {client.assignedUserIds?.length
                      ? client.assignedUserIds.map((uid) => nameByUid[uid] || uid).join(", ")
                      : "Unassigned"}
                  </span>
                </Link>
                <button
                  type="button"
                  className="secondary"
                  style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setViewingDocsFor(client);
                  }}
                >
                  Documents
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }}
                    disabled={deletingId === client.id}
                    onClick={(e) => handleDelete(e, client)}
                  >
                    {deletingId === client.id ? "Deleting..." : "Delete"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {viewingDocsFor && (
        <CompanyDocumentsModal
          clientId={viewingDocsFor.id}
          clientName={viewingDocsFor.name}
          onClose={() => setViewingDocsFor(null)}
        />
      )}
    </div>
  );
}
