import { useState } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "../components/Reveal";
import {
  ClientsIcon,
  WorkflowIcon,
  ScanIcon,
  MailIcon,
  SettingsIcon,
  BuildingIcon,
  CatalogIcon,
  ReportsIcon,
  ShieldIcon,
  ClockIcon,
  CheckIcon,
  HandscribeMark,
} from "../components/icons";

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || "SARN Technologies Pvt Ltd";
const PLATFORM_URL = import.meta.env.VITE_PLATFORM_URL || "https://www.sarntech.in/";
const PLATFORM_LOGO_URL = import.meta.env.VITE_PLATFORM_LOGO_URL || null;
// Set VITE_CONTACT_EMAIL to override the inbox that receives these.
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || "info@sarntech.com";

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
    badge: "AI-Powered",
  },
  {
    icon: MailIcon,
    title: "Automated client communication",
    desc: "Document requests, filing receipts, and invoices sent automatically from your firm's own email.",
  },
  {
    icon: CatalogIcon,
    title: "Drive-backed document storage",
    desc: "Every invoice and document is automatically organized in Google Drive, client by client, month by month.",
  },
  {
    icon: ReportsIcon,
    title: "Real-time progress tracking",
    desc: "A live, visual tracker for every client and workflow — see exactly what stage things are at, at a glance.",
  },
];

const HIGHLIGHTS = [
  {
    badge: "AI-Powered",
    icon: ScanIcon,
    title: "Document extraction that actually understands your paperwork",
    desc: "Stop retyping invoices by hand. Our AI reads scanned and handwritten documents, pulls out the fields that matter, and flags anything it isn't confident about — so you review, not retype.",
    points: [
      "Reads handwritten and scanned invoices, not just clean PDFs",
      "Flags low-confidence fields for a quick human check",
      "Exports straight to Excel or XML, ready to file",
    ],
  },
  {
    badge: "Built around you",
    icon: SettingsIcon,
    title: "Configured to match how your firm actually works",
    desc: "Every firm runs compliance work a little differently. We tailor document checklists, filing timelines, and templates to your practice — not the other way around.",
    points: [
      "Custom document checklists per client, per workflow",
      "Filing timelines that match your firm's own calendar",
      "New workflows added as your practice grows",
    ],
  },
];

const BENEFITS = [
  {
    icon: ShieldIcon,
    title: "Secure & isolated by design",
    desc: "Each firm's data is fully separated. Portal credentials and sender accounts are encrypted at rest, never shared across tenants.",
  },
  {
    icon: BuildingIcon,
    title: "Built to scale with you",
    desc: "From a solo practitioner to a multi-office firm — the same platform, the same workflows, no re-platforming later.",
  },
  {
    icon: ClockIcon,
    title: "Save hours every month",
    desc: "Automated requests, extraction, and reminders mean less manual chasing and more billable time.",
  },
  {
    icon: ReportsIcon,
    title: "Total visibility",
    desc: "See exactly where every client stands, for every workflow, at a glance — no digging through email threads.",
  },
];

