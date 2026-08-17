import { db } from "./firebaseAdmin.js";
import { currentPeriod, setProgressStage, getClientProgress } from "./workflowProgress.js";

function clientRef(orgId, clientId) {
  return db.collection("organizations").doc(orgId).collection("clients").doc(clientId);
}

function checklistRef(orgId, clientId, workflowKey, period) {
  return clientRef(orgId, clientId).collection("documentChecklist").doc(`${workflowKey}_${period}`);
}

function fileDocId(documentName) {
  return Buffer.from(documentName).toString("base64url");
}

// Crude singularize so checklist item names ("Purchase Invoices") line up with HandScribe
// template names ("Purchase Invoice") without requiring the two systems to agree on exact text.
function normalizeDocName(name) {
  return String(name || "").trim().toLowerCase().replace(/s$/, "");
}

/** Which of this client's enrolled-workflow checklist documents (if any) match a given name
 *  (typically a HandScribe template name) closely enough to auto-fulfill from an extraction. */
export function resolveChecklistMatches(client, candidateName) {
  const target = normalizeDocName(candidateName);
  if (!target) return [];
  const matches = [];
  for (const workflowKey of client.enrolledWorkflows || []) {
    const selection = client.documentChecklistConfig?.[workflowKey];
    const names = [...(selection?.predefinedSelected || []), ...(selection?.otherDocuments || [])];
    for (const name of names) {
      if (normalizeDocName(name) === target) {
        matches.push({ workflowKey, documentName: name });
      }
    }
  }
  return matches;
}

/** Shared by manual checklist uploads (routes/documents.js) and extraction auto-fulfillment
 *  (routes/handscribe.js) — records a file against one checklist document slot and advances
 *  progress the same way regardless of which path triggered it. */
export async function markChecklistDocumentUploaded({
  orgId,
  clientId,
  workflowKey,
  requiredDocuments,
  documentName,
  period = currentPeriod(),
  fileName,
  fileSize,
  mimeType,
  dataBase64,
  driveFileId,
  driveWebViewLink,
  uploadedByUid,
  source = "manual",
}) {
  const ref = checklistRef(orgId, clientId, workflowKey, period);

  await ref.collection("files").doc(fileDocId(documentName)).set({
    documentName,
    fileName,
    mimeType: mimeType ?? null,
    dataBase64: dataBase64 ?? null,
    driveFileId: driveFileId ?? null,
    driveWebViewLink: driveWebViewLink ?? null,
  });

  await ref.set(
    {
      workflowKey,
      period,
      documents: {
        [documentName]: {
          uploaded: true,
          fileName,
          fileSize: fileSize ?? null,
          hasFile: !!dataBase64,
          uploadedAt: new Date().toISOString(),
          uploadedByUid: uploadedByUid ?? null,
          driveWebViewLink: driveWebViewLink ?? null,
          source,
        },
      },
    },
    { merge: true }
  );

  const checklistSnap = await ref.get();
  const documents = checklistSnap.data().documents || {};
  const uploadedCount = requiredDocuments.filter((name) => documents[name]?.uploaded).length;
  const totalCount = requiredDocuments.length;
  const allUploaded = totalCount > 0 && uploadedCount === totalCount;

  const progress = await getClientProgress(orgId, clientId, period);
  const currentStage = progress[workflowKey]?.stage;
  if (currentStage !== "ready_for_filing" && currentStage !== "filed") {
    await setProgressStage(orgId, clientId, workflowKey, period, allUploaded ? "ready_for_filing" : "documents_received", {
      documentsUploaded: uploadedCount,
      documentsTotal: totalCount,
    });
  }

  return { allUploaded };
}
