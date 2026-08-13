import { useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";
import { syntheticEmailFor } from "../lib/userId";
import { api } from "../lib/api";
import { useUserProfile } from "../context/UserProfileContext";

const ROLE_META = {
  PLATFORM_ADMIN: { label: "Platform admin", color: "#4f46e5" },
  COMPANY_ADMIN: { label: "Admin", color: "#4f46e5" },
  COMPANY_USER: { label: "User", color: "#0d9488" },
};

export function ProfilePage() {
  const { profile, refresh } = useUserProfile();

  const [name, setName] = useState(profile?.name || "");
  const [contactEmail, setContactEmail] = useState(profile?.contactEmail || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  if (!profile) return <p>Loading...</p>;

  const roleMeta = ROLE_META[profile.role] || { label: profile.role, color: "#6b7280" };

  async function saveGeneral(e) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      await api.put("/api/auth/me", { name, contactEmail });
      await refresh();
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters");
      return;
    }

    setChangingPassword(true);
    try {
      const user = firebaseAuth.currentUser;
      const credential = EmailAuthProvider.credential(syntheticEmailFor(profile.userId), currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(
        err.code === "auth/wrong-password" || err.code === "auth/invalid-credential"
          ? "Current password is incorrect"
          : err.message
      );
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>My profile</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Account settings for {profile.userId}.
        </p>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: roleMeta.color,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {(profile.name || "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{profile.name}</p>
            <p className="muted" style={{ margin: "2px 0 0" }}>
              {profile.userId}
              {profile.orgName ? ` · ${profile.orgName}` : ""}
            </p>
            <span
              style={{
                display: "inline-block",
                marginTop: 6,
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: `${roleMeta.color}1a`,
                color: roleMeta.color,
              }}
            >
              {roleMeta.label}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={saveGeneral} className="card stack" style={{ gap: 16 }}>
        <div className="form-section">
          <h3>General settings</h3>
          <div className="row">
            <div className="field">
              <label htmlFor="profileName">Name</label>
              <input id="profileName" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="profileEmail">Contact email</label>
              <input
                id="profileEmail"
                type="email"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
          </div>
        </div>
        {profileError && <p className="error-text">{profileError}</p>}
        {profileSaved && <p className="success-text">Saved.</p>}
        <button type="submit" disabled={savingProfile} style={{ alignSelf: "flex-start" }}>
          {savingProfile ? "Saving..." : "Save changes"}
        </button>
      </form>

      <form onSubmit={changePassword} className="card stack" style={{ gap: 16 }}>
        <div className="form-section">
          <h3>Change password</h3>
          <div className="field">
            <label htmlFor="currentPassword">Current password</label>
            <input
              id="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirm new password</label>
              <input
                id="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        </div>
        {passwordError && <p className="error-text">{passwordError}</p>}
        {passwordSaved && <p className="success-text">Password changed.</p>}
        <button type="submit" disabled={changingPassword} style={{ alignSelf: "flex-start" }}>
          {changingPassword ? "Changing..." : "Change password"}
        </button>
      </form>
    </div>
  );
}