const STEPS = [
  { title: "Onboard your clients", desc: "Add clients, assign your team, and pick which workflows apply to each one." },
  { title: "Collect & extract", desc: "Automated document requests go out on schedule; AI extraction turns scans into structured data." },
  { title: "File & track", desc: "Follow every workflow from documents to challan to filing, with a live status per client." },
  { title: "Bill & get paid", desc: "Once filed, send the invoice straight from the platform and mark the engagement billed." },
];

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#highlights", label: "Why us" },
  { href: "#benefits", label: "Benefits" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#showcase", label: "Product tour" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

export function LandingPage() {
  const [contactForm, setContactForm] = useState({ name: "", email: "", message: "" });
  const [contactSent, setContactSent] = useState(false);

  function handleContactSubmit(e) {
    e.preventDefault();
    const subject = encodeURIComponent(`Compliance OS inquiry from ${contactForm.name || "website visitor"}`);
    const body = encodeURIComponent(
      `${contactForm.message}\n\n— ${contactForm.name}${contactForm.email ? ` (${contactForm.email})` : ""}`
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setContactSent(true);
  }

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <a href="#top" className="landing-nav-brand">
            <span className="landing-nav-brand-dot">C</span>
            Compliance OS
          </a>
          <nav>
            <ul className="landing-nav-links">
              {NAV_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <a href={href}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <Link to="/login" className="landing-nav-cta">
            Sign in
          </Link>
        </div>
      </header>

      <section id="top" className="landing-hero">
        <div className="landing-hero-inner">
          <h1>
            The complete workflow platform <span>for modern audit firms</span>
          </h1>
          <p className="landing-hero-desc">
            From client onboarding to document collection, compliance filings, and billing — run
            your firm's entire audit practice on one platform, built to scale from a solo practice
            to a multi-office firm, anywhere in the world.
          </p>
          <div className="landing-hero-ctas">
            <Link to="/login" className="landing-btn-primary">
              Sign in to your workspace
            </Link>
            <a href="#how-it-works" className="landing-btn-secondary">
              See how it works
            </a>
          </div>
          <p className="landing-hero-trust">
            Powered by <strong>{PLATFORM_NAME}</strong>
          </p>
        </div>
      </section>

      <section id="features" className="landing-section">
        <Reveal>
          <div className="landing-section-header">
            <span className="landing-eyebrow">Features</span>
            <h2>Everything your practice needs, connected</h2>
            <p>No more juggling spreadsheets, email threads, and shared drives to keep a single engagement on track.</p>
          </div>
        </Reveal>
        <div className="landing-grid">
          {FEATURES.map(({ icon: Icon, title, desc, badge }, i) => (
            <Reveal key={title} delay={i * 60}>
              <div className="landing-card">
                {badge && <span className="landing-card-badge">{badge}</span>}
                <div className="landing-card-icon">
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="highlights" className="landing-section">
        <Reveal>
          <div className="landing-section-header">
            <span className="landing-eyebrow">What sets us apart</span>
            <h2>The two things clients ask about most</h2>
          </div>
        </Reveal>
        <div className="landing-highlights">
          {HIGHLIGHTS.map(({ badge, icon: Icon, title, desc, points }, i) => (
            <Reveal key={title} delay={i * 100}>
              <div className="landing-highlight-card">
                <span className="landing-highlight-badge">{badge}</span>
                <div className="landing-card-icon" style={{ background: "rgba(94, 234, 212, 0.14)", color: "#5eead4" }}>
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
                <ul className="landing-highlight-list">
                  {points.map((point) => (
                    <li key={point}>
                      <CheckIcon size={15} />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="benefits" className="landing-section landing-section-alt">
        <Reveal>
          <div className="landing-section-header">
            <span className="landing-eyebrow">Why Compliance OS</span>
            <h2>Built specifically for audit & compliance firms</h2>
            <p>Not a generic project tracker bent into shape — every part of this platform assumes you're running compliance work.</p>
          </div>
        </Reveal>
        <div className="landing-grid">
          {BENEFITS.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delay={i * 60}>
              <div className="landing-card">
                <div className="landing-card-icon">
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="landing-section">
        <Reveal>
          <div className="landing-section-header">
            <span className="landing-eyebrow">How it works</span>
            <h2>From first document to final invoice</h2>
            <p>The same pipeline every engagement follows, automated end to end.</p>
          </div>
        </Reveal>
        <div className="landing-steps">
          {STEPS.map(({ title, desc }, i) => (
            <Reveal key={title} delay={i * 80}>
              <div className="landing-step">
                <div className="landing-step-number">{i + 1}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="showcase" className="landing-section">
        <Reveal>
          <div className="landing-section-header">
            <span className="landing-eyebrow">See it in action</span>
            <h2>A look at the actual product</h2>
            <p>Stylized previews of the real screens — swap these for live screenshots any time.</p>
          </div>
        </Reveal>
        <div className="landing-showcase">
          <Reveal delay={0}>
            <div className="landing-mockup">
              <div className="landing-mockup-titlebar">
                <span className="landing-mockup-dot" />
                <span className="landing-mockup-dot" />
                <span className="landing-mockup-dot" />
              </div>
              <div className="landing-mockup-screen">
                <div className="landing-mockup-nav">
                  <span className="active" />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="landing-mockup-main">
                  <div className="landing-mockup-stats">
                    <div className="landing-mockup-stat">
                      <b>24</b>
                      <span>Clients</span>
                    </div>
                    <div className="landing-mockup-stat">
                      <b>9</b>
                      <span>TDS</span>
                    </div>
                    <div className="landing-mockup-stat">
                      <b>14</b>
                      <span>GST</span>
                    </div>
                  </div>
                  <div className="landing-mockup-bar-row">
                    <div className="landing-mockup-bar-track">
                      <div className="landing-mockup-bar-fill" style={{ width: "70%" }} />
                    </div>
                  </div>
                  <div className="landing-mockup-bar-row">
                    <div className="landing-mockup-bar-track">
                      <div className="landing-mockup-bar-fill" style={{ width: "45%" }} />
                    </div>
                  </div>
                  <div className="landing-mockup-bar-row">
                    <div className="landing-mockup-bar-track">
                      <div className="landing-mockup-bar-fill" style={{ width: "90%" }} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="landing-mockup-caption">
                <h3>Dashboard</h3>
                <p>Every client, every workflow's status, at a glance.</p>
                <span className="landing-mockup-illustrative">Illustrative preview</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="landing-mockup">
              <div className="landing-mockup-titlebar">
                <span className="landing-mockup-dot" />
                <span className="landing-mockup-dot" />
                <span className="landing-mockup-dot" />
              </div>
              <div className="landing-mockup-screen">
                <div className="landing-mockup-nav">
                  <span />
                  <span className="active" />
                  <span />
                  <span />
                </div>
                <div className="landing-mockup-main">
                  <div className="landing-mockup-drop">Drop invoices here, or click to browse</div>
                  <div className="landing-mockup-table">
                    <div className="landing-mockup-table-row head">
                      <span>File</span>
                      <span>Invoice #</span>
                      <span>Amount</span>
                    </div>
                    <div className="landing-mockup-table-row">
                      <span>invoice_042.jpg</span>
                      <span>INV-1042</span>
                      <span className="flag">₹18,400</span>
                    </div>
                    <div className="landing-mockup-table-row">
                      <span>invoice_043.jpg</span>
                      <span>INV-1043</span>
                      <span>₹9,120</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="landing-mockup-caption">
                <h3>AI document extraction</h3>
                <p>Scanned invoices become structured, editable rows in seconds.</p>
                <span className="landing-mockup-illustrative">Illustrative preview</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="landing-mockup">
              <div className="landing-mockup-titlebar">
                <span className="landing-mockup-dot" />
                <span className="landing-mockup-dot" />
                <span className="landing-mockup-dot" />
              </div>
              <div className="landing-mockup-screen">
                <div className="landing-mockup-nav">
                  <span />
                  <span />
                  <span className="active" />
                  <span />
                </div>
                <div className="landing-mockup-main">
                  <div className="landing-mockup-tracker">
                    <div className="landing-mockup-tracker-dot" />
                    <div className="landing-mockup-tracker-line" />
                    <div className="landing-mockup-tracker-dot" />
                    <div className="landing-mockup-tracker-line" />
                    <div className="landing-mockup-tracker-dot pending" />
                    <div className="landing-mockup-tracker-line pending" />
                    <div className="landing-mockup-tracker-dot pending" />
                  </div>
                </div>
              </div>
              <div className="landing-mockup-caption">
                <h3>Live progress tracking</h3>
                <p>Documents requested, received, filed, billed — one glance tells you where things stand.</p>
                <span className="landing-mockup-illustrative">Illustrative preview</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="about" className="landing-section landing-section-alt">
        <Reveal>
          <div className="landing-powered">
            <a
              className="landing-powered-badge"
              href={PLATFORM_URL}
              target="_blank"
              rel="noreferrer"
            >
              {PLATFORM_LOGO_URL ? (
                <img className="landing-powered-logo" src={PLATFORM_LOGO_URL} alt={PLATFORM_NAME} />
              ) : (
                <span className="landing-powered-logo-fallback">S</span>
              )}
              <span>
                Powered by <strong>{PLATFORM_NAME}</strong>
              </span>
            </a>
            <p>
              Compliance OS is built and maintained by {PLATFORM_NAME} — a technology partner
              focused on practical, secure software for accounting and audit firms.
            </p>
          </div>
        </Reveal>
      </section>

      <section id="contact" className="landing-section">
        <Reveal>
          <div className="landing-section-header">
            <span className="landing-eyebrow">Contact</span>
            <h2>Want to bring your firm onboard?</h2>
            <p>Accounts here are provisioned by us, not self-registered — reach out and we'll get your firm set up.</p>
          </div>
        </Reveal>
        <Reveal>
          <div className="landing-contact-grid">
            <div className="landing-contact-info">
              <h3>Let's talk</h3>
              <p>
                Tell us a bit about your firm — how many clients, which compliance workflows you
                handle — and we'll set up your firm's admin account.
              </p>
              <div className="landing-contact-item">
                <span className="landing-contact-item-icon">
                  <MailIcon size={16} />
                </span>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </div>
              <div className="landing-contact-item">
                <span className="landing-contact-item-icon">
                  <BuildingIcon size={16} />
                </span>
                <a href={PLATFORM_URL} target="_blank" rel="noreferrer">
                  {PLATFORM_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </div>
            </div>

            <form className="landing-contact-form card" onSubmit={handleContactSubmit}>
              <div className="field">
                <label htmlFor="contactName">Name</label>
                <input
                  id="contactName"
                  required
                  value={contactForm.name}
                  onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="contactEmail">Email</label>
                <input
                  id="contactEmail"
                  type="email"
                  required
                  value={contactForm.email}
                  onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="contactMessage">Message</label>
                <textarea
                  id="contactMessage"
                  required
                  rows={4}
                  value={contactForm.message}
                  onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                  style={{
                    resize: "vertical",
                    fontFamily: "inherit",
                    fontSize: 14,
                    padding: "9px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
              <button type="submit">Send message</button>
              {contactSent && (
                <p className="success-text" style={{ margin: 0 }}>
                  Opening your email client to send this — if nothing opened, email us directly at{" "}
                  {CONTACT_EMAIL}.
                </p>
              )}
            </form>
          </div>
        </Reveal>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span className="landing-footer-brand">
            <span className="login-brand-mark-dot" style={{ width: 22, height: 22, fontSize: 11 }}>
              C
            </span>
            Compliance OS
          </span>
          <ul className="landing-footer-links">
            {NAV_LINKS.map(({ href, label }) => (
              <li key={href}>
                <a href={href}>{label}</a>
              </li>
            ))}
            <li>
              <Link to="/login">Sign in</Link>
            </li>
          </ul>
        </div>
        <div className="landing-footer-bottom" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span className="landing-footer-legal">
            <span>
              &copy; {new Date().getFullYear()} {PLATFORM_NAME}. All rights reserved.
            </span>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <HandscribeMark size={12} />
            Document extraction powered by HandScribe
          </span>
        </div>
      </footer>
    </div>
  );
}
