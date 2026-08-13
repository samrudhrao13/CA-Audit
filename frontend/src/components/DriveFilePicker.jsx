import { useEffect, useState } from "react";
import { api } from "../lib/api";

/** Month → file browser over a client's existing Drive folder, so the extractor can run
 *  a file that's already been filed away instead of requiring a fresh upload every time. */
export function DriveFilePicker({ clientId, onAdd, disabled }) {
  const [months, setMonths] = useState(null);
  const [monthKey, setMonthKey] = useState("");
  const [files, setFiles] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/api/clients/${clientId}/invoices/drive/months`)
      .then((res) => {
        setMonths(res.months);
        if (res.months.length > 0) setMonthKey(res.months[0].monthKey);
      })
      .catch((err) => setError(err.message));
  }, [clientId]);

  useEffect(() => {
    if (!monthKey) {
      setFiles([]);
      return;
    }
    setFiles(null);
    setSelected(new Set());
    api
      .get(`/api/clients/${clientId}/invoices/drive/months/${monthKey}/files`)
      .then((res) => setFiles(res.files))
      .catch((err) => setError(err.message));
  }, [clientId, monthKey]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    const chosen = (files || []).filter((f) => selected.has(f.id)).map((f) => ({ id: f.id, name: f.name }));
    onAdd(chosen);
    setSelected(new Set());
  }

  if (error) {
    return (
      <p className="error-text" style={{ fontSize: 12, margin: "8px 0 0" }}>
        {error}
      </p>
    );
  }

  if (months === null) {
    return (
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
        Loading Drive folders...
      </p>
    );
  }

  if (months.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
        No invoices in Drive yet for this client.
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: 8, marginTop: 8, padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
      <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
        {months.map((m) => (
          <option key={m.monthKey} value={m.monthKey}>
            {m.label}
          </option>
        ))}
      </select>

      {files === null ? (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Loading files...
        </p>
      ) : files.length === 0 ? (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          No files in this month's folder.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
          {files.map((f) => (
            <li key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} disabled={disabled} />
              <span>{f.name}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="secondary"
        disabled={disabled || selected.size === 0}
        onClick={handleAdd}
        style={{ alignSelf: "flex-start" }}
      >
        Add {selected.size > 0 ? selected.size : ""} selected
      </button>
    </div>
  );
}
