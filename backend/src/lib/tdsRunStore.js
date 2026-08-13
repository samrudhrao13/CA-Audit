import { db } from "./firebaseAdmin.js";
import { decryptSecret } from "./crypto.js";
import { mockTdsAdapter, TDS_RETURN_TYPES } from "./mockTdsAdapter.js";

const OTP_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Same "no Redis, no queue" trade-off as runStore.js's pendingOtp — see the
 * comment there. Kept as its own Map (not shared with GST's) so the two
 * workflows stay fully independent modules, per the request to keep TDS in
 * its own files start to finish.
 */
const pendingOtp = new Map();

function clientRef(orgId, clientId) {
  return db.collection("organizations").doc(orgId).collection("clients").doc(clientId);
}

function runRef(orgId, clientId, runId) {
  return clientRef(orgId, clientId).collection("tdsRuns").doc(runId);
}

async function updateRun(orgId, clientId, runId, patch) {
  await runRef(orgId, clientId, runId).set(patch, { merge: true });
}

/** Called by the OTP API route. Returns false if this run isn't currently waiting on one. */
export function submitOtp(runId, otp) {
  const pending = pendingOtp.get(runId);
  if (!pending) return false;
  pendingOtp.delete(runId);
  pending.resolve(otp);
  return true;
}

function waitForOtp(runId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingOtp.delete(runId);
      reject(new Error("Timed out waiting for OTP"));
    }, OTP_TIMEOUT_MS);
    pendingOtp.set(runId, {
      resolve: (otp) => {
        clearTimeout(timer);
        resolve(otp);
      },
    });
  });
}

/**
 * Fire-and-forget: drives the whole TDS fetch pipeline, writing status to the
 * run doc in Firestore as it goes so the frontend's polling picks it up.
 */
export async function startTdsRun({ orgId, clientId, runId, period }) {
  try {
    const [clientSnap, credentialSnap] = await Promise.all([
      clientRef(orgId, clientId).get(),
      clientRef(orgId, clientId).collection("tdsCredential").doc("current").get(),
    ]);

    if (!clientSnap.exists) throw new Error("Client not found");
    if (!credentialSnap.exists) throw new Error("No TDS credentials saved for this client");

    const tan = clientSnap.data().tan;
    const credential = credentialSnap.data();

    await updateRun(orgId, clientId, runId, {
      status: "RUNNING",
      startedAt: new Date().toISOString(),
      message: "Logging in to TDS portal",
    });

    const username = decryptSecret(credential.encryptedUsername, orgId);
    const password = decryptSecret(credential.encryptedPassword, orgId);
    await mockTdsAdapter.startSession({ username, password, tan });

    await updateRun(orgId, clientId, runId, {
      status: "WAITING_OTP",
      message: "Enter the OTP sent to the client's registered mobile/email",
    });

    const otp = await waitForOtp(runId);
    await mockTdsAdapter.submitOtp(otp);

    await updateRun(orgId, clientId, runId, { status: "DOWNLOADING", message: "Downloading return data" });

    const records = [];
    for (const returnType of TDS_RETURN_TYPES) {
      records.push(await mockTdsAdapter.fetchReturn(period, returnType));
    }

    await updateRun(orgId, clientId, runId, { status: "PARSING", message: "Mapping fields" });

    await clientRef(orgId, clientId)
      .collection("tdsPeriods")
      .doc(period)
      .set({ tan, period, records, runId, updatedAt: new Date().toISOString() }, { merge: true });

    await updateRun(orgId, clientId, runId, {
      status: "SUCCEEDED",
      finishedAt: new Date().toISOString(),
      message: "Done",
    });
  } catch (err) {
    await updateRun(orgId, clientId, runId, {
      status: "FAILED",
      finishedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
