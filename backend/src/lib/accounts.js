import { auth, db } from "./firebaseAdmin.js";
import { syntheticEmailFor } from "./userId.js";

/**
 * Creates a Firebase Auth user (synthetic email) + the users/{uid} profile
 * doc that everything else in the app reads role/orgId from. Used by the
 * platform-admin bootstrap script, "create company" (first company admin),
 * and "create company user" — the only three places accounts ever get made.
 */
export async function createUserAccount({ userId, password, name, contactEmail, role, orgId }) {
  const userRecord = await auth.createUser({
    email: syntheticEmailFor(userId),
    password,
    displayName: name,
  });

  await db.collection("users").doc(userRecord.uid).set({
    uid: userRecord.uid,
    userId,
    name,
    contactEmail: contactEmail || null,
    role,
    orgId: orgId ?? null,
    mustResetPassword: true,
    createdAt: new Date().toISOString(),
  });

  return { uid: userRecord.uid };
}
