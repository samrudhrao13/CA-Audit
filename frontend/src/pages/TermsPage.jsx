import { Link } from "react-router-dom";

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || "SARN Technologies Pvt Ltd";
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || "info@sarntech.com";
const LAST_UPDATED = "17 August 2026";

export function TermsPage() {
  return (
    <div className="legal-page">
      <header className="landing-nav" style={{ position: "static" }}>
        <div className="landing-nav-inner">
          <Link to="/" className="landing-nav-brand">
            <span className="landing-nav-brand-dot">C</span>
            Compliance OS
          </Link>
          <Link to="/login" className="landing-nav-cta">
            Sign in
          </Link>
        </div>
      </header>

      <div className="legal-container">
        <h1>Terms &amp; Conditions</h1>
        <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

        <div className="legal-notice">
          This is a general-purpose template covering the points a compliance-software platform
          typically needs, not legal advice drafted for your specific business or jurisdiction.
          Have a qualified lawyer review and adapt it — particularly the sections on liability,
          data protection, and governing law — before relying on it as your published terms.
        </div>

        <h2>1. Acceptance of these Terms</h2>
        <p>
          These Terms &amp; Conditions ("Terms") govern access to and use of Compliance OS (the
          "Service"), provided by {PLATFORM_NAME} ("we", "us", "our"). By creating an account,
          logging in, or otherwise using the Service, you agree to be bound by these Terms on
          behalf of yourself and the firm you represent. If you do not agree, do not use the
          Service.
        </p>

        <h2>2. Description of the Service</h2>
        <p>
          Compliance OS is a workflow-management platform for accounting and audit firms,
          covering client management, document collection, AI-assisted document extraction,
          compliance workflow tracking (including GST and TDS), automated client communication,
          and related administrative tools. Features may be added, changed, or removed over time.
        </p>

        <h2>3. Accounts &amp; Access</h2>
        <p>
          Accounts on this platform are provisioned top-down, not self-registered: a platform
          administrator creates company accounts, and each company's own administrator creates
          accounts for their staff. You are responsible for maintaining the confidentiality of
          your login credentials and for all activity that occurs under your account. Notify us
          immediately of any unauthorized use.
        </p>

        <h2>4. Your Data and Your Clients' Data</h2>
        <p>
          As between you and us, your firm retains all ownership rights in the client data,
          documents, and records you upload or generate through the Service ("Customer Data"). We
          act as a data processor with respect to Customer Data, using it solely to provide,
          maintain, and improve the Service, and not for any other purpose. You are responsible
          for having the necessary rights and consents to upload your clients' information to the
          Service.
        </p>

        <h2>5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose or in violation of applicable regulations;</li>
          <li>Attempt to gain unauthorized access to another company's data or accounts;</li>
          <li>Upload malicious code, or attempt to disrupt or overburden the Service's infrastructure;</li>
          <li>Reverse-engineer, resell, or white-label the Service without our written consent;</li>
          <li>Use the Service to store or process data you are not legally authorized to hold.</li>
        </ul>

        <h2>6. Third-Party Services</h2>
        <p>
          The Service integrates with third-party providers to function, including Google
          Firebase/Firestore (authentication and data storage), Google Drive (document storage),
          Gmail SMTP (sending automated emails on your firm's behalf, using an account you
          configure), and an AI-based document-extraction engine (for reading and structuring
          uploaded documents). Your use of the Service is also subject to those providers' own
          terms, to the extent applicable.
        </p>

        <h2>7. Fees &amp; Subscription</h2>
        <p>
          Where the Service is offered on a paid or subscription basis, applicable fees, billing
          cycle, and payment terms will be communicated separately (e.g. in an order form or
          invoice) and form part of these Terms by reference. Failure to pay amounts due may
          result in suspension or termination of access.
        </p>

        <h2>8. Data Security</h2>
        <p>
          We apply reasonable technical and organizational measures to protect Customer Data,
          including per-organization data isolation and encryption of sensitive credentials (such
          as government-portal login details) at rest. No method of transmission or storage is
          completely secure, and we cannot guarantee absolute security.
        </p>

        <h2>9. Confidentiality</h2>
        <p>
          Each party agrees to protect the other's confidential information with the same degree
          of care it uses for its own confidential information of similar nature, and not to
          disclose it to third parties except as necessary to provide or use the Service, or as
          required by law.
        </p>

        <h2>10. Intellectual Property</h2>
        <p>
          The Service, including its software, design, and branding, is owned by {PLATFORM_NAME}
          and protected by applicable intellectual property laws. These Terms do not grant you any
          rights to our trademarks, logos, or brand assets except as necessary to use the Service
          as intended.
        </p>

        <h2>11. Termination</h2>
        <p>
          We may suspend or terminate access to the Service for breach of these Terms, non-payment,
          or if required by law. You may stop using the Service at any time. On termination, we
          will make reasonable efforts to allow export of Customer Data for a limited period, after
          which it may be deleted in accordance with our data retention practices.
        </p>

        <h2>12. Disclaimers</h2>
        <p>
          The Service is provided "as is" and "as available," without warranties of any kind,
          express or implied, including fitness for a particular purpose. We do not warrant that
          the Service, including any AI-assisted extraction, will be error-free or uninterrupted —
          extracted data should be reviewed before being relied upon for filings or other
          compliance purposes.
        </p>

        <h2>13. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, {PLATFORM_NAME} will not be liable for any
          indirect, incidental, special, or consequential damages arising from use of the Service,
          and our total liability for any claim will not exceed the amount you paid us for the
          Service in the twelve months preceding the claim.
        </p>

        <h2>14. Indemnification</h2>
        <p>
          You agree to indemnify and hold {PLATFORM_NAME} harmless from claims arising out of your
          misuse of the Service, your violation of these Terms, or your violation of any law or
          third-party right in connection with the data you process through the Service.
        </p>

        <h2>15. Governing Law</h2>
        <p>
          These Terms are governed by the laws of India, without regard to conflict-of-law
          principles, and any disputes will be subject to the exclusive jurisdiction of the courts
          located in India, unless otherwise agreed in writing.
        </p>

        <h2>16. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be notified through
          the Service or by other reasonable means. Continued use after changes take effect
          constitutes acceptance of the revised Terms.
        </p>

        <h2>17. Contact Us</h2>
        <p>
          Questions about these Terms can be sent to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </div>
    </div>
  );
}
