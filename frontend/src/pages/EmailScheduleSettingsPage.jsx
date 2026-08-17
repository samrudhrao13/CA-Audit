import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function EmailScheduleSettingsPage() {
  const [schedule, setSchedule] = useState(null);
  const [senderEmail, setSenderEmail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [senderForm, setSenderForm] = useState({ fromEmail: "", appPassword: "" });
  const [savingSender, setSavingSender] = useState(false);
  const [senderMessage, setSenderMessage] = useState(null);
  const [senderError, setSenderError] = useState(null);

  async function load() {
    const { schedule, senderEmail } = await api.get("/api/email-schedule");
    setSchedule(schedule);
    setSenderEmail(senderEmail);
  }

  useEffect(() => {
    load();
  }, []);

  function setField(field) {
    return (e) => {
      const value = field === "enabled" ? e.target.checked : Number(e.target.value);
      setSchedule((s) => ({ ...s, [field]: value }));
    };
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.put("/api/email-schedule", schedule);
      setMessage("Schedule saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.post("/api/email-schedule/send-now", {});
      setMessage(
        `Sent document-request emails to ${result.sent} client(s).${
          result.remaining ? ` ${result.remaining} more will be picked up by tomorrow's catch-up run.` : ""
        }`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleSaveSender(e) {
    e.preventDefault();
    setSavingSender(true);
    setSenderError(null);
    setSenderMessage(null);
    try {
      await api.put("/api/email-schedule/sender", senderForm);
      setSenderMessage(`Now sending from ${senderForm.fromEmail}.`);
      setSenderForm({ fromEmail: "", appPassword: "" });
      await load();
    } catch (err) {
      setSenderError(err.message);
    } finally {
      setSavingSender(false);
    }
  }

  if (!schedule) return <p>Loading...</p>;

  return (
    <div className="stack">
      <h1>Email schedule</h1>
      <p className="muted">
        Once a month, at the day/time below, every client with at least one enrolled workflow gets
        emailed a list of the documents needed. All times are UTC. If the client list is large,
        sending automatically continues the next day at the same hour until everyone's reached.
      </p>

      <form onSubmit={handleSaveSender} className="card stack">
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>Sender email account</p>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Automated emails (document requests, challan/GST receipts, invoices) are sent from
            your own company's Gmail account, not a shared platform address — so clients see mail
            from you, not from someone else's firm.
          </p>
        </div>

        <p style={{ margin: 0, fontSize: 14 }}>
          Currently sending from:{" "}
          {senderEmail ? (
            <strong>{senderEmail}</strong>
          ) : (
            <span className="muted">not configured yet — falling back to the platform's default account</span>
          )}
        </p>

        <div className="row">
          <div className="field">
            <label htmlFor="fromEmail">Gmail address</label>
            <input
              id="fromEmail"
              type="email"
              placeholder="yourfirm@gmail.com"
              value={senderForm.fromEmail}
              onChange={(e) => setSenderForm((f) => ({ ...f, fromEmail: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="appPassword">Gmail app password</label>
            <input
              id="appPassword"
              type="password"
              placeholder="16-character app password"
              value={senderForm.appPassword}
              onChange={(e) => setSenderForm((f) => ({ ...f, appPassword: e.target.value }))}
              required
            />
          </div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Not your regular Gmail password — generate a dedicated app password under your Google
          Account → Security → 2-Step Verification → App passwords. It's encrypted before being
          stored and is never shown again once saved.
        </p>

        {senderError && <p className="error-text">{senderError}</p>}
        {senderMessage && <p className="success-text">{senderMessage}</p>}
        <div>
          <button type="submit" disabled={savingSender}>
            {savingSender ? "Saving..." : "Save sender account"}
          </button>
        </div>
      </form>

      <form onSubmit={handleSave} className="card stack">
        <div className="row">
          <div className="field">
            <label htmlFor="dayOfMonth">Day of month</label>
            <input
              id="dayOfMonth"
              type="number"
              min={1}
              max={28}
              required
              value={schedule.dayOfMonth}
              onChange={setField("dayOfMonth")}
            />
          </div>
          <div className="field">
            <label htmlFor="hourUTC">Hour (UTC, 0-23)</label>
            <input
              id="hourUTC"
              type="number"
              min={0}
              max={23}
              required
              value={schedule.hourUTC}
              onChange={setField("hourUTC")}
            />
          </div>
          <div className="field">
            <label htmlFor="minuteUTC">Minute (UTC)</label>
            <input
              id="minuteUTC"
              type="number"
              min={0}
              max={59}
              required
              value={schedule.minuteUTC}
              onChange={setField("minuteUTC")}
            />
          </div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input type="checkbox" checked={schedule.enabled} onChange={setField("enabled")} />
          Enabled
        </label>
        {error && <p className="error-text">{error}</p>}
        {message && <p className="success-text">{message}</p>}
        <div className="row">
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save schedule"}
          </button>
          <button type="button" className="secondary" disabled={sending} onClick={handleSendNow}>
            {sending ? "Sending..." : "Send now (test)"}
          </button>
        </div>
      </form>
    </div>
  );
}
