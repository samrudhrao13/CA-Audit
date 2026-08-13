import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";
import { syntheticEmailFor } from "../lib/userId";
import { useAuth } from "../context/AuthContext";
import { useUserProfile } from "../context/UserProfileContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const userIdRef = useRef(null);
  const passwordRef = useRef(null);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // /login has no route guard (it has to be reachable while signed out), so it was possible
  // to land here while actually already signed in — a leftover session from another tab, or
  // just Firebase's persisted session resolving after a redirect. That showed a blank login
  // form with no way forward except typing credentials again, which read as "having to sign
  // in twice." If a valid session + profile is already there, skip straight to where it leads.
  useEffect(() => {
    if (!user || profile === undefined || !profile) return;
    if (profile.mustResetPassword) {
      navigate("/reset-password", { replace: true });
    } else if (profile.role === "PLATFORM_ADMIN") {
      navigate("/platform", { replace: true });
    } else {
      navigate("/dashboard", { replace: true });
    }
  }, [user, profile, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    // Picking a credential from the browser's saved-passwords dropdown fills the fields
    // without reliably firing React's onChange, so `userId`/`password` state can still be
    // empty even though the fields visibly show the autofilled values — that's what was
    // sending an empty password to Firebase and bouncing back to the login form. Reading
    // the live DOM value at submit time is accurate regardless of how the field got filled.
    const submittedUserId = (userIdRef.current?.value ?? userId).trim();
    const submittedPassword = passwordRef.current?.value ?? password;
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(firebaseAuth, syntheticEmailFor(submittedUserId), submittedPassword);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Sign-in failed:", err.code, err.message);
      setError(`Invalid User ID or password. (${err.code || err.message})`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container-sm">
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit} className="stack">
        <div className="field">
          <label htmlFor="userId">User ID</label>
          <input
            id="userId"
            name="userId"
            ref={userIdRef}
            required
            autoComplete="username"
            placeholder="e.g. SARNTE-A001"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            ref={passwordRef}
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        Don&apos;t have a User ID? Ask your company admin — accounts here are issued, not
        self-registered.
      </p>
    </main>
  );
}
