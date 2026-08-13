import { Router } from "express";
import { z } from "zod";
import { auth as firebaseAuth, db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { attachProfile } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const authRouter = Router();

/** The frontend's single source of truth for "who am I / what can I see" after Firebase sign-in. */
authRouter.get(
  "/me",
  requireAuth,
  attachProfile,
  asyncHandler(async (req, res) => {
    let orgName = null;
    let logoUrl = null;
    if (req.orgId) {
      const orgSnap = await db.collection("organizations").doc(req.orgId).get();
      orgName = orgSnap.data()?.name ?? null;
      logoUrl = orgSnap.data()?.logoUrl ?? null;
    }
    res.json({ profile: { ...req.userProfile, orgName, logoUrl } });
  })
);

const updateProfileSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email(),
});

/** Self-service profile edit — name and contact email only. Role/orgId/userId are immutable. */
authRouter.put(
  "/me",
  requireAuth,
  attachProfile,
  asyncHandler(async (req, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    await db.collection("users").doc(req.uid).update(parsed.data);
    res.json({ ok: true });
  })
);

const resetSchema = z.object({ newPassword: z.string().min(6).max(200) });

/** Forces a real password on first login; nothing else in the app is reachable until this runs. */
authRouter.post(
  "/complete-first-login",
  requireAuth,
  attachProfile,
  asyncHandler(async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    await firebaseAuth.updateUser(req.uid, { password: parsed.data.newPassword });
    await db.collection("users").doc(req.uid).update({ mustResetPassword: false });

    res.json({ ok: true });
  })
);
