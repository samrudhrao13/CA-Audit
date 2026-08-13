import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ordinal } from "../lib/ordinal";
import { relevantMonthLabel } from "../lib/complianceMonth";

function TimelineEditor({ workflowKey, timeline, onSaved }) {
  const [form, setForm] = useState({
    documentCollectionStartDay: timeline.documentCollectionStartDay ?? "",
    documentCollectionEndDay: timeline.documentCollectionEndDay ?? "",
    filingDueDay: timeline.filingDueDay ?? "",
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/workflows/subscriptions/${workflowKey}/timeline`, {
        documentCollectionStartDay: form.documentCollectionStartDay === "" ? null : Number(form.documentCollectionStartDay),
        documentCollectionEndDay: form.documentCollectionEndDay === "" ? null : Number(form.documentCollectionEndDay),
        filingDueDay: form.filingDueDay === "" ? null : Number(form.filingDueDay),
      });
      setEditing(false);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/workflows/subscriptions/${workflowKey}/timeline`, { reset: true });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const collected =
      timeline.documentCollectionStartDay && timeline.documentCollectionEndDay
        ? `Documents collected ${ordinal(timeline.documentCollectionStartDay)}–${ordinal(timeline.documentCollectionEndDay)}`
        : null;
    const due = timeline.filingDueDay ? `Filing due by the ${ordinal(timeline.filingDueDay)}` : null;
    const text = [collected, due].filter(Boolean).join(" · ");
    const month = text
      ? relevantMonthLabel(timeline.filingDueDay ?? timeline.documentCollectionEndDay ?? null)
      : null;

    return (
      <div style={{ marginTop: 8 }}>
        <p className="muted" style={{ margin: 0 }}>
          {text ? `${text} — ${month}` : "No compliance calendar set yet."}
          {timeline.isOverridden && " (customized)"}
        </p>
        <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={() => setEditing(true)}>
          {timeline.isOverridden ? "Edit" : "Customize timeline"}
        </button>
        {timeline.isOverridden && (
          <button type="button" className="secondary" style={{ marginTop: 6, marginLeft: 8 }} disabled={saving} onClick={handleReset}>
            Reset to platform default
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="row" style={{ marginTop: 8 }}>
      <div className="field">
        <label htmlFor={`start-${workflowKey}`}>Collection start day</label>
        <input
          id={`start-${workflowKey}`}
          type="number"
          min={1}
          max={28}
          value={form.documentCollectionStartDay}
          onChange={(e) => setForm((f) => ({ ...f, documentCollectionStartDay: e.target.value }))}
        />
      </div>
      <div className="field">
        <label htmlFor={`end-${workflowKey}`}>Collection end day</label>
        <input
          id={`end-${workflowKey}`}
          type="number"
          min={1}
          max={28}
          value={form.documentCollectionEndDay}
          onChange={(e) => setForm((f) => ({ ...f, documentCollectionEndDay: e.target.value }))}
        />
      </div>
      <div className="field">
        <label htmlFor={`due-${workflowKey}`}>Filing due day</label>
        <input
          id={`due-${workflowKey}`}
          type="number"
          min={1}
          max={28}
          value={form.filingDueDay}
          onChange={(e) => setForm((f) => ({ ...f, filingDueDay: e.target.value }))}
        />
      </div>
      <button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </button>
      <button type="button" className="secondary" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}

export function SettingsWorkflowsPage() {
  const [catalog, setCatalog] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);

  async function load() {
    const [catalogRes, subsRes] = await Promise.all([
      api.get("/api/workflows/catalog"),
      api.get("/api/workflows/subscriptions"),
    ]);
    setCatalog(catalogRes.workflows);
    setSubscriptions(subsRes.subscriptions);
  }

  useEffect(() => {
    load();
  }, []);

  const subscriptionByKey = new Map(subscriptions.map((s) => [s.workflowKey, s]));

  return (
    <div className="stack">
      <h1>Workflow subscriptions</h1>
      <p className="muted">
        These are the workflows included in your firm&apos;s subscription — granted by the platform, not editable
        here. You can customize the compliance calendar (document collection window + filing due date) for your
        own firm, though — it starts from the platform default.
      </p>
      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {catalog.map((wf) => {
          const subscription = subscriptionByKey.get(wf.key);
          const isActive = subscription?.status === "active";
          return (
            <li key={wf.key} className="card">
              <div className="list-item-row" style={{ padding: 0 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{wf.name}</p>
                  <p className="muted" style={{ margin: 0 }}>
                    {wf.description}
                  </p>
                </div>
                <span className={isActive ? "success-text" : "muted"}>{isActive ? "Active" : "Not included"}</span>
              </div>
              {isActive && (
                <TimelineEditor workflowKey={wf.key} timeline={subscription.timeline} onSaved={load} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
