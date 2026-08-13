import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { STAGE_LABELS } from "../lib/progressStages";
import { usePagination } from "../hooks/usePagination";
import { Pagination } from "../components/Pagination";

function KpiCard({ label, count }) {
  return (
    <div className="card" style={{ flex: "1 1 140px" }}>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        {label}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700 }}>{count}</p>
    </div>
  );
}

export function ReportsPage() {
  const [catalog, setCatalog] = useState([]);
  const [report, setReport] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/api/workflows/catalog"), api.get("/api/reports/clients")]).then(
      ([catalogRes, reportRes]) => {
        setCatalog(catalogRes.workflows);
        setReport(reportRes);
      }
    );
  }, []);

  const { pageItems: pagedClients, page, setPage, totalPages } = usePagination(report?.clients || []);

  if (!report) return <p>Loading...</p>;

  const workflowCounts = catalog.map((wf) => ({
    key: wf.key,
    name: wf.name,
    count: report.clients.filter((c) => c.enrolledWorkflows.includes(wf.key)).length,
  }));

  return (
    <div className="stack">
      <div>
        <h1>Reports & Analytics</h1>
        <p className="muted">Consolidated status for every client — period {report.period}.</p>
      </div>

      {report.clients.length > 0 && (
        <div className="row" style={{ gap: 12 }}>
          <KpiCard label="Total clients" count={report.clients.length} />
          {workflowCounts.map((wf) => (
            <KpiCard key={wf.key} label={`${wf.name} enabled`} count={wf.count} />
          ))}
        </div>
      )}

      {report.clients.length === 0 ? (
        <p className="muted">No clients yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Assigned to</th>
                {catalog.map((wf) => (
                  <th key={wf.key}>{wf.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedClients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link to={`/clients/${client.id}`}>{client.name}</Link>
                  </td>
                  <td className="muted">
                    {client.assignedTo.length > 0 ? client.assignedTo.join(", ") : "Unassigned"}
                  </td>
                  {catalog.map((wf) => {
                    const enrolled = client.enrolledWorkflows.includes(wf.key);
                    const wfProgress = client.progress[wf.key];
                    return (
                      <td key={wf.key}>
                        {!enrolled ? (
                          <span className="muted">—</span>
                        ) : (
                          <span>
                            {STAGE_LABELS[wfProgress?.stage] || "Not started"}
                            {wfProgress?.stage === "filed" && wfProgress.filedOn
                              ? ` (${new Date(wfProgress.filedOn).toLocaleDateString()})`
                              : wfProgress?.documentsTotal != null
                                ? ` (${wfProgress.documentsUploaded ?? 0}/${wfProgress.documentsTotal} docs)`
                                : wfProgress?.percent != null
                                  ? ` (${wfProgress.percent}%)`
                                  : ""}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
