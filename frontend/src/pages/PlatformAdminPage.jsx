import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { INDIAN_STATES } from "../lib/indianStates";
import { usePagination } from "../hooks/usePagination";
import { Pagination } from "../components/Pagination";

const EMPTY_FORM = {
  companyName: "",
  gstin: "",
  pan: "",
  tan: "",
  hsnSacCode: "",
  addressLine1: "",
  addressLine2: "",
  addressLine3: "",
  city: "",
  state: "",
  phoneNumber: "",
  email: "",
  contactPersonName: "",
  contactPersonPhone: "",
  contactPersonEmail: "",
  workflowKeys: [],
};

export function PlatformAdminPage() {
  const [companies, setCompanies] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const { pageItems: pagedCompanies, page, setPage, totalPages } = usePagination(companies || []);

  async function load() {
    const [{ companies }, { workflows }] = await Promise.all([
      api.get("/api/platform/companies"),
      api.get("/api/workflows/catalog"),
    ]);
    setCompanies(companies);
    setCatalog(workflows);
  }

  useEffect(() => {
    load();
  }, []);

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function toggleWorkflow(key) {
    setForm((f) => ({
      ...f,
      workflowKeys: f.workflowKeys.includes(key)
        ? f.workflowKeys.filter((k) => k !== key)
        : [...f.workflowKeys, key],
    }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setCreated(null);
    try {
      const result = await api.post("/api/platform/companies", form);
      setCreated(result);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="stack">
      <h1>Companies</h1>

        <form onSubmit={handleCreate} className="card stack" style={{ gap: 20 }}>
          <div className="form-section">
            <h3>Company details</h3>
            <div className="field">
              <label htmlFor="companyName">Company name</label>
              <input id="companyName" required value={form.companyName} onChange={setField("companyName")} />
            </div>
          </div>

          <div className="form-section">
            <h3>Registration details</h3>
            <div className="row">
              <div className="field">
                <label htmlFor="gstin">GSTIN</label>
                <input id="gstin" value={form.gstin} onChange={setField("gstin")} />
              </div>
              <div className="field">
                <label htmlFor="pan">PAN number</label>
                <input id="pan" value={form.pan} onChange={setField("pan")} />
              </div>
              <div className="field">
                <label htmlFor="tan">TAN number</label>
                <input id="tan" value={form.tan} onChange={setField("tan")} />
              </div>
              <div className="field">
                <label htmlFor="hsnSacCode">HSN/SAC code</label>
                <input id="hsnSacCode" value={form.hsnSacCode} onChange={setField("hsnSacCode")} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Address</h3>
            <div className="field">
              <label htmlFor="addressLine1">Address line 1</label>
              <input id="addressLine1" value={form.addressLine1} onChange={setField("addressLine1")} />
            </div>
            <div className="field">
              <label htmlFor="addressLine2">Address line 2</label>
              <input id="addressLine2" value={form.addressLine2} onChange={setField("addressLine2")} />
            </div>
            <div className="field">
              <label htmlFor="addressLine3">Address line 3</label>
              <input id="addressLine3" value={form.addressLine3} onChange={setField("addressLine3")} />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="city">City</label>
                <input id="city" value={form.city} onChange={setField("city")} />
              </div>
              <div className="field">
                <label htmlFor="state">State</label>
                <select id="state" value={form.state} onChange={setField("state")}>
                  <option value="">Select...</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="country">Country</label>
                <input id="country" value="India" disabled />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Company contact</h3>
            <div className="row">
              <div className="field">
                <label htmlFor="phoneNumber">Phone number</label>
                <input id="phoneNumber" value={form.phoneNumber} onChange={setField("phoneNumber")} />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={form.email} onChange={setField("email")} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Contact person (becomes the company admin login)</h3>
            <div className="row">
              <div className="field">
                <label htmlFor="contactPersonName">Name</label>
                <input
                  id="contactPersonName"
                  required
                  value={form.contactPersonName}
                  onChange={setField("contactPersonName")}
                />
              </div>
              <div className="field">
                <label htmlFor="contactPersonPhone">Contact number</label>
                <input
                  id="contactPersonPhone"
                  value={form.contactPersonPhone}
                  onChange={setField("contactPersonPhone")}
                />
              </div>
              <div className="field">
                <label htmlFor="contactPersonEmail">Email</label>
                <input
                  id="contactPersonEmail"
                  type="email"
                  required
                  value={form.contactPersonEmail}
                  onChange={setField("contactPersonEmail")}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Workflows included in their subscription</h3>
            {catalog.length === 0 ? (
              <p className="muted">No workflows in the catalog yet.</p>
            ) : (
              catalog.map((wf) => (
                <label key={wf.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={form.workflowKeys.includes(wf.key)}
                    onChange={() => toggleWorkflow(wf.key)}
                  />
                  {wf.name}
                </label>
              ))
            )}
            <p className="muted" style={{ margin: 0 }}>
              Only grant what they've actually paid for — process this after you've received the invoice.
            </p>
          </div>

          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={creating} style={{ alignSelf: "flex-start" }}>
            {creating ? "Creating..." : "Create company"}
          </button>
        </form>

        {created && (
          <div className="card" style={{ background: "#f0fdf4" }}>
            <p style={{ marginTop: 0 }}>
              <strong>{created.companyName}</strong> created. Share these with the company admin — shown once:
            </p>
            <p>
              User ID: <strong>{created.userId}</strong>
              <br />
              Temporary password: <strong>{created.tempPassword}</strong>
            </p>
          </div>
        )}

        <div>
          <h2>All companies</h2>
          {companies === null ? (
            <p>Loading...</p>
          ) : companies.length === 0 ? (
            <p className="muted">No companies yet.</p>
          ) : (
            <>
              <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {pagedCompanies.map((c) => (
                  <li key={c.id} className="card list-item-row">
                    <span>{c.name}</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span className="muted">{c.status}</span>
                      <Link to={`/platform/companies/${c.id}`}>
                        <button className="secondary">Manage subscriptions</button>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </div>
    </div>
  );
}
