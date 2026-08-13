import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

function toFormState(wf) {
  return {
    requiredDocuments: (wf.requiredDocuments || []).join("\n"),
    documentCollectionStartDay: wf.documentCollectionStartDay ?? "",
    documentCollectionEndDay: wf.documentCollectionEndDay ?? "",
    filingDueDay: wf.filingDueDay ?? "",
  };
}

function WorkflowEditor({ workflow, onSaved }) {
  const [form, setForm] = useState(toFormState(workflow));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/api/platform/workflows/${workflow.key}`, {
        requiredDocuments: form.requiredDocuments
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        documentCollectionStartDay: form.documentCollectionStartDay === "" ? null : Number(form.documentCollectionStartDay),
        documentCollectionEndDay: form.documentCollectionEndDay === "" ? null : Number(form.documentCollectionEndDay),
        filingDueDay: form.filingDueDay === "" ? null : Number(form.filingDueDay),
      });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="card stack">
      <div>
        <p style={{ margin: 0, fontWeight: 600 }}>{workflow.name}</p>
        <p className="muted" style={{ margin: 0 }}>
          {workflow.description}
        </p>
      </div>

      <div className="field">
        <label htmlFor={`docs-${workflow.key}`}>Required documents (one per line)</label>
        <textarea
          id={`docs-${workflow.key}`}
          rows={4}
          value={form.requiredDocuments}
          onChange={setField("requiredDocuments")}
          style={{ width: "100%", boxSizing: "border-box", padding: 8, fontFamily: "inherit", fontSize: 14 }}
        />
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor={`start-${workflow.key}`}>Document collection start day</label>
          <input
            id={`start-${workflow.key}`}
            type="number"
            min={1}
            max={28}
            value={form.documentCollectionStartDay}
            onChange={setField("documentCollectionStartDay")}
          />
        </div>
        <div className="field">
          <label htmlFor={`end-${workflow.key}`}>Document collection end day</label>
          <input
            id={`end-${workflow.key}`}
            type="number"
            min={1}
            max={28}
            value={form.documentCollectionEndDay}
            onChange={setField("documentCollectionEndDay")}
          />
        </div>
        <div className="field">
          <label htmlFor={`due-${workflow.key}`}>Filing due day</label>
          <input
            id={`due-${workflow.key}`}
            type="number"
            min={1}
            max={28}
            value={form.filingDueDay}
            onChange={setField("filingDueDay")}
          />
        </div>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        This is the default every company starts with — company admins can override it for their own firm.
      </p>

      {error && <p className="error-text">{error}</p>}
      {saved && <p className="success-text">Saved.</p>}
      <button type="submit" disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

export function PlatformWorkflowsPage() {
  const [catalog, setCatalog] = useState(null);

  async function load() {
    const { workflows } = await api.get("/api/workflows/catalog");
    setCatalog(workflows);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="stack">
      <div>
        <Link to="/platform">&larr; Companies</Link>
        <h1>Workflow catalog</h1>
        <p className="muted">
          Required documents and the default compliance calendar (document collection window + filing due date)
          for each workflow — applies to every company unless they override it.
        </p>
      </div>

      {catalog === null ? (
        <p>Loading...</p>
      ) : (
        <div className="stack">
          {catalog.map((wf) => (
            <WorkflowEditor key={wf.key} workflow={wf} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}
