import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
  if (!transporter) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD are not set");
    }
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, html }) {
  await getTransporter().sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject,
    html,
  });
}
