import "dotenv/config";
import { db } from "../lib/firebaseAdmin.js";

const WORKFLOWS = [
  { key: "GST", name: "GST", description: "Monthly/quarterly GST return filing and reconciliation." },
  {
    key: "TDS",
    name: "TDS",
    description: "TDS return filing and challan reconciliation.",
    documentCollectionStartDay: 2,
    documentCollectionEndDay: 4,
    filingDueDay: 7,
  },
  { key: "PT", name: "Professional Tax", description: "State professional tax compliance." },
];

async function main() {
  for (const workflow of WORKFLOWS) {
    const ref = db.collection("workflowDefinitions").doc(workflow.key);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : {};

    // Safe to re-run: never clobbers requiredDocuments or a timeline a platform
    // admin has already configured via the UI — only fills in what's missing.
    const patch = { name: workflow.name, description: workflow.description, isActive: true };
    if (existing.requiredDocuments === undefined) {
      patch.requiredDocuments = [];
    }
    for (const field of ["documentCollectionStartDay", "documentCollectionEndDay", "filingDueDay"]) {
      if (existing[field] == null && workflow[field] != null) {
        patch[field] = workflow[field];
      }
    }

    await ref.set(patch, { merge: true });
  }
  console.log(`Seeded ${WORKFLOWS.length} workflow definitions.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
