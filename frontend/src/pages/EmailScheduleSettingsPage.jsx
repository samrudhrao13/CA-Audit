import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function EmailScheduleSettingsPage() {
  const [schedule, setSchedule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    const { schedule } = await api.get("/api/email-schedule");
    setSchedule(schedule);
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
      setMessage(`Sent document-request emails to ${result.sent} client(s).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!schedule) return <p>Loading...</p>;

  return (
    <div className="stack">
      <h1>Email schedule</h1>
      <p className="muted">
        Once a month, at the day/time below, every client with at least one enrolled workflow gets
        emailed a list of the documents needed. All times are UTC.
      </p>

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
