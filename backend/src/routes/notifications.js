import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { listNotifications, countUnread, markRead, markAllRead, broadcastNotification, deleteNotification } from "../lib/notifications.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, requireCompanyMember);

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(req.orgId, req.uid),
      countUnread(req.orgId, req.uid),
    ]);
    res.json({ notifications, unreadCount });
  })
);

const broadcastSchema = z.object({
  message: z.string().trim().min(1).max(1000),
});

/** Company admin composes an announcement, sent to every other active member of their own
 *  org (never across companies). */
notificationsRouter.post(
  "/broadcast",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const sent = await broadcastNotification(req.orgId, { senderUid: req.uid, message: parsed.data.message });
    res.json({ ok: true, sent });
  })
);

notificationsRouter.post(
  "/:notificationId/read",
  asyncHandler(async (req, res) => {
    const ok = await markRead(req.orgId, req.uid, req.params.notificationId);
    if (!ok) return res.status(404).json({ error: "Notification not found" });
    res.json({ ok: true });
  })
);

notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const count = await markAllRead(req.orgId, req.uid);
    res.json({ ok: true, count });
  })
);

notificationsRouter.delete(
  "/:notificationId",
  asyncHandler(async (req, res) => {
    const ok = await deleteNotification(req.orgId, req.uid, req.params.notificationId);
    if (!ok) return res.status(404).json({ error: "Notification not found" });
    res.json({ ok: true });
  })
);
