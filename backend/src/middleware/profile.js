import { db } from "../lib/firebaseAdmin.js";
import { asyncHandler } from "../lib/asyncHandler.js";

/**
 * Every account — platform admin, company admin, company user — is a single
 * doc at users/{uid}. There is no membership subcollection and no client-sent
 * org header: req.orgId/req.role come straight from this doc, looked up by
 * the uid Firebase already verified in requireAuth. Nothing to spoof, no
 * query, no index.
 */
export const attachProfile = asyncHandler(async (req, res, next) => {
  const snap = await db.collection("users").doc(req.uid).get();
  if (!snap.exists) {
    return res.status(403).json({ error: "No account profile found for this login" });
  }

  req.userProfile = snap.data();
  req.orgId = req.userProfile.orgId ?? null;
  req.role = req.userProfile.role;
  next();
});

/** For routes scoped to a company (clients, workflows, GST, dashboard, team, email schedule). */
export const requireCompanyMember = [
  attachProfile,
  (req, res, next) => {
    if (!req.orgId) {
      return res.status(403).json({ error: "This account is not attached to a company" });
    }
    next();
  },
];

/** For platform-operator-only routes (creating companies). */
export const requirePlatformAdmin = [
  attachProfile,
  (req, res, next) => {
    if (req.role !== "PLATFORM_ADMIN") {
      return res.status(403).json({ error: "Platform admin access required" });
    }
    next();
  },
];

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.role)) {
      return res.status(403).json({ error: "You don't have permission to do that" });
    }
    next();
  };
}
