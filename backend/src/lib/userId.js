import { db } from "./firebaseAdmin.js";

/**
 * Placeholder User ID scheme: {COMPANYCODE}-A001 (admins) / {COMPANYCODE}-U001 (users).
 * This is the one place to change when the real template arrives.
 */

export function deriveCompanyCode(companyName) {
  const alnum = (companyName || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const code = alnum.slice(0, 6) || "CO";
  return code.length < 3 ? code.padEnd(3, "X") : code;
}

const SEQ_FIELD = { COMPANY_ADMIN: "nextAdminSeq", COMPANY_USER: "nextUserSeq" };
const ID_INFIX = { COMPANY_ADMIN: "A", COMPANY_USER: "U" };

/**
 * Atomically allocates the next sequence number for this org+role (so two
 * concurrent "create user" requests can't collide) and returns the formatted
 * User ID. The org doc must already exist.
 */
export async function generateUserId(orgId, companyCode, role) {
  const seqField = SEQ_FIELD[role];
  const infix = ID_INFIX[role];
  if (!seqField) {
    throw new Error(`generateUserId: unsupported role "${role}"`);
  }

  const orgRef = db.collection("organizations").doc(orgId);
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(orgRef);
    const current = snap.data()?.[seqField] ?? 0;
    const next = current + 1;
    tx.update(orgRef, { [seqField]: next });
    return next;
  });

  return `${companyCode}-${infix}${String(seq).padStart(3, "0")}`;
}

/** Random temp password — long enough to be safe, short enough to type from a screen. */
export function generateTempPassword() {
  const a = Math.random().toString(36).slice(2, 6);
  const b = Math.random().toString(36).slice(2, 6);
  return `${a}${b}`.toUpperCase();
}

export const AUTH_EMAIL_DOMAIN = "login.internal";

export function syntheticEmailFor(userId) {
  return `${userId}@${AUTH_EMAIL_DOMAIN}`;
}
