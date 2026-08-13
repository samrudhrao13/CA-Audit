import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const workflowsRouter = Router();

workflowsRouter.use(requireAuth);

/** Global workflow catalog (GST, TDS, PT, ...) — not org-scoped. */
workflowsRouter.get(
  "/catalog",
  asyncHandler(async (_req, res) => {
    const snap = await db.collection("workflowDefinitions").get();
    const workflows = snap.docs
      .map((d) => ({ key: d.id, ...d.data() }))
      .sort((a, b) => a.key.localeCompare(b.key));
    res.json({ workflows });
  })
);

const TIMELINE_FIELDS = ["documentCollectionStartDay", "documentCollectionEndDay", "filingDueDay"];

function effectiveTimeline(catalogDoc, subscriptionDoc) {
  const override = subscriptionDoc?.timelineOverride;
  const timeline = {};
  for (const field of TIMELINE_FIELDS) {
    timeline[field] = override?.[field] ?? catalogDoc?.[field] ?? null;
  }
  timeline.isOverridden = !!override;
  return timeline;
}

/**
 * Which workflows this company is subscribed to, with each one's compliance
 * calendar: the platform default, merged with this company's own override if
 * they've set one. Granting/revoking the *subscription itself* is a
 * platform-admin-only action — see routes/platformAdmin.js.
 */
workflowsRouter.get(
  "/subscriptions",
  requireCompanyMember,
  asyncHandler(async (req, res) => {
    const [subsSnap, catalogSnap] = await Promise.all([
      db.collection("organizations").doc(req.orgId).collection("workflowSubscriptions").get(),
      db.collection("workflowDefinitions").get(),
    ]);

    const catalogByKey = {};
    for (const doc of catalogSnap.docs) {
      catalogByKey[doc.id] = doc.data();
    }

    const subscriptions = subsSnap.docs.map((d) => {
      const data = d.data();
      return {
        workflowKey: d.id,
        status: data.status,
        subscribedAt: data.subscribedAt,
        timeline: effectiveTimeline(catalogByKey[d.id], data),
      };
    });

    res.json({ subscriptions });
  })
);

const timelineSchema = z
  .object({
    documentCollectionStartDay: z.number().int().min(1).max(28).nullable(),
    documentCollectionEndDay: z.number().int().min(1).max(28).nullable(),
    filingDueDay: z.number().int().min(1).max(28).nullable(),
  })
  .partial()
  .extend({ reset: z.boolean().optional() });

/**
 * Company admin overrides the platform-default compliance calendar for one
 * workflow, just for their own firm. { reset: true } clears the override and
 * falls back to the platform default again.
 */
workflowsRouter.put(
  "/subscriptions/:workflowKey/timeline",
  requireCompanyMember,
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = timelineSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const subRef = db
      .collection("organizations")
      .doc(req.orgId)
      .collection("workflowSubscriptions")
      .doc(req.params.workflowKey);
    const subSnap = await subRef.get();
    if (!subSnap.exists) {
      return res.status(404).json({ error: "Not subscribed to this workflow" });
    }

    if (parsed.data.reset) {
      await subRef.update({ timelineOverride: null });
      return res.json({ ok: true });
    }

    const { documentCollectionStartDay, documentCollectionEndDay, filingDueDay } = parsed.data;
    await subRef.update({
      timelineOverride: { documentCollectionStartDay, documentCollectionEndDay, filingDueDay },
    });
    res.json({ ok: true });
  })
);
