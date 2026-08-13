import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { CredentialForm } from "../components/gst/CredentialForm";
import { RunPanel } from "../components/gst/RunPanel";

export function GstWorkspacePage() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [hasCredential, setHasCredential] = useState(false);
  const [periods, setPeriods] = useState([]);
  const [runs, setRuns] = useState([]);

  async function load() {
    const [clientRes, credRes, periodsRes, runsRes] = await Promise.all([
      api.get(`/api/clients/${clientId}`),
      api.get(`/api/clients/${clientId}/gst/credentials/status`),
      api.get(`/api/clients/${clientId}/gst/periods`),
      api.get(`/api/clients/${clientId}/gst/runs`),
    ]);
    setClient(clientRes);
    setHasCredential(credRes.hasCredential);
    setPeriods(periodsRes.periods);
    setRuns(runsRes.runs);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleExport(period, format) {
    await api.download(`/api/clients/${clientId}/gst/export?period=${period}&format=${format}`);
  }

  if (!client) return <p>Loading...</p>;

  return (
    <div className="stack">
      <div>
        <h1>{client.name} — GST</h1>
        <p className="muted">{client.gstin ? `GSTIN: ${client.gstin}` : "No GSTIN on file"}</p>
      </div>

      <CredentialForm clientId={clientId} hasCredential={hasCredential} onSaved={load} />

      <RunPanel clientId={clientId} onRunFinished={load} />

      <div>
        <h2>Return data by period</h2>
        {periods.length === 0 ? (
          <p className="muted">No return data fetched yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {periods.map((p) => (
              <li key={p.id} className="card">
                <div className="list-item-row" style={{ padding: 0, marginBottom: 8 }}>
                  <strong>{p.period}</strong>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button className="secondary" onClick={() => handleExport(p.period, "csv")}>
                      Download CSV
                    </button>
                    <button className="secondary" onClick={() => handleExport(p.period, "xlsx")}>
                      Download Excel
                    </button>
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Return</th>
                      <th>Taxable value</th>
                      <th>IGST</th>
                      <th>CGST</th>
                      <th>SGST</th>
                      <th>Cess</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(p.records || []).map((r, i) => (
                      <tr key={i}>
                        <td>{r.returnType}</td>
                        <td>{r.taxableValue}</td>
                        <td>{r.igst}</td>
                        <td>{r.cgst}</td>
                        <td>{r.sgst}</td>
                        <td>{r.cess}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2>Run history</h2>
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Status</th>
              <th>Started</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.period}</td>
                <td>{run.status}</td>
                <td>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</td>
                <td className="error-text">{run.errorMessage || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
