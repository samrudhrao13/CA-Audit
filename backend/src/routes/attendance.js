import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createNotification } from "../lib/notifications.js";

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth, requireCompanyMember);

const STATUSES = ["present", "absent", "leave", "half_day"];

function attendanceRef(orgId) {
  return db.collection("organizations").doc(orgId).collection("attendanceRecords");
}

function recordId(uid, date) {
  return `${uid}_${date}`;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const markSchema = z.object({
  uid: z.string().optional(),
  date: dateSchema,
  status: z.enum(STATUSES),
  note: z.string().max(500).optional(),
});

/** A company user marks their own attendance for a day; a company admin can also mark on
 *  behalf of anyone in their org (a correction, or filling in for someone who hasn't marked
 *  yet) -- one doc per (user, date), so re-marking the same day overwrites rather than
 *  duplicates. Marking someone else's attendance notifies them. */
attendanceRouter.post(
  "/mark",
  asyncHandler(async (req, res) => {
    const parsed = markSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const { date, status, note } = parsed.data;
    const targetUid = parsed.data.uid || req.uid;

    if (targetUid !== req.uid && req.role !== "COMPANY_ADMIN") {
      return res.status(403).json({ error: "Only a company admin can mark attendance for someone else" });
    }

    if (targetUid !== req.uid) {
      const targetSnap = await db.collection("users").doc(targetUid).get();
      if (!targetSnap.exists || targetSnap.data().orgId !== req.orgId) {
        return res.status(404).json({ error: "User not found" });
      }
    }

    await attendanceRef(req.orgId)
      .doc(recordId(targetUid, date))
      .set({
        uid: targetUid,
        date,
        status,
        note: note || null,
        markedAt: new Date().toISOString(),
        markedByUid: req.uid,
      });

    if (targetUid !== req.uid) {
      const adminSnap = await db.collection("users").doc(req.uid).get();
      const adminName = adminSnap.data()?.name || "Your admin";
      try {
        await createNotification(req.orgId, {
          recipientUid: targetUid,
          type: "attendance_marked",
          message: `${adminName} marked your attendance for ${date} as ${status.replace("_", " ")}.`,
          link: "/attendance",
        });
      } catch (err) {
        console.error(`Notification failed for attendance correction (${targetUid}, ${date}):`, err.message);
      }
    }

    res.json({ ok: true });
  })
);

/** The caller's own attendance history for one month (default: current month). */
attendanceRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    const snap = await attendanceRef(req.orgId).where("uid", "==", req.uid).limit(200).get();
    const records = snap.docs
      .map((d) => d.data())
      .filter((r) => r.date.startsWith(month))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    res.json({ month, records });
  })
);

/** Every company user's status for one day (default: today) -- the admin's daily roster. */
attendanceRouter.get(
  "/company",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    const [membersSnap, recordsSnap] = await Promise.all([
      db.collection("users").where("orgId", "==", req.orgId).where("role", "==", "COMPANY_USER").get(),
      attendanceRef(req.orgId).where("date", "==", date).get(),
    ]);
    const recordByUid = {};
    for (const d of recordsSnap.docs) recordByUid[d.data().uid] = d.data();

    const roster = membersSnap.docs
      .map((d) => d.data())
      .filter((m) => m.status !== "removed")
      .map((m) => ({ uid: m.uid, name: m.name, userId: m.userId, record: recordByUid[m.uid] || null }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ date, roster });
  })
);

/** Per-user present/absent/leave/half-day tallies for one month -- the admin's monthly summary. */
attendanceRouter.get(
  "/company/summary",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    const [membersSnap, recordsSnap] = await Promise.all([
      db.collection("users").where("orgId", "==", req.orgId).where("role", "==", "COMPANY_USER").get(),
      attendanceRef(req.orgId).where("date", ">=", `${month}-01`).where("date", "<=", `${month}-31`).get(),
    ]);

    const nameByUid = {};
    for (const d of membersSnap.docs) {
      if (d.data().status !== "removed") nameByUid[d.id] = d.data().name;
    }

    const tallies = {};
    for (const d of recordsSnap.docs) {
      const r = d.data();
      if (!nameByUid[r.uid]) continue; // a removed user's historical rows don't need a live tally
      tallies[r.uid] ??= { present: 0, absent: 0, leave: 0, half_day: 0 };
      tallies[r.uid][r.status] = (tallies[r.uid][r.status] || 0) + 1;
    }

    const summary = Object.entries(nameByUid)
      .map(([uid, name]) => ({ uid, name, ...(tallies[uid] || { present: 0, absent: 0, leave: 0, half_day: 0 }) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ month, summary });
  })
);
