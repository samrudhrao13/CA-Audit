const DAY_MS = 24 * 60 * 60 * 1000;

/** Days remaining until `anchorDay` in the current calendar month (negative once it's passed). */
function daysUntil(anchorDay) {
  if (anchorDay == null) return null;
  const now = new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), anchorDay, 23, 59, 59, 999);
  return Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
}

/**
 * One badge per enrolled workflow for list views — combines this period's
 * document/filing stage with the filing-due countdown so it reads as "what's
 * the next step" rather than just a stage name. `timeline` comes from
 * /api/workflows/subscriptions, `progress` from the client's progress map.
 */
export function workflowBadge(workflowKey, timeline, progress) {
  const stage = progress?.stage ?? null;

  if (stage === "filed") {
    return { key: workflowKey, label: `${workflowKey} — Filed`, color: "#059669" };
  }

  const days = daysUntil(timeline?.filingDueDay ?? null);
  const step = stage === "ready_for_filing" ? "Ready to file" : "Awaiting documents";

  let countdown = null;
  if (days != null) {
    countdown = days > 0 ? `due in ${days}d` : days === 0 ? "due today" : `overdue by ${Math.abs(days)}d`;
  }

  const label = countdown ? `${workflowKey} — ${step}, ${countdown}` : `${workflowKey} — ${step}`;

  let color = "#94a3b8"; // no filing-due day configured yet
  if (days != null) {
    if (days < 0) color = "#dc2626";
    else if (days <= 3) color = "#d97706";
    else color = "#2563eb";
  }

  return { key: workflowKey, label, color };
}
