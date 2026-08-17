import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { runDocumentRequestForOrg } from "../lib/scheduler.js";
import { setOrgMailConfig } from "../lib/orgMailConfig.js";

export const emailScheduleRouter = Router();

emailScheduleRouter.use(requireAuth, requireCompanyMember);

emailScheduleRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const snap = await db.collection("organizations").doc(req.orgId).get();
    const data = snap.data();
    res.json({
      schedule: data?.emailSchedule ?? { dayOfMonth: 1, hourUTC: 9, minuteUTC: 0, enabled: false },
      // Never the app password — just enough to show what's configured (or that it's still
      // falling back to the platform default account).
      senderEmail: data?.emailConfig?.fromEmail ?? null,
    });
  })
);

const senderSchema = z.object({
  fromEmail: z.string().email(),
  appPassword: z.string().min(1),
});

/** Each company sends its own automated emails (document requests, challan/invoice copies)
 *  from its own Gmail account, not the platform's shared one — set that here. The app password
 *  is a Gmail "app password" (Google Account → Security → App passwords), never the actual
 *  account login password. */
emailScheduleRouter.put(
  "/sender",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = senderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    await setOrgMailConfig(req.orgId, parsed.data.fromEmail, parsed.data.appPassword);
    res.json({ ok: true });
  })
);

const scheduleSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(28),
  hourUTC: z.number().int().min(0).max(23),
  minuteUTC: z.number().int().min(0).max(59),
  enabled: z.boolean(),
});

emailScheduleRouter.put(
  "/",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    await db.collection("organizations").doc(req.orgId).update({ emailSchedule: parsed.data });
    res.json({ ok: true });
  })
);

/** Sends the document-request emails right now, for testing without waiting on the schedule. */
emailScheduleRouter.post(
  "/send-now",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const result = await runDocumentRequestForOrg(req.orgId);
    res.json(result);
  })
);
