import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { TemplateBuilder } from "../components/TemplateBuilder";
import { HandscribeLogo } from "../components/HandscribeLogo";

export function SettingsExtractorPage() {
  const [templates, setTemplates] = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    const { templates } = await api.get("/api/handscribe/templates");
    setTemplates(templates);
  }

  useEffect(() => {
    load();
  }, []);

  function closeBuilder() {
    setShowBuilder(false);
    setEditingTemplate(null);
  }

  async function handleDelete(template) {
    if (!confirm(`Delete the "${template.name}" template? This can't be undone.`)) return;
    setDeletingId(template.id);
    setError(null);
    try {
      await api.delete(`/api/handscribe/templates/${template.id}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const builderOpen = showBuilder || editingTemplate;

  return (
    <div className="stack">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0 }}>Manage templates</h1>
            <HandscribeLogo />
          </div>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Field templates for the Extractor — everyone on your team picks from this list to extract a
            handwritten document, either from the sidebar's Extractor page or from a specific client's
            page. Managing the list here is admin-only.
          </p>
        </div>
        {!builderOpen && (
          <button type="button" onClick={() => setShowBuilder(true)}>
            + New template
          </button>
        )}
      </div>

      {builderOpen && (
        <div className="card">
          <TemplateBuilder
            template={editingTemplate}
            onSaved={() => {
              closeBuilder();
              load();
            }}
            onCancel={closeBuilder}
          />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {templates === null ? (
        <p>Loading...</p>
      ) : templates.length === 0 ? (
        <p className="muted">No templates yet — add one above.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((t) => (
            <li key={t.id} className="card list-item-row">
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>{t.name}</p>
                <p className="muted" style={{ margin: 0 }}>
                  {t.fields.length} field{t.fields.length === 1 ? "" : "s"} —{" "}
                  {t.fields.map((f) => f.name).join(", ")}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setEditingTemplate(t);
                    setShowBuilder(false);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={deletingId === t.id}
                  onClick={() => handleDelete(t)}
                >
                  {deletingId === t.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
