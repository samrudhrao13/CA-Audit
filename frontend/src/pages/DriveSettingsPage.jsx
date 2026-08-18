import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function DriveSettingsPage() {
  const [folderId, setFolderId] = useState(null);
  const [serviceAccountEmail, setServiceAccountEmail] = useState(null);
  const [folderLink, setFolderLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);

  async function load() {
    try {
      const data = await api.get("/api/drive-settings");
      setFolderId(data.folderId);
      setServiceAccountEmail(data.serviceAccountEmail);
    } catch (err) {
      setLoadError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.put("/api/drive-settings", { folderLink });
      setFolderId(result.folderId);
      setFolderLink("");
      setMessage("Drive folder saved. New uploads for this company will be created there.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyServiceAccountEmail() {
    if (!serviceAccountEmail) return;
    try {
      await navigator.clipboard.writeText(serviceAccountEmail);
      setMessage("Copied to clipboard.");
    } catch {
      // Clipboard permission denied or unavailable — the email is still shown to copy by hand.
    }
  }

  if (loadError) {
    return (
      <div className="stack">
        <h1>Google Drive storage</h1>
        <p className="error-text">Couldn't load Drive settings: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Google Drive storage</h1>
      <p className="muted">
        Invoices and workflow documents for this company are saved to a Google Drive folder you
        choose here — every company keeps its own separate folder, so your files are never mixed
        with another firm's.
      </p>

      <div className="card stack" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>1. Create a Shared Drive</p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          In Google Drive, use a <strong>Shared Drive</strong> (left sidebar → "Shared drives" →
          "New") rather than a folder in "My Drive" — Google doesn't give service accounts
          storage quota outside a Shared Drive, so uploads fail otherwise.
        </p>

        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>2. Share it with this account</p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Open the Shared Drive → "Manage members" → add the address below with role{" "}
          <strong>Content Manager</strong> (or "Editor" if you're using a regular folder instead).
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <code style={{ fontSize: 13, padding: "4px 8px", background: "var(--surface-alt, #f1f5f9)", borderRadius: 6 }}>
            {serviceAccountEmail || "loading..."}
          </code>
          <button type="button" className="secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={copyServiceAccountEmail}>
            Copy
          </button>
        </div>

        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>3. Paste its link below</p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Copy the Shared Drive's (or folder's) link from your browser's address bar and paste it
          below — the folder ID is pulled out of it automatically.
        </p>
      </div>

      <form onSubmit={handleSave} className="card stack">
        <p style={{ margin: 0, fontSize: 14 }}>
          Currently configured:{" "}
          {folderId ? (
            <strong>{folderId}</strong>
          ) : (
            <span className="muted">not configured yet — Drive sync is off for this company</span>
          )}
        </p>
        <div className="field">
          <label htmlFor="folderLink">Shared Drive or folder link</label>
          <input
            id="folderLink"
            type="text"
            placeholder="https://drive.google.com/drive/folders/..."
            value={folderLink}
            onChange={(e) => setFolderLink(e.target.value)}
            required
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        {message && <p className="success-text">{message}</p>}
        <div>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Drive folder"}
          </button>
        </div>
      </form>
    </div>
  );
}
