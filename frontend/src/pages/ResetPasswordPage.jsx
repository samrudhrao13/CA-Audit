import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useUserProfile } from "../context/UserProfileContext";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { profile, refresh } = useUserProfile();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/auth/complete-first-login", { newPassword: password });
      const freshProfile = await refresh();
      navigate(freshProfile?.role === "PLATFORM_ADMIN" ? "/platform" : "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container-sm">
      <h1>Set your password</h1>
      <p className="muted">
        You signed in with a temporary password. Choose a new one before continuing — User ID{" "}
        <strong>{profile?.userId}</strong>.
      </p>
      <form onSubmit={handleSubmit} className="stack">
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Set password & continue"}
        </button>
      </form>
    </main>
  );
}
