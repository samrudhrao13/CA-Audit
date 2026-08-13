import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

export function CompanySubscriptionsPage() {
  const { orgId } = useParams();
  const [company, setCompany] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [busyKey, setBusyKey] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState(null);

  async function load() {
    const [companyRes, catalogRes, subsRes] = await Promise.all([
      api.get(`/api/platform/companies/${orgId}`),
      api.get("/api/workflows/catalog"),
      api.get(`/api/platform/companies/${orgId}/subscriptions`),
    ]);
    setCompany(companyRes);
    setCatalog(catalogRes.workflows);
    setSubscriptions(subsRes.subscriptions);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function toggle(workflowKey, isActive) {
    setBusyKey(workflowKey);
    try {
      await api.post(`/api/platform/companies/${orgId}/subscriptions`, {
        workflowKey,
        status: isActive ? "inactive" : "active",
      });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleLogoUpload(e) {
    e.preventDefault();
    if (!logoFile) return;
    setUploadingLogo(true);
    setLogoError(null);
    try {
      const result = await api.uploadFile(`/api/platform/companies/${orgId}/logo`, "logo", logoFile);
      setCompany((c) => ({ ...c, logoUrl: result.logoUrl }));
      setLogoFile(null);
    } catch (err) {
      setLogoError(err.message);
    } finally {
      setUploadingLogo(false);
    }
  }

  if (!company) return <p>Loading...</p>;

  const statusByKey = new Map(subscriptions.map((s) => [s.workflowKey, s.status]));

  return (
    <div className="stack">
      <div>
        <Link to="/platform">&larr; All companies</Link>
        <h1>{company.name}</h1>
      </div>

      <div className="card">
        <p style={{ marginTop: 0, fontWeight: 600 }}>Company logo</p>
        {company.logoUrl && (
          <img
            src={company.logoUrl}
            alt={`${company.name} logo`}
            style={{ maxHeight: 64, display: "block", marginBottom: 12 }}
          />
        )}
        <form onSubmit={handleLogoUpload} className="row">
          <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files[0] || null)} />
          <button type="submit" className="secondary" disabled={!logoFile || uploadingLogo}>
            {uploadingLogo ? "Uploading..." : "Upload logo"}
          </button>
        </form>
        {logoError && <p className="error-text">{logoError}</p>}
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Shown to this company's admins and users throughout their portal. Image files only, max 300KB.
        </p>
      </div>

      <div>
        <h2>Subscriptions</h2>
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {catalog.map((wf) => {
            const isActive = statusByKey.get(wf.key) === "active";
            return (
              <li key={wf.key} className="card list-item-row">
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{wf.name}</p>
                  <p className="muted" style={{ margin: 0 }}>
                    {wf.description}
                  </p>
                </div>
                <button
                  className={isActive ? "secondary" : ""}
                  disabled={busyKey === wf.key}
                  onClick={() => toggle(wf.key, isActive)}
                >
                  {isActive ? "Revoke" : "Grant"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
