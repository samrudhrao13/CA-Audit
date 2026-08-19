import { db } from "./firebaseAdmin.js";

/**
 * In-app notifications, scoped per org (organizations/{orgId}/notifications/{id}) so a
 * recipient uid can never resolve across companies. Started for HR events (attendance today;
 * leave/reimbursement approvals once those modules exist) — any future event just calls
 * createNotification with a new `type`, no schema change needed.
 */
function notificationsRef(orgId) {
  return db.collection("organizations").doc(orgId).collection("notifications");
}

/** `link` is an in-app path (e.g. "/attendance") the frontend router can navigate to on click. */
export async function createNotification(orgId, { recipientUid, type, message, link = null }) {
  await notificationsRef(orgId).add({
    recipientUid,
    type,
    message,
    link,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

/** An admin-composed announcement, fanned out as one notification doc per active team member
 *  (everyone in the org except the sender) — a separate copy per recipient rather than one
 *  shared doc, so each person's read/dismiss state is independent and this reuses the exact
 *  same list/unread/dismiss code path as every other notification. */
export async function broadcastNotification(orgId, { senderUid, message, link = null }) {
  const membersSnap = await db.collection("users").where("orgId", "==", orgId).get();
  const recipients = membersSnap.docs.map((d) => d.data()).filter((m) => m.uid !== senderUid && m.status !== "removed");

  const createdAt = new Date().toISOString();
  const batch = db.batch();
  for (const recipient of recipients) {
    const ref = notificationsRef(orgId).doc();
    batch.set(ref, {
      recipientUid: recipient.uid,
      type: "announcement",
      message,
      link,
      read: false,
      createdAt,
    });
  }
  await batch.commit();
  return recipients.length;
}

/** Most recent notifications for one recipient, newest first — capped, not paginated, since
 *  this backs a small dropdown, not a full inbox. */
export async function listNotifications(orgId, recipientUid, limit = 30) {
  const snap = await notificationsRef(orgId).where("recipientUid", "==", recipientUid).limit(200).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);
}

export async function countUnread(orgId, recipientUid) {
  const snap = await notificationsRef(orgId)
    .where("recipientUid", "==", recipientUid)
    .where("read", "==", false)
    .count()
    .get();
  return snap.data().count;
}

export async function markRead(orgId, recipientUid, notificationId) {
  const ref = notificationsRef(orgId).doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().recipientUid !== recipientUid) return false;
  await ref.update({ read: true });
  return true;
}

export async function markAllRead(orgId, recipientUid) {
  const snap = await notificationsRef(orgId).where("recipientUid", "==", recipientUid).where("read", "==", false).get();
  await Promise.all(snap.docs.map((d) => d.ref.update({ read: true })));
  return snap.size;
}

/** Dismissing removes a notification outright (not just marking it read) -- each recipient
 *  only ever has authority over their own copy. */
export async function deleteNotification(orgId, recipientUid, notificationId) {
  const ref = notificationsRef(orgId).doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().recipientUid !== recipientUid) return false;
  await ref.delete();
  return true;
}
