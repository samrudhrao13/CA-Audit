import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { usePagination } from "../hooks/usePagination";
import { Pagination } from "../components/Pagination";

export function SettingsTeamPage() {
  const [members, setMembers] = useState(null);
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const { pageItems: pagedMembers, page, setPage, totalPages } = usePagination(members || []);

  async function load() {
    const { members } = await api.get("/api/team/members");
    setMembers(members);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setCreated(null);
    try {
      const result = await api.post("/api/team/users", { name, contactEmail });
      setCreated(result);
      setName("");
      setContactEmail("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="stack">
      <h1>Team</h1>

      <form onSubmit={handleCreate} className="row card">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="contactEmail">Contact email</label>
          <input
            id="contactEmail"
            type="email"
            required
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
        <button type="submit" disabled={creating}>
          {creating ? "Creating..." : "Create user"}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {created && (
        <div className="card" style={{ background: "#f0fdf4" }}>
          <p style={{ marginTop: 0 }}>Account created — share these with the new user (shown once):</p>
          <p>
            User ID: <strong>{created.userId}</strong>
            <br />
            Temporary password: <strong>{created.tempPassword}</strong>
          </p>
        </div>
      )}

      <div>
        <h2>Members</h2>
        {members === null ? (
          <p>Loading...</p>
        ) : (
          <>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {pagedMembers.map((m) => (
                <li key={m.uid} className="card list-item-row">
                  <span>
                    {m.name} <span className="muted">({m.userId})</span>
                  </span>
                  <span className="muted">{m.role === "COMPANY_ADMIN" ? "Admin" : "User"}</span>
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
