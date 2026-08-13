import { Router } from "express";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { canAccessClient } from "../lib/clientAccess.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireCompanyMember);

dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const clientsSnap = await db.collection("organizations").doc(req.orgId).collection("clients").get();
    // Company admins see every client; company users only their assigned ones.
    const visibleClients = clientsSnap.docs.filter((d) => canAccessClient(req, d.data()));

    const subsSnap = await db
      .collection("organizations")
      .doc(req.orgId)
      .collection("workflowSubscriptions")
      .where("status", "==", "active")
      .get();

    // Recent runs live per-client (organizations/{orgId}/clients/{clientId}/gstRuns
    // and .../tdsRuns). Querying each client's own small collections avoids a
    // Firestore collection-group query (and the index-exemption setup that
    // comes with one) — fine at this scale, and simpler to reason about besides.
    const perClientRuns = await Promise.all(
      visibleClients.map(async (clientDoc) => {
        const [gstRunsSnap, tdsRunsSnap] = await Promise.all([
          clientDoc.ref.collection("gstRuns").orderBy("createdAt", "desc").limit(3).get(),
          clientDoc.ref.collection("tdsRuns").orderBy("createdAt", "desc").limit(3).get(),
        ]);
        return [
          ...gstRunsSnap.docs.map((d) => ({ id: d.id, workflowKey: "GST", ...d.data() })),
          ...tdsRunsSnap.docs.map((d) => ({ id: d.id, workflowKey: "TDS", ...d.data() })),
        ];
      })
    );
    const recentRuns = perClientRuns
      .flat()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 5);

    // How many of the visible clients (all of them for an admin, just their
    // own for a company user) are enrolled in each workflow.
    const clientsByWorkflow = {};
    for (const clientDoc of visibleClients) {
      for (const workflowKey of clientDoc.data().enrolledWorkflows || []) {
        clientsByWorkflow[workflowKey] = (clientsByWorkflow[workflowKey] ?? 0) + 1;
      }
    }

    res.json({
      clientCount: visibleClients.length,
      activeSubscriptionCount: subsSnap.size,
      clientsByWorkflow,
      recentRuns,
    });
  })
);
