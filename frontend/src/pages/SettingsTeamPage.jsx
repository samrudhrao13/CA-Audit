import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { usePagination } from "../hooks/usePagination";
import { Pagination } from "../components/Pagination";

export function SettingsTeamPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState(null);
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [removingUid, setRemovingUid] = useState(null);
  const [removeError, setRemoveError] = useState(null);
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

  async function handleRemove(member) {
    if (!confirm(`Remove ${member.name}? They'll no longer be able to log in, but their name stays on past assignments and uploads.`)) {
      return;
    }
    setRemovingUid(member.uid);
    setRemoveError(null);
    try {
      await api.delete(`/api/team/users/${member.uid}`);
      await load();
    } catch (err) {
      setRemoveError(err.message);
    } finally {
      setRemovingUid(null);
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
        {removeError && <p className="error-text">{removeError}</p>}
        {members === null ? (
          <p>Loading...</p>
        ) : (
          <>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {pagedMembers.map((m) => {
                const removed = m.status === "removed";
                return (
                  <li key={m.uid} className="card list-item-row" style={removed ? { opacity: 0.6 } : undefined}>
                    <span>
                      {m.name} <span className="muted">({m.userId})</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="muted">{m.role === "COMPANY_ADMIN" ? "Admin" : "User"}</span>
                      {removed ? (
                        <span className="muted">Removed</span>
                      ) : (
                        m.role === "COMPANY_USER" &&
                        m.uid !== user?.uid && (
                          <button
                            type="button"
                            className="secondary"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            disabled={removingUid === m.uid}
                            onClick={() => handleRemove(m)}
                          >
                            {removingUid === m.uid ? "Removing..." : "Remove"}
                          </button>
                        )
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
