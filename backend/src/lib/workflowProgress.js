import { db } from "./firebaseAdmin.js";

/**
 * Stage sequence for the document-collection -> filing lifecycle. Driven
 * automatically by the document checklist (documents.js) once a workflow has
 * a requiredDocuments list configured; otherwise advanced manually. Every
 * workflow shares this same sequence for now — real per-workflow variations
 * come later, per the plan to build workflows one at a time.
 */
export const PROGRESS_STAGES = ["documents_requested", "documents_received", "ready_for_filing", "filed"];

export function stagePercent(stage) {
  const index = PROGRESS_STAGES.indexOf(stage);
  return index === -1 ? 0 : Math.round(((index + 1) / PROGRESS_STAGES.length) * 100);
}

/** Prefers the real "how many of the required documents are actually in" fraction over the
 *  coarse 4-stage bucket above, whenever a document count is available — otherwise the bar
 *  and the "X of Y documents uploaded" label next to it can visibly disagree (e.g. a stage
 *  advanced manually before a client had any documents configured shows 50% at 0 of 5). */
function effectivePercent(stage, documentsUploaded, documentsTotal) {
  if (stage === "filed") return 100;
  if (documentsTotal) {
    return Math.round(((documentsUploaded || 0) / documentsTotal) * 100);
  }
  return stagePercent(stage);
}

/** "YYYY-MM" for the current month, used as the default progress/email period. */
export function currentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function progressCollection(orgId, clientId) {
  return db.collection("organizations").doc(orgId).collection("clients").doc(clientId).collection("workflowProgress");
}

/** `extra` can carry additional fields alongside the stage, e.g. { filedOn } when moving to "filed". */
export async function setProgressStage(orgId, clientId, workflowKey, period, stage, extra = {}) {
  if (!PROGRESS_STAGES.includes(stage)) {
    throw new Error(`Invalid stage "${stage}"`);
  }
  await progressCollection(orgId, clientId)
    .doc(`${workflowKey}_${period}`)
    .set({ workflowKey, period, stage, ...extra, updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * Rolls a client's per-workflow stages into one traffic-light status for list views:
 * - "not_set_up": no workflows enrolled yet
 * - "action_needed": at least one enrolled workflow has no documents in yet
 * - "in_progress": documents are coming in, but not everything's filed
 * - "up_to_date": every enrolled workflow is filed for the period
 */
export function summarizeClientStatus(enrolledWorkflows, progress) {
  if (!enrolledWorkflows || enrolledWorkflows.length === 0) return "not_set_up";
  const stages = enrolledWorkflows.map((key) => progress[key]?.stage || null);
  if (stages.every((s) => s === "filed")) return "up_to_date";
  if (stages.some((s) => s === "documents_received" || s === "ready_for_filing" || s === "filed")) {
    return "in_progress";
  }
  return "action_needed";
}

export async function getClientProgress(orgId, clientId, period) {
  const snap = await progressCollection(orgId, clientId).where("period", "==", period).get();
  const byWorkflow = {};
  for (const doc of snap.docs) {
    const data = doc.data();
    byWorkflow[data.workflowKey] = {
      stage: data.stage,
      percent: effectivePercent(data.stage, data.documentsUploaded, data.documentsTotal),
      filedOn: data.filedOn ?? null,
      documentsUploaded: data.documentsUploaded ?? null,
      documentsTotal: data.documentsTotal ?? null,
      updatedAt: data.updatedAt,
    };
  }
  return byWorkflow;
}
