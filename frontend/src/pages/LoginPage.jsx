import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";
import { syntheticEmailFor } from "../lib/userId";
import { useAuth } from "../context/AuthContext";
import { useUserProfile } from "../context/UserProfileContext";
import {
  ClientsIcon,
  WorkflowIcon,
  ScanIcon,
  MailIcon,
  SettingsIcon,
  ReportsIcon,
  BuildingIcon,
  CatalogIcon,
  ArrowLeftIcon,
  HandscribeMark,
} from "../components/icons";

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || "SARN Technologies Pvt Ltd";
const PLATFORM_URL = import.meta.env.VITE_PLATFORM_URL || "https://www.sarntech.in/";

// Slowly drifting glyphs behind the content -- the tools of the trade (reports, filing,
// document scanning, client comms), not decoration for its own sake.
const FLOAT_ICONS = [
  { Icon: ReportsIcon, top: "10%", left: "63%", size: 30, duration: 9, delay: 0, color: "#5eead4" },
  { Icon: WorkflowIcon, top: "16%", left: "6%", size: 24, duration: 11, delay: -3, color: "#60a5fa" },
  { Icon: ScanIcon, top: "72%", left: "13%", size: 26, duration: 10, delay: -6, color: "#5eead4" },
  { Icon: MailIcon, top: "62%", left: "88%", size: 22, duration: 12, delay: -2, color: "#f59e0b" },
  { Icon: BuildingIcon, top: "10%", left: "90%", size: 26, duration: 13, delay: -8, color: "#60a5fa" },
  { Icon: CatalogIcon, top: "88%", left: "58%", size: 22, duration: 9.5, delay: -4, color: "#5eead4" },
  { Icon: ClientsIcon, top: "42%", left: "2%", size: 24, duration: 14, delay: -10, color: "#f59e0b" },
];

const FEATURES = [
  {
    icon: ClientsIcon,
    title: "Client & team management",
    desc: "Onboard clients, assign work across your team, and track every engagement in one place.",
  },
  {
    icon: WorkflowIcon,
    title: "End-to-end compliance workflows",
    desc: "Any workflow, any jurisdiction — one connected pipeline from documents to filing to billing.",
  },
  {
    icon: ScanIcon,
    title: "AI-powered document extraction",
    desc: "Turn scanned invoices and forms into structured, editable data in seconds.",
  },
  {
    icon: MailIcon,
    title: "Automated client communication",
    desc: "Document requests, filing receipts, and invoices sent automatically from your firm's own email.",
  },
  {
    icon: SettingsIcon,
    title: "Configurable to your practice",
    desc: "Checklists, timelines, and templates tailored to how your firm actually works.",
  },
];

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
    <main className="login-page">
      <Link to="/" className="login-back-link" title="Back to website" aria-label="Back to website">
        <ArrowLeftIcon size={17} />
      </Link>

      <div className="login-blob login-blob-1" aria-hidden="true" />
      <div className="login-blob login-blob-2" aria-hidden="true" />
      <div className="login-blob login-blob-3" aria-hidden="true" />

      <div className="login-float-icons" aria-hidden="true">
        {FLOAT_ICONS.map(({ Icon, top, left, size, duration, delay, color }, i) => (
          <span
            key={i}
            className="login-float-icon"
            style={{
              top,
              left,
              color,
              opacity: 0.24,
              animationDuration: `${duration}s`,
              animationDelay: `${delay}s`,
            }}
          >
            <Icon size={size} />
          </span>
        ))}
      </div>

      <div className="login-content">
        <div className="login-brand">
          <div className="login-brand-mark">
            <span className="login-brand-mark-dot">C</span>
            Compliance OS
          </div>
          <h1>
            The complete workflow platform <span>for modern audit firms</span>
          </h1>
          <p className="login-brand-desc">
            From client onboarding to document collection, compliance filings, and billing — run
            your firm's entire audit practice on one platform, built to scale from a solo
            practice to a multi-office firm, anywhere in the world.
          </p>
          <ul className="login-features">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="login-feature">
                <span className="login-feature-icon">
                  <Icon size={18} />
                </span>
                <span className="login-feature-text">
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="login-connector" aria-hidden="true">
          <div className="login-connector-line">
            <span className="login-connector-node" style={{ top: "0%" }} />
            <span className="login-connector-node" style={{ top: "50%" }} />
            <span className="login-connector-node" style={{ top: "100%" }} />
            <span className="login-connector-pulse" style={{ animationDelay: "0s" }} />
            <span className="login-connector-pulse" style={{ animationDelay: "2s" }} />
          </div>
        </div>

        <div className="login-circle-wrap">
          <div className="login-circle">
            <div className="login-circle-inner">
              <h2>Sign in</h2>
              <form onSubmit={handleSubmit} className="stack" style={{ gap: 14 }}>
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
              <p className="login-footnote">
                Don&apos;t have a User ID? Ask your company admin — accounts here are issued, not
                self-registered.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="login-credits">
        <a className="login-credit-badge" href={PLATFORM_URL} target="_blank" rel="noreferrer">
          Powered by <strong>{PLATFORM_NAME}</strong>
        </a>
        <span className="login-credit-badge">
          <span className="login-credit-icon">
            <HandscribeMark size={12} />
          </span>
          Tools used: <strong>HandScribe</strong>
        </span>
      </div>
    </main>
  );
}
