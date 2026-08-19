import { Router } from "express";
import { z } from "zod";
import { auth, db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createUserAccount } from "../lib/accounts.js";
import { generateUserId, generateTempPassword } from "../lib/userId.js";

export const teamRouter = Router();

teamRouter.use(requireAuth, requireCompanyMember);

teamRouter.get(
  "/members",
  asyncHandler(async (req, res) => {
    const snap = await db.collection("users").where("orgId", "==", req.orgId).get();
    res.json({ members: snap.docs.map((d) => d.data()) });
  })
);

const createUserSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email(),
});

/**
 * Company admin creates a company user directly — no request/approval queue.
 * Returns the generated User ID + temp password once; the admin is
 * responsible for handing them to the employee outside the app.
 */
teamRouter.post(
  "/users",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const orgSnap = await db.collection("organizations").doc(req.orgId).get();
    const companyCode = orgSnap.data()?.companyCode;
    if (!companyCode) {
      return res.status(500).json({ error: "Company is missing its company code" });
    }

    const userId = await generateUserId(req.orgId, companyCode, "COMPANY_USER");
    const tempPassword = generateTempPassword();

    await createUserAccount({
      userId,
      password: tempPassword,
      name: parsed.data.name,
      contactEmail: parsed.data.contactEmail,
      role: "COMPANY_USER",
      orgId: req.orgId,
    });

    res.json({ userId, tempPassword });
  })
);

/**
 * Removes a company user — disables their Firebase Auth account (they can no longer log in)
 * but keeps the Firestore profile doc, marked `status: "removed"`, rather than hard-deleting
 * it. A hard delete would leave dangling uid references everywhere the app already points at
 * this person by uid (client assignments, "uploaded by", email logs, ...), turning every one
 * of those into an unresolvable ID instead of a name. Only ever acts within the caller's own
 * org, and only on a COMPANY_USER — never another admin, never the caller themselves.
 */
teamRouter.delete(
  "/users/:uid",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const { uid } = req.params;
    if (uid === req.uid) {
      return res.status(400).json({ error: "You can't remove your own account." });
    }

    const targetRef = db.collection("users").doc(uid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists || targetSnap.data().orgId !== req.orgId) {
      return res.status(404).json({ error: "User not found" });
    }
    const target = targetSnap.data();
    if (target.role !== "COMPANY_USER") {
      return res.status(400).json({ error: "Only company users can be removed here." });
    }
    if (target.status === "removed") {
      return res.status(400).json({ error: "This user has already been removed." });
    }

    await auth.updateUser(uid, { disabled: true });
    await targetRef.update({
      status: "removed",
      removedAt: new Date().toISOString(),
      removedByUid: req.uid,
    });

    res.json({ ok: true });
  })
);
