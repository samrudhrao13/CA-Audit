import nodemailer from "nodemailer";

// Keyed by sender address so each configured company (org) account gets its own transporter,
// instead of every org sharing one hardcoded Gmail login.
const transporters = new Map();

function getTransporter(user, pass) {
  if (!user || !pass) {
    throw new Error("No sender email configured — set it under Settings → Email schedule, or GMAIL_USER/GMAIL_APP_PASSWORD as a fallback");
  }
  let transporter = transporters.get(user);
  if (!transporter) {
    transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    transporters.set(user, transporter);
  }
  return transporter;
}

/**
 * `from` is optional — `{ user, pass }` for the sending org's own Gmail account (see
 * lib/orgMailConfig.js). Falls back to GMAIL_USER/GMAIL_APP_PASSWORD (the platform default) if
 * the org hasn't configured their own yet, so this keeps working for orgs that haven't set one
 * up and for local/dev use.
 */
export async function sendMail({ to, subject, html, attachments }, from) {
  const user = from?.user || process.env.GMAIL_USER;
  const pass = from?.pass || process.env.GMAIL_APP_PASSWORD;
  await getTransporter(user, pass).sendMail({
    from: user,
    to,
    subject,
    html,
    attachments,
  });
}
