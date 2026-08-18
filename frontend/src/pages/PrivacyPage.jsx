import { Link } from "react-router-dom";

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || "SARN Technologies Pvt Ltd";
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || "info@sarntech.com";
const LAST_UPDATED = "17 August 2026";

export function PrivacyPage() {
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
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

        <div className="legal-notice">
          This is a general-purpose template covering the points a compliance-software platform
          typically needs to disclose, not legal advice. Given this platform handles financial and
          tax-related data, have a qualified lawyer review this against applicable data-protection
          law (including India's Digital Personal Data Protection Act, 2023, and any regulation
          relevant to where your clients are based) before publishing it as final.
        </div>

        <h2>1. Introduction</h2>
        <p>
          This Privacy Policy explains how {PLATFORM_NAME} ("we", "us", "our") collects, uses, and
          protects information in connection with Compliance OS (the "Service"). It applies to
          company administrators, company users, and, indirectly, the client data those firms
          process through the Service.
        </p>

        <h2>2. Information We Collect</h2>
        <p>We collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Account information:</strong> name, contact email, assigned user ID, and role,
            provided when an account is created for you.
          </li>
          <li>
            <strong>Customer Data:</strong> client records, documents, invoices, and other files
            your firm uploads or generates through the Service, including data extracted from
            scanned documents.
          </li>
          <li>
            <strong>Portal credentials:</strong> where applicable, government-portal login details
            you choose to store for automation purposes — encrypted at rest and never stored in
            plain text.
          </li>
          <li>
            <strong>Sender email credentials:</strong> if your firm configures its own email
            account for automated client communication, that account's credentials, encrypted at
            rest.
          </li>
          <li>
            <strong>Usage information:</strong> log data such as sign-in timestamps and actions
            taken within the Service, used for security and troubleshooting.
          </li>
        </ul>

        <h2>3. How We Use Information</h2>
        <p>We use the information above to:</p>
        <ul>
          <li>Provide, operate, and maintain the Service;</li>
          <li>Process documents through AI-assisted extraction at your direction;</li>
          <li>Send automated communications (document requests, filing receipts, invoices) that your firm configures and triggers;</li>
          <li>Maintain security, prevent abuse, and troubleshoot issues;</li>
          <li>Communicate with you about the Service, including support and important updates.</li>
        </ul>
        <p>We do not sell personal information, and we do not use Customer Data to train models for any purpose beyond providing the Service to you.</p>

        <h2>4. How We Share Information</h2>
        <p>
          We share information with the following categories of third-party service providers,
          solely to operate the Service:
        </p>
        <ul>
          <li>
            <strong>Google Firebase / Google Cloud</strong> — authentication and database
            (Firestore) hosting;
          </li>
          <li>
            <strong>Google Drive</strong> — document and invoice storage, organized per client;
          </li>
          <li>
            <strong>Gmail SMTP</strong> — sending automated emails, via an account your firm
            controls;
          </li>
          <li>
            <strong>Document-extraction engine</strong> — processes uploaded documents to extract
            structured data at your request.
          </li>
        </ul>
        <p>
          We do not otherwise share personal information or Customer Data with third parties
          except where required by law, to protect our rights, or with your consent.
        </p>

        <h2>5. Data Security</h2>
        <p>
          Access to each company's data is isolated from every other company on the platform.
          Sensitive credentials (portal logins, sender email app passwords) are encrypted at rest
          using per-organization encryption keys. Access to the Service requires authentication,
          and roles determine what each user can see or do. No system is completely secure, and we
          encourage strong, unique passwords and prompt reporting of any suspected compromise.
        </p>

        <h2>6. Data Retention</h2>
        <p>
          We retain account and Customer Data for as long as your firm's account is active, or as
          needed to provide the Service. Documents stored in Google Drive remain under your firm's
          own Drive structure and are not deleted by account changes within the Service. On account
          closure, data may be retained for a limited period for legal, accounting, or dispute-
          resolution purposes before deletion.
        </p>

        <h2>7. Your Rights</h2>
        <p>
          Depending on applicable law, you may have rights to access, correct, export, or request
          deletion of personal information we hold about you. Requests can be made by contacting us
          at the email below; we will respond within a reasonable time and in accordance with
          applicable data-protection law.
        </p>

        <h2>8. Cookies &amp; Similar Technologies</h2>
        <p>
          The Service uses browser storage (such as local storage) required for authentication
          sessions to keep you signed in. We do not currently use third-party advertising or
          analytics cookies/trackers on this platform.
        </p>

        <h2>9. Children's Privacy</h2>
        <p>
          The Service is intended for use by audit and accounting firm professionals and is not
          directed at children. We do not knowingly collect personal information from children.
        </p>

        <h2>10. International Data Storage</h2>
        <p>
          Data may be stored and processed on infrastructure operated by our third-party providers
          (see Section 4), which may be located in different regions depending on their own
          infrastructure. We take reasonable steps to ensure such providers offer an adequate level
          of data protection.
        </p>

        <h2>11. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be notified
          through the Service or by other reasonable means. The "Last updated" date above reflects
          the most recent revision.
        </p>

        <h2>12. Contact Us</h2>
        <p>
          Questions about this Privacy Policy, or requests regarding your data, can be sent to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </div>
    </div>
  );
}
