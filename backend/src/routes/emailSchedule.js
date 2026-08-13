import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { runDocumentRequestForOrg } from "../lib/scheduler.js";

export const emailScheduleRouter = Router();

emailScheduleRouter.use(requireAuth, requireCompanyMember);

emailScheduleRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const snap = await db.collection("organizations").doc(req.orgId).get();
    res.json({
      schedule: snap.data()?.emailSchedule ?? { dayOfMonth: 1, hourUTC: 9, minuteUTC: 0, enabled: false },
    });
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
