import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./serviceAccountKey.json";
  return JSON.parse(readFileSync(path, "utf8"));
}

export const serviceAccount = loadServiceAccount();

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}

export const auth = getAuth();
export const db = getFirestore();
