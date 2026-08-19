import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ProgressBar } from "./ProgressBar";

/**
 * What a company admin sees on any workflow's dedicated workspace page — progress, the
 * (read-only) document checklist, and who it's assigned to. Running the workflow itself
 * (portal credentials, triggering fetches, exported return data, run history) is a company
 * user's job, not an admin's.
 *
 * Every workflow's workspace page (GstWorkspacePage, TdsWorkspacePage, and whatever's added
 * next) should render this for an admin instead of building its own full workspace and hiding
 * pieces of it — that's how this restriction stayed consistent here and how it should stay
 * consistent for future workflows too, without each one having to re-implement it.
 */
export function WorkflowAdminOverview({ clientId, workflowKey, workflowLabel, identifierLabel, identifierField }) {
  const [client, setClient] = useState(null);
  const [progress, setProgress] = useState(null);
  const [period, setPeriod] = useState(null);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    async function load() {
      const [clientRes, progressRes, membersRes] = await Promise.all([
        api.get(`/api/clients/${clientId}`),
        api.get(`/api/progress/client/${clientId}`),
        api.get("/api/team/members"),
      ]);
      setClient(clientRes);
      setProgress(progressRes.progress?.[workflowKey] ?? null);
      setPeriod(progressRes.period);
      setMembers(membersRes.members);
    }
    load();
  }, [clientId, workflowKey]);

  if (!client) return <p>Loading...</p>;

  const docSelection = client.documentChecklistConfig?.[workflowKey];
  const docCount = (docSelection?.predefinedSelected?.length || 0) + (docSelection?.otherDocuments?.length || 0);
  const identifierValue = client[identifierField];

  const assignedUids = client.workflowAssignments?.[workflowKey] || [];
  const assignedNames =
    assignedUids.length === 0
      ? "Everyone assigned to this client"
      : members
          .filter((m) => assignedUids.includes(m.uid))
          .map((m) => m.name)
          .join(", ");

  return (
    <div className="stack">
      <div>
        <h1>
          {client.name} — {workflowLabel}
        </h1>
        <p className="muted">{identifierValue ? `${identifierLabel}: ${identifierValue}` : `No ${identifierLabel} on file`}</p>
      </div>

      <div className="card">
        <p style={{ marginTop: 0, fontWeight: 600 }}>Document checklist{period ? ` — ${period}` : ""}</p>
        {docCount > 0 ? (
          <ProgressBar
            stage={progress?.stage ?? "not_started"}
            documentsUploaded={progress?.documentsUploaded ?? 0}
            documentsTotal={progress?.documentsTotal ?? docCount}
            linkTo={`/clients/${clientId}/documents/${workflowKey}`}
          />
        ) : (
          <>
            <ProgressBar stage={progress?.stage ?? "not_started"} documentsUploaded={0} documentsTotal={null} />
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
              No documents selected for this client yet — a company admin can pick which ones apply
              under Clients → this client → Edit client → "Document checklist."
            </p>
          </>
        )}
      </div>

      <div className="card">
        <p style={{ marginTop: 0, fontWeight: 600 }}>Assigned to</p>
        <p className="muted" style={{ margin: 0 }}>
          {assignedNames}
        </p>
      </div>
    </div>
  );
}
