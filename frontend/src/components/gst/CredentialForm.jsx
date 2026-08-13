import { useState } from "react";
import { api } from "../../lib/api";

export function CredentialForm({ clientId, hasCredential, onSaved }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!consent) return;
    setStatus("saving");
    setError(null);
    try {
      await api.post(`/api/clients/${clientId}/gst/credentials`, { username, password, consent: true });
      setUsername("");
      setPassword("");
      setConsent(false);
      setStatus("saved");
      onSaved?.();
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>GST portal credentials</h2>
      <p className="muted">
        {hasCredential
          ? "Credentials are on file (encrypted). Enter new ones below to replace them."
          : "Enter the client's GST portal login. Stored encrypted at rest; only decrypted in-memory at fetch time."}
      </p>
      <form onSubmit={handleSubmit} className="stack">
        <div className="field">
          <label htmlFor="gst-username">Username</label>
          <input id="gst-username" required value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="gst-password">Password</label>
          <input
            id="gst-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I confirm the client has authorized us to store and use these credentials to retrieve their GST return
          data.
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={!consent || status === "saving"} style={{ alignSelf: "flex-start" }}>
          {status === "saving" ? "Saving..." : "Save credentials"}
        </button>
        {status === "saved" && <p className="success-text">Saved.</p>}
      </form>
    </div>
  );
}
