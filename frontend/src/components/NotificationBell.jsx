import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useUserProfile } from "../context/UserProfileContext";
import { BellIcon, PlusIcon, XIcon } from "./icons";

/** Small in-app notification dropdown — HR events (attendance corrections; leave and
 *  reimbursement approvals once those modules exist reuse the same backend) plus admin-composed
 *  announcements broadcast to the whole team. Polls rather than a live subscription, matching
 *  how the rest of the app refreshes data on user action instead of holding a socket open. */
export function NotificationBell() {
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const isAdmin = profile?.role === "COMPANY_ADMIN";
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sendResult, setSendResult] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const rootRef = useRef(null);

  async function load() {
    try {
      const data = await api.get("/api/notifications");
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Best-effort — a failed notification fetch shouldn't disrupt the rest of the page.
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setComposing(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleToggleOpen() {
    setOpen((v) => !v);
    setComposing(false);
  }

  function handleToggleCompose() {
    setComposing((v) => !v);
    setSendError(null);
    setSendResult(null);
  }

  async function handleClickNotification(n) {
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      api.post(`/api/notifications/${n.id}/read`, {}).catch(() => {});
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function handleDismiss(e, n) {
    e.stopPropagation();
    const wasUnread = !n.read;
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.delete(`/api/notifications/${n.id}`);
    } catch {
      await load();
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
    try {
      await api.post("/api/notifications/read-all", {});
    } catch {
      await load();
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    setSending(true);
    setSendError(null);
    setSendResult(null);
    try {
      const result = await api.post("/api/notifications/broadcast", { message: message.trim() });
      setSendResult(`Sent to ${result.sent} team member${result.sent === 1 ? "" : "s"}.`);
      setMessage("");
      setComposing(false);
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="secondary"
        onClick={handleToggleOpen}
        aria-label="Notifications"
        style={{ position: "relative", padding: "6px 8px", display: "flex", alignItems: "center" }}
      >
        <BellIcon size={17} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              background: "var(--danger)",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              minWidth: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            maxHeight: 460,
            overflowY: "auto",
            zIndex: 30,
            padding: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: "1px solid var(--border-soft)",
            }}
          >
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {unreadCount > 0 && (
                <button type="button" className="link-btn" style={{ fontSize: 12 }} onClick={handleMarkAllRead}>
                  Mark all read
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  aria-label="New announcement"
                  title="New announcement"
                  onClick={handleToggleCompose}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "none",
                    background: composing ? "var(--primary)" : "var(--primary-soft)",
                    color: composing ? "#fff" : "var(--primary-dark)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <PlusIcon size={14} />
                </button>
              )}
            </div>
          </div>

          {isAdmin && composing && (
            <form onSubmit={handleSend} style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-soft)" }} className="stack">
              <textarea
                autoFocus
                required
                rows={3}
                maxLength={1000}
                placeholder="Write an announcement for your team..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{ resize: "vertical", fontSize: 13 }}
              />
              {sendError && (
                <p className="error-text" style={{ margin: 0, fontSize: 12 }}>
                  {sendError}
                </p>
              )}
              <div className="row" style={{ gap: 8 }}>
                <button type="submit" disabled={sending || !message.trim()} style={{ padding: "5px 12px", fontSize: 12.5 }}>
                  {sending ? "Sending..." : "Send to team"}
                </button>
                <button type="button" className="secondary" style={{ padding: "5px 12px", fontSize: 12.5 }} onClick={handleToggleCompose}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {sendResult && (
            <p className="success-text" style={{ margin: 0, padding: "8px 14px", fontSize: 12 }}>
              {sendResult}
            </p>
          )}

          {notifications.length === 0 ? (
            <p className="muted" style={{ margin: 0, padding: "18px 14px", fontSize: 13 }}>
              Nothing yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {notifications.map((n) => (
                <li key={n.id} style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => handleClickNotification(n)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: n.read ? "transparent" : "var(--primary-soft)",
                      border: "none",
                      borderBottom: "1px solid var(--border-soft)",
                      padding: "10px 34px 10px 14px",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--text)",
                    }}
                  >
                    <span style={{ display: "block" }}>{n.message}</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    title="Dismiss"
                    onClick={(e) => handleDismiss(e, n)}
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "none",
                      background: "transparent",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <XIcon size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
