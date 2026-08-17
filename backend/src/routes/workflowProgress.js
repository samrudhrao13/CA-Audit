import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { canAccessClient, canAccessWorkflow } from "../lib/clientAccess.js";
import { PROGRESS_STAGES, currentPeriod, getClientProgress, setProgressStage } from "../lib/workflowProgress.js";

export const workflowProgressRouter = Router();

workflowProgressRouter.use(requireAuth, requireCompanyMember);

function clientsCollection(orgId) {
  return db.collection("organizations").doc(orgId).collection("clients");
}

workflowProgressRouter.get(
  "/client/:clientId",
  asyncHandler(async (req, res) => {
    const clientSnap = await clientsCollection(req.orgId).doc(req.params.clientId).get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: "Client not found" });
    }
    if (!canAccessClient(req, clientSnap.data())) {
      return res.status(403).json({ error: "This client isn't assigned to you" });
    }

    const period = String(req.query.period || currentPeriod());
    const progress = await getClientProgress(req.orgId, req.params.clientId, period);
    res.json({ period, progress });
  })
);

const advanceSchema = z.object({
  workflowKey: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  stage: z.enum(PROGRESS_STAGES),
});

/** Manual stage-advance — structural stand-in until real per-workflow logic drives this.
 *  Company-user-only, same as the document checklist — admins have read-only access. */
workflowProgressRouter.post(
  "/client/:clientId",
  asyncHandler(async (req, res) => {
    if (req.role === "COMPANY_ADMIN") {
      return res.status(403).json({ error: "Advancing workflow progress is handled by company users — admins have read-only access here." });
    }
    const parsed = advanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const clientSnap = await clientsCollection(req.orgId).doc(req.params.clientId).get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: "Client not found" });
    }
    if (!canAccessWorkflow(req, clientSnap.data(), parsed.data.workflowKey)) {
      return res.status(403).json({ error: "This workflow isn't assigned to you for this client" });
    }

    await setProgressStage(req.orgId, req.params.clientId, parsed.data.workflowKey, parsed.data.period, parsed.data.stage);
    res.json({ ok: true });
  })
);

/** Per-workflow counts of clients in each stage, for the dashboard's consolidated view — plus
 *  the actual client list behind those counts, so the dashboard can link straight through to a
 *  specific client's workflow instead of just showing a dead aggregate number. */
workflowProgressRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const period = String(req.query.period || currentPeriod());
    const clientsSnap = await clientsCollection(req.orgId).get();
    const visibleClients = clientsSnap.docs.filter((d) => canAccessClient(req, d.data()));

    const counts = {}; // { [workflowKey]: { [stage]: n, not_started: n } }
    const clients = {}; // { [workflowKey]: [{ id, name, stage }] }

    await Promise.all(
      visibleClients.map(async (clientDoc) => {
        const clientData = clientDoc.data();
        const enrolled = (clientData.enrolledWorkflows || []).filter((key) => canAccessWorkflow(req, clientData, key));
        if (enrolled.length === 0) return;

        const progress = await getClientProgress(req.orgId, clientDoc.id, period);
        for (const workflowKey of enrolled) {
          counts[workflowKey] ??= { not_started: 0 };
          clients[workflowKey] ??= [];
          const stage = progress[workflowKey]?.stage ?? "not_started";
          counts[workflowKey][stage] = (counts[workflowKey][stage] ?? 0) + 1;
          clients[workflowKey].push({ id: clientDoc.id, name: clientData.name, stage });
        }
      })
    );

    for (const workflowKey of Object.keys(clients)) {
      clients[workflowKey].sort((a, b) => a.name.localeCompare(b.name));
    }

    res.json({ period, counts, clients });
  })
);
