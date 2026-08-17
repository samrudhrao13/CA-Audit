import { db } from "./firebaseAdmin.js";
import { encryptSecret, decryptSecret } from "./crypto.js";

/** Each company (org) sends its own automated emails from its own Gmail account, not a single
 *  shared platform login — so a client only ever sees mail from their own auditor firm. Stored
 *  on the org doc itself (small, single record) rather than a subcollection; the app password
 *  is encrypted at rest with the same per-org envelope encryption used for GST/TDS portal
 *  credentials (lib/crypto.js). */
export async function getOrgMailConfig(orgId) {
  const snap = await db.collection("organizations").doc(orgId).get();
  const emailConfig = snap.data()?.emailConfig;
  if (!emailConfig?.fromEmail || !emailConfig?.encryptedAppPassword) return null;
  return {
    user: emailConfig.fromEmail,
    pass: decryptSecret(emailConfig.encryptedAppPassword, orgId),
  };
}

export async function setOrgMailConfig(orgId, fromEmail, appPassword) {
  await db
    .collection("organizations")
    .doc(orgId)
    .update({
      emailConfig: {
        fromEmail,
        encryptedAppPassword: encryptSecret(appPassword, orgId),
        updatedAt: new Date().toISOString(),
      },
    });
}
