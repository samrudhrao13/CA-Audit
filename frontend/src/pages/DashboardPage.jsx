import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useUserProfile } from "../context/UserProfileContext";
import { STAGE_LABELS, STAGE_COLORS, PROGRESS_STAGES } from "../lib/progressStages";
import { describeRunStatus } from "../lib/runStatus";
import { Badge } from "../components/Badge";
import { ClientsIcon, WorkflowIcon, ReportsIcon, TeamIcon, MailIcon, ScanIcon } from "../components/icons";

const STAGE_ORDER = ["not_started", ...PROGRESS_STAGES];

// Cycled per workflow key so each one gets a distinct, stable color.
const WORKFLOW_PALETTE = ["#4f46e5", "#0d9488", "#d97706", "#db2777", "#0891b2", "#7c3aed"];
function colorForWorkflow(index) {
  return WORKFLOW_PALETTE[index % WORKFLOW_PALETTE.length];
}

function StatCard({ icon, label, value, color, to }) {
  const inner = (
    <div className="card stat-card" style={{ "--stat-color": color }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${color}1a`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <p className="muted" style={{ margin: 0 }}>
          {label}
        </p>
      </div>
      <p style={{ fontSize: 30, fontWeight: 800, margin: "10px 0 0" }}>{value}</p>
    </div>
  );
  return to ? (
    <Link to={to} style={{ flex: "1 1 200px" }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

function QuickLink({ to, icon, label }) {
  return (
    <Link to={to} className="quick-link">
      {icon}
      {label}
    </Link>
  );
}

function StageBar({ stageCounts }) {
  const total = STAGE_ORDER.reduce((sum, s) => sum + (stageCounts[s] || 0), 0) || 1;
  return (
    <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: "var(--border-soft)" }}>
      {STAGE_ORDER.map((stage) => {
        const count = stageCounts[stage] || 0;
        if (count === 0) return null;
        return (
          <div
            key={stage}
            title={`${STAGE_LABELS[stage]}: ${count}`}
            style={{ width: `${(count / total) * 100}%`, background: STAGE_COLORS[stage] }}
          />
        );
      })}
    </div>
  );
}

const WORKFLOW_WORKSPACE_PATHS = { GST: "gst", TDS: "tds" };

export function DashboardPage() {
  const { profile } = useUserProfile();
  const isAdmin = profile?.role === "COMPANY_ADMIN";
  const [summary, setSummary] = useState(null);
  const [progressSummary, setProgressSummary] = useState(null);

  useEffect(() => {
    api.get("/api/dashboard/summary").then(setSummary);
    api.get("/api/progress/summary").then(setProgressSummary);
  }, []);

  if (!summary) return <p>Loading...</p>;

  const workflowCounts = Object.entries(summary.clientsByWorkflow || {});

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Welcome back, {profile?.name?.split(" ")[0] || "there"}.
        </p>
      </div>

      <div className="row" style={{ gap: 14 }}>
        <StatCard
          icon={<ClientsIcon size={18} />}
          label={isAdmin ? "Clients" : "Clients assigned to you"}
          value={summary.clientCount}
          color="#4f46e5"
          to="/clients"
        />
        {isAdmin && (
          <StatCard
            icon={<WorkflowIcon size={18} />}
            label="Active workflow subscriptions"
            value={summary.activeSubscriptionCount}
            color="#2563eb"
            to="/settings/workflows"
          />
        )}
        {workflowCounts.map(([key, count], i) => (
          <StatCard
            key={key}
            icon={<WorkflowIcon size={18} />}
            label={`${key} clients`}
            value={count}
            color={colorForWorkflow(i)}
          />
        ))}
      </div>

      {isAdmin && (
        <div className="row" style={{ gap: 10 }}>
          <QuickLink to="/clients" icon={<ClientsIcon size={16} />} label="Clients" />
          <QuickLink to="/reports" icon={<ReportsIcon size={16} />} label="Reports & Analytics" />
          <QuickLink to="/settings/team" icon={<TeamIcon size={16} />} label="Team" />
          <QuickLink to="/settings/workflows" icon={<WorkflowIcon size={16} />} label="Workflows" />
          <QuickLink to="/settings/email-schedule" icon={<MailIcon size={16} />} label="Email schedule" />
          <QuickLink to="/settings/extractor" icon={<ScanIcon size={16} />} label="Extractor" />
        </div>
      )}

      <div>
        <h2 style={{ marginBottom: 2 }}>Workflow progress{progressSummary ? ` — ${progressSummary.period}` : ""}</h2>
        {progressSummary && Object.keys(progressSummary.counts).length > 0 && (
          <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
            How your enrolled clients are distributed across each stage — not a single client's
            document count.
          </p>
        )}
        {!progressSummary || Object.keys(progressSummary.counts).length === 0 ? (
          <p className="muted">No clients enrolled in a workflow yet.</p>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {Object.entries(progressSummary.counts).map(([workflowKey, stageCounts]) => {
              const workflowClients = progressSummary.clients?.[workflowKey] || [];
              return (
                <div key={workflowKey} className="card">
                  <p style={{ marginTop: 0, marginBottom: 10, fontWeight: 700 }}>{workflowKey}</p>
                  <StageBar stageCounts={stageCounts} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    {STAGE_ORDER.filter((stage) => stageCounts[stage]).map((stage) => (
                      <Badge key={stage} color={STAGE_COLORS[stage]}>
                        {STAGE_LABELS[stage]}: {stageCounts[stage]} client{stageCounts[stage] === 1 ? "" : "s"}
                      </Badge>
                    ))}
                  </div>

                  {workflowClients.length > 0 && (
                    <div style={{ marginTop: 12, borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
                      {workflowClients.map((c) => (
                        <Link
                          key={c.id}
                          to={`/clients/${c.id}/documents/${workflowKey}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            fontSize: 13,
                            padding: "6px 4px",
                            borderRadius: 6,
                            transition: "background 160ms ease",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <span>{c.name}</span>
                          <Badge color={STAGE_COLORS[c.stage]}>{STAGE_LABELS[c.stage]}</Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ marginBottom: 12 }}>Recent automation runs</h2>
        {summary.recentRuns.length === 0 ? (
          <p className="muted">No automation runs yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Workflow</th>
                  <th>Period</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentRuns.map((run) => {
                  const statusMeta = describeRunStatus(run.status);
                  const workspacePath = WORKFLOW_WORKSPACE_PATHS[run.workflowKey] || "gst";
                  return (
                    <tr key={run.id}>
                      <td>
                        <Link to={`/clients/${run.clientId}/${workspacePath}`}>{run.clientName}</Link>
                      </td>
                      <td className="muted">{run.workflowKey}</td>
                      <td>{run.period}</td>
                      <td>
                        <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
