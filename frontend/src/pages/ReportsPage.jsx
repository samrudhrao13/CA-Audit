import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { STAGE_LABELS, PROGRESS_STAGES } from "../lib/progressStages";
import { usePagination } from "../hooks/usePagination";
import { Pagination } from "../components/Pagination";
import { BarList } from "../components/charts/BarList";
import { CATEGORICAL, STAGE_RAMP, NOT_STARTED_COLOR } from "../components/charts/chartPalette";

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="card" style={{ flex: "1 1 320px" }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{title}</p>
      {subtitle && (
        <p className="muted" style={{ margin: "2px 0 16px", fontSize: 12 }}>
          {subtitle}
        </p>
      )}
      <div style={{ marginTop: subtitle ? 0 : 16 }}>{children}</div>
    </div>
  );
}

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

  // Nominal identity (which workflow) -- fixed categorical order, one color per workflow,
  // stable regardless of how many clients are enrolled.
  const workflowChartData = workflowCounts.map((wf, i) => ({
    key: wf.key,
    label: wf.name,
    value: wf.count,
    color: CATEGORICAL[i % CATEGORICAL.length],
  }));

  // Ordinal (where clients stand) -- every enrolled workflow across every client, tallied by
  // stage. "Not started" is absence, not the lightest step of the progress ramp, so it gets
  // its own neutral rather than stretching the hue to a 6th step.
  const stageCounts = {};
  for (const client of report.clients) {
    for (const wfKey of client.enrolledWorkflows) {
      const stage = client.progress[wfKey]?.stage || "not_started";
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    }
  }
  const stageChartData = [
    { key: "not_started", label: STAGE_LABELS.not_started, value: stageCounts.not_started || 0, color: NOT_STARTED_COLOR },
    ...PROGRESS_STAGES.map((stage, i) => ({
      key: stage,
      label: STAGE_LABELS[stage],
      value: stageCounts[stage] || 0,
      color: STAGE_RAMP[i],
    })),
  ];

  // Magnitude comparison across team members -- one measure, one hue; "Unassigned" gets a
  // neutral instead of the accent since it isn't really an assignee.
  const workloadByName = new Map();
  let unassignedCount = 0;
  for (const client of report.clients) {
    if (client.assignedTo.length === 0) {
      unassignedCount++;
    } else {
      for (const name of client.assignedTo) {
        workloadByName.set(name, (workloadByName.get(name) || 0) + 1);
      }
    }
  }
  const workloadEntries = [...workloadByName.entries()].map(([name, count]) => ({ key: name, label: name, value: count }));
  if (unassignedCount > 0) {
    workloadEntries.push({ key: "__unassigned", label: "Unassigned", value: unassignedCount });
  }
  const workloadChartData = workloadEntries
    .sort((a, b) => b.value - a.value)
    .map((d) => ({ ...d, color: d.key === "__unassigned" ? NOT_STARTED_COLOR : "var(--primary)" }));

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

      {report.clients.length > 0 && (
        <div className="row" style={{ gap: 12, alignItems: "stretch" }}>
          <ChartCard title="Clients by workflow" subtitle="How many clients are enrolled in each workflow">
            <BarList data={workflowChartData} />
          </ChartCard>
          <ChartCard title="Where clients stand" subtitle={`Every enrolled workflow, by stage — ${report.period}`}>
            <BarList data={stageChartData} />
          </ChartCard>
          <ChartCard title="Client workload" subtitle="Clients assigned per team member">
            <BarList data={workloadChartData} emptyText="No clients assigned yet." />
          </ChartCard>
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
