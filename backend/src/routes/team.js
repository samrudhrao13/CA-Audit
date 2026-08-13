import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/firebaseAdmin.js";
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
