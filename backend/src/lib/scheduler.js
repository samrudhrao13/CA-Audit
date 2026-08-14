import cron from "node-cron";
import { db } from "./firebaseAdmin.js";
import { sendMail } from "./mailer.js";
import { currentPeriod, setProgressStage } from "./workflowProgress.js";

async function loadWorkflowNames() {
  const snap = await db.collection("workflowDefinitions").get();
  const byKey = {};
  for (const doc of snap.docs) {
    byKey[doc.id] = doc.data().name;
  }
  return byKey;
}

function buildEmailHtml(clientName, workflowDocs) {
  const sections = workflowDocs
    .map(
      (w) => `
        <h3>${w.workflowName}</h3>
        ${
          w.documents.length > 0
            ? `<ul>${w.documents.map((d) => `<li>${d}</li>`).join("")}</ul>`
            : `<p><em>(document list to be confirmed with your auditor)</em></p>`
        }
      `
    )
    .join("");

  return `
    <p>Dear ${clientName || "Sir/Madam"},</p>
    <p>Please share the following documents for this month's compliance work:</p>
    ${sections}
    <p>Thank you.</p>
  `;
}

/** Emails every client in the org (that has ≥1 enrolled workflow) the documents required for the period. */
export async function runDocumentRequestForOrg(orgId, period = currentPeriod()) {
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) {
    return { sent: 0 };
  }

  const names = await loadWorkflowNames();
  const clientsSnap = await db.collection("organizations").doc(orgId).collection("clients").get();

  let sent = 0;
  for (const clientDoc of clientsSnap.docs) {
    const client = clientDoc.data();
    const enrolled = client.enrolledWorkflows || [];

    // Recipient choice is set once (client form / notification-prefs) and reused for every
    // future run — nobody re-picks this each month.
    const recipients = [
      client.notifyCompanyEmail && client.email,
      client.notifyContactPersonEmail && client.contactPersonEmail,
    ].filter(Boolean);

    if (enrolled.length === 0 || recipients.length === 0) continue;

    // Each client's own resolved checklist — see routes/clients.js's documentChecklistConfig
    // — not a fixed list shared by every client on this workflow.
    const workflowDocs = enrolled.map((key) => {
      const selection = client.documentChecklistConfig?.[key];
      return {
        workflowKey: key,
        workflowName: names[key] || key,
        documents: [...(selection?.predefinedSelected || []), ...(selection?.otherDocuments || [])],
      };
    });

    await sendMail({
      to: recipients,
      subject: `Document request — ${period}`,
      html: buildEmailHtml(client.name, workflowDocs),
    });

    await clientDoc.ref.collection("emailLog").add({
      period,
      sentAt: new Date().toISOString(),
      workflows: enrolled,
      recipients,
    });

    await Promise.all(
      enrolled.map((key) => setProgressStage(orgId, clientDoc.id, key, period, "documents_requested"))
    );

    sent += 1;
  }

  return { sent };
}

/**
 * Hourly check: for every org with an enabled schedule whose dayOfMonth/hourUTC
 * matches right now, send that org's document-request emails. (minuteUTC is
 * stored per org for future precision but not checked here — an hourly tick
 * is granular enough for this feature.)
 */
export function startScheduler() {
  cron.schedule("0 * * * *", async () => {
    const now = new Date();
    const orgsSnap = await db.collection("organizations").where("emailSchedule.enabled", "==", true).get();

    for (const orgDoc of orgsSnap.docs) {
      const schedule = orgDoc.data().emailSchedule;
      if (schedule?.dayOfMonth === now.getUTCDate() && schedule?.hourUTC === now.getUTCHours()) {
        try {
          const result = await runDocumentRequestForOrg(orgDoc.id);
          console.log(`[scheduler] sent ${result.sent} document-request email(s) for org ${orgDoc.id}`);
        } catch (err) {
          console.error(`[scheduler] failed for org ${orgDoc.id}:`, err);
        }
      }
    }
  });

  console.log("Document-request email scheduler started (hourly check).");
}
