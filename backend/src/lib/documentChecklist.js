import { db } from "./firebaseAdmin.js";
import { currentPeriod, setProgressStage, getClientProgress } from "./workflowProgress.js";

function clientRef(orgId, clientId) {
  return db.collection("organizations").doc(orgId).collection("clients").doc(clientId);
}

function checklistRef(orgId, clientId, workflowKey, period) {
  return clientRef(orgId, clientId).collection("documentChecklist").doc(`${workflowKey}_${period}`);
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

/** Every file recorded against one checklist document slot (a client can have many "Purchase
 *  Invoices" for a period, not just one) — newest first, without the (potentially large) file
 *  bytes, so this stays cheap to call even once a slot has dozens of files in it. */
export async function listChecklistDocumentFiles(orgId, clientId, workflowKey, period, documentName) {
  // Sorted in JS rather than via .orderBy() — a compound where+orderBy on different fields
  // needs a composite Firestore index, which doesn't exist for this collection and isn't
  // worth requiring just to sort what's realistically at most a few dozen files.
  const snap = await checklistRef(orgId, clientId, workflowKey, period)
    .collection("files")
    .where("documentName", "==", documentName)
    .get();
  return snap.docs
    .map((d) => {
      const { dataBase64, ...rest } = d.data();
      return { id: d.id, hasFile: !!dataBase64, ...rest };
    })
    .sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));
}

/** Shared by manual checklist uploads (routes/documents.js) and extraction auto-fulfillment
 *  (routes/handscribe.js) — adds a file to one checklist document slot (a slot can hold many
 *  files — a client might have 50 purchase invoices for a month, not just one) and advances
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
  const uploadedAt = new Date().toISOString();

  await ref.collection("files").add({
    documentName,
    fileName,
    fileSize: fileSize ?? null,
    mimeType: mimeType ?? null,
    dataBase64: dataBase64 ?? null,
    driveFileId: driveFileId ?? null,
    driveWebViewLink: driveWebViewLink ?? null,
    uploadedAt,
    uploadedByUid: uploadedByUid ?? null,
    source,
  });

  const filesSnap = await ref.collection("files").where("documentName", "==", documentName).count().get();
  const fileCount = filesSnap.data().count;

  await ref.set(
    {
      workflowKey,
      period,
      documents: {
        [documentName]: {
          uploaded: true,
          count: fileCount,
          fileName,
          hasFile: !!dataBase64,
          uploadedAt,
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

  return { allUploaded, fileCount };
}
