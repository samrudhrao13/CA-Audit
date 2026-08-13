/**
 * Company admins can see/manage every client in their company. Company users
 * are restricted to clients explicitly assigned to them — see
 * PUT /api/clients/:clientId/assignment.
 */
export function canAccessClient(req, clientData) {
  if (req.role === "COMPANY_ADMIN") return true;
  return (clientData.assignedUserIds || []).includes(req.uid);
}

/**
 * Finer-grained than canAccessClient: is this user allowed to work on one
 * specific workflow (GST, TDS, ...) for this client? Company admins always
 * can. Company users need client-level access first, and then — only if the
 * admin has actually split this workflow off to specific people via
 * PUT /api/clients/:clientId/workflows/:workflowKey/assignment — need to be
 * one of those people. If no one's been assigned to the workflow
 * specifically yet, every client-level assignee can work on it (that's the
 * pre-split default, so this never locks anyone out of a client's workflows
 * that hasn't been carved up between teammates).
 */
export function canAccessWorkflow(req, clientData, workflowKey) {
  if (!canAccessClient(req, clientData)) return false;
  if (req.role === "COMPANY_ADMIN") return true;
  const workflowAssignees = clientData.workflowAssignments?.[workflowKey];
  if (!workflowAssignees || workflowAssignees.length === 0) return true;
  return workflowAssignees.includes(req.uid);
}
