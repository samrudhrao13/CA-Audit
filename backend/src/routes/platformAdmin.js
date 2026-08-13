import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePlatformAdmin } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createUserAccount } from "../lib/accounts.js";
import { deriveCompanyCode, generateUserId, generateTempPassword } from "../lib/userId.js";
import { INDIAN_STATES } from "./clients.js";

export const platformAdminRouter = Router();

platformAdminRouter.use(requireAuth, requirePlatformAdmin);

platformAdminRouter.get(
  "/companies",
  asyncHandler(async (_req, res) => {
    const snap = await db.collection("organizations").orderBy("createdAt", "desc").get();
    res.json({ companies: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  })
);

platformAdminRouter.get(
  "/companies/:orgId",
  asyncHandler(async (req, res) => {
    const snap = await db.collection("organizations").doc(req.params.orgId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Company not found" });
    }
    res.json({ id: snap.id, ...snap.data() });
  })
);

// Logos are stored as base64 data URIs directly on the org doc, not in Cloud
// Storage — that would need the Firebase project on a paid (Blaze) plan just
// to hold a few small images. A data URI works on the free plan and is
// simple: it's just a string field, and <img src="..."> renders it directly.
// 300KB keeps the encoded string comfortably under Firestore's 1MiB doc limit.
const MAX_LOGO_BYTES = 300 * 1024;
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LOGO_BYTES } });

function uploadLogoMiddleware(req, res, next) {
  logoUpload.single("logo")(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Logo must be under 300KB" : "Upload failed";
      return res.status(400).json({ error: message });
    }
    next();
  });
}

platformAdminRouter.post(
  "/companies/:orgId/logo",
  uploadLogoMiddleware,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "File must be an image" });
    }

    const orgRef = db.collection("organizations").doc(req.params.orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return res.status(404).json({ error: "Company not found" });
    }

    const logoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    await orgRef.update({ logoUrl });
    res.json({ logoUrl });
  })
);

// Same shape as the client form (backend/src/routes/clients.js) minus companyType/
// natureOfBusiness — every company here is an auditing firm, so those don't apply.
const createCompanySchema = z.object({
  companyName: z.string().min(2).max(200),
  gstin: z.string().trim().optional().default(""),
  pan: z.string().trim().optional().default(""),
  tan: z.string().trim().optional().default(""),
  hsnSacCode: z.string().trim().optional().default(""),
  addressLine1: z.string().trim().optional().default(""),
  addressLine2: z.string().trim().optional().default(""),
  addressLine3: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  state: z.enum(INDIAN_STATES).optional().nullable(),
  phoneNumber: z.string().trim().optional().default(""),
  email: z.string().trim().optional().default(""),
  contactPersonName: z.string().min(1).max(200),
  contactPersonPhone: z.string().trim().optional().default(""),
  contactPersonEmail: z.string().email(),
  workflowKeys: z.array(z.string()).optional().default([]),
});

/**
 * Creates a company (full org profile) + its first company admin account in
 * one step. The contact person entered here *is* who logs in as company
 * admin — their name/email become the account's identity. Workflow keys
 * selected here become the company's initial subscription (what they're
 * paying for) — see the note in the plan about invoicing gating this later.
 */
platformAdminRouter.post(
  "/companies",
  asyncHandler(async (req, res) => {
    const parsed = createCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const data = parsed.data;

    const catalogSnap = await db.collection("workflowDefinitions").get();
    const validKeys = new Set(catalogSnap.docs.map((d) => d.id));
    const workflowKeys = data.workflowKeys.filter((key) => validKeys.has(key));

    const companyCode = deriveCompanyCode(data.companyName);
    const orgRef = db.collection("organizations").doc();
    await orgRef.set({
      name: data.companyName,
      companyCode,
      gstin: data.gstin || null,
      pan: data.pan || null,
      tan: data.tan || null,
      hsnSacCode: data.hsnSacCode || null,
      addressLine1: data.addressLine1 || null,
      addressLine2: data.addressLine2 || null,
      addressLine3: data.addressLine3 || null,
      city: data.city || null,
      state: data.state || null,
      country: "India",
      phoneNumber: data.phoneNumber || null,
      email: data.email || null,
      contactPersonName: data.contactPersonName,
      contactPersonPhone: data.contactPersonPhone || null,
      contactPersonEmail: data.contactPersonEmail,
      status: "active",
      nextAdminSeq: 0,
      nextUserSeq: 0,
      emailSchedule: { dayOfMonth: 1, hourUTC: 9, minuteUTC: 0, enabled: false },
      createdAt: new Date().toISOString(),
    });

    await Promise.all(
      workflowKeys.map((key) =>
        orgRef
          .collection("workflowSubscriptions")
          .doc(key)
          .set({ status: "active", subscribedAt: new Date().toISOString() })
      )
    );

    const userId = await generateUserId(orgRef.id, companyCode, "COMPANY_ADMIN");
    const tempPassword = generateTempPassword();

    await createUserAccount({
      userId,
      password: tempPassword,
      name: data.contactPersonName,
      contactEmail: data.contactPersonEmail,
      role: "COMPANY_ADMIN",
      orgId: orgRef.id,
    });

    res.json({ orgId: orgRef.id, companyName: data.companyName, userId, tempPassword });
  })
);

/** Which workflows a given company is subscribed to — for the platform admin to review. */
platformAdminRouter.get(
  "/companies/:orgId/subscriptions",
  asyncHandler(async (req, res) => {
    const snap = await db
      .collection("organizations")
      .doc(req.params.orgId)
      .collection("workflowSubscriptions")
      .get();
    res.json({ subscriptions: snap.docs.map((d) => ({ workflowKey: d.id, ...d.data() })) });
  })
);

const subscriptionSchema = z.object({
  workflowKey: z.string().min(1),
  status: z.enum(["active", "inactive"]),
});

/** Grants/revokes a company's access to a workflow — only the platform admin can do this. */
platformAdminRouter.post(
  "/companies/:orgId/subscriptions",
  asyncHandler(async (req, res) => {
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    await db
      .collection("organizations")
      .doc(req.params.orgId)
      .collection("workflowSubscriptions")
      .doc(parsed.data.workflowKey)
      .set({ status: parsed.data.status, subscribedAt: new Date().toISOString() }, { merge: true });

    res.json({ ok: true });
  })
);

const complianceDay = z.number().int().min(1).max(28).nullable();

const workflowCatalogSchema = z.object({
  requiredDocuments: z.array(z.string().trim().min(1)).optional(),
  documentCollectionStartDay: complianceDay.optional(),
  documentCollectionEndDay: complianceDay.optional(),
  filingDueDay: complianceDay.optional(),
});

/**
 * Platform-wide defaults for a workflow: the required-documents list and the
 * compliance calendar (document collection window + filing due date) every
 * company starts with. Companies can override the calendar for themselves —
 * see PUT /api/workflows/subscriptions/:workflowKey/timeline.
 */
platformAdminRouter.put(
  "/workflows/:key",
  asyncHandler(async (req, res) => {
    const parsed = workflowCatalogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    const ref = db.collection("workflowDefinitions").doc(req.params.key);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    await ref.update(parsed.data);
    res.json({ ok: true });
  })
);
