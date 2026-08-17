import cron from "node-cron";
import { db } from "./firebaseAdmin.js";
import { sendMail } from "./mailer.js";
import { getOrgMailConfig } from "./orgMailConfig.js";
import { currentPeriod, setProgressStage } from "./workflowProgress.js";

// A safety cap per scheduler run, not a hard product limit — keeps one run from trying to blast
// out hundreds of emails through Gmail SMTP in one go (real risk of hitting Google's sending
// limits and having the whole batch bounce). Anyone not reached in today's run gets picked up
// automatically by tomorrow's catch-up run — see startScheduler below.
const MAX_EMAILS_PER_RUN = Number(process.env.MAX_DOCUMENT_REQUEST_EMAILS_PER_RUN) || 300;

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

/** Has this client already been sent (or already had attempted) this period's document request?
 *  Checked against emailLog rather than progress stage, since a client can be manually advanced
 *  past "documents_requested" without ever having actually been emailed. */
async function alreadyRequested(clientRef, period) {
  const snap = await clientRef.collection("emailLog").where("period", "==", period).where("type", "==", "document_request").limit(1).get();
  return !snap.empty;
}

/**
 * Emails clients in the org (that have ≥1 enrolled workflow) the documents required for the
 * period — skips anyone already emailed this period (so it's safe to call again as a catch-up),
 * and caps how many it sends in one call so a large client list can't overrun Gmail's sending
 * limits in a single run. One client's send failing doesn't stop the rest of the batch.
 */
export async function runDocumentRequestForOrg(orgId, period = currentPeriod()) {
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) {
    return { sent: 0, remaining: 0, failed: [] };
  }

  const names = await loadWorkflowNames();
  const mailConfig = await getOrgMailConfig(orgId);
  const clientsSnap = await db.collection("organizations").doc(orgId).collection("clients").get();

  let sent = 0;
  let remaining = 0;
  const failed = [];

  for (const clientDoc of clientsSnap.docs) {
    const client = clientDoc.data();
    const enrolled = client.enrolledWorkflows || [];

    const recipients = [
      client.notifyCompanyEmail && client.email,
      client.notifyContactPersonEmail && client.contactPersonEmail,
    ].filter(Boolean);

    if (enrolled.length === 0 || recipients.length === 0) continue;
    if (await alreadyRequested(clientDoc.ref, period)) continue;

    if (sent >= MAX_EMAILS_PER_RUN) {
      remaining += 1;
      continue;
    }

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

    try {
      await sendMail(
        {
          to: recipients,
          subject: `Document request — ${period}`,
          html: buildEmailHtml(client.name, workflowDocs),
        },
        mailConfig
      );

      await clientDoc.ref.collection("emailLog").add({
        type: "document_request",
        period,
        sentAt: new Date().toISOString(),
        workflows: enrolled,
        recipients,
      });

      await Promise.all(
        enrolled.map((key) => setProgressStage(orgId, clientDoc.id, key, period, "documents_requested"))
      );

      sent += 1;
    } catch (err) {
      console.error(`[scheduler] failed to email client ${clientDoc.id} (org ${orgId}):`, err.message);
      failed.push({ clientId: clientDoc.id, error: err.message });
      remaining += 1;
    }
  }

  return { sent, remaining, failed };
}

/**
 * Hourly check: for every org with an enabled schedule, sends document-request emails at the
 * configured hour on the configured day — and again, automatically, at the same hour the day
 * after, as a catch-up in case the first run didn't reach everyone (hit the per-run cap, or a
 * client failed to send). runDocumentRequestForOrg already skips anyone already emailed this
 * period, so re-running it on the catch-up day only reaches the stragglers. (minuteUTC is
 * stored per org for future precision but not checked here — an hourly tick is granular enough.)
 */
export function startScheduler() {
  cron.schedule("0 * * * *", async () => {
    const now = new Date();
    const orgsSnap = await db.collection("organizations").where("emailSchedule.enabled", "==", true).get();

    for (const orgDoc of orgsSnap.docs) {
      const schedule = orgDoc.data().emailSchedule;
      const isScheduledDay = schedule?.dayOfMonth === now.getUTCDate();
      const isCatchUpDay = schedule?.dayOfMonth === now.getUTCDate() - 1;
      if ((isScheduledDay || isCatchUpDay) && schedule?.hourUTC === now.getUTCHours()) {
        try {
          const result = await runDocumentRequestForOrg(orgDoc.id);
          console.log(
            `[scheduler] org ${orgDoc.id}${isCatchUpDay ? " (catch-up)" : ""}: sent ${result.sent}, ${result.remaining} remaining for tomorrow's catch-up${
              result.failed.length ? `, ${result.failed.length} failed` : ""
            }`
          );
        } catch (err) {
          console.error(`[scheduler] failed for org ${orgDoc.id}:`, err);
        }
      }
    }
  });

  console.log("Document-request email scheduler started (hourly check, with next-day catch-up).");
}
