import { Router } from "express";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { currentPeriod, getClientProgress } from "../lib/workflowProgress.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireCompanyMember, requireRole("COMPANY_ADMIN"));

/** Consolidated, per-client status across every workflow — the company admin's one-stop view. */
reportsRouter.get(
  "/clients",
  asyncHandler(async (req, res) => {
    const period = String(req.query.period || currentPeriod());

    const [clientsSnap, membersSnap] = await Promise.all([
      db.collection("organizations").doc(req.orgId).collection("clients").orderBy("name").get(),
      db.collection("users").where("orgId", "==", req.orgId).get(),
    ]);

    const nameByUid = {};
    for (const doc of membersSnap.docs) {
      nameByUid[doc.id] = doc.data().name;
    }

    const clients = await Promise.all(
      clientsSnap.docs.map(async (clientDoc) => {
        const client = clientDoc.data();
        const progress = await getClientProgress(req.orgId, clientDoc.id, period);
        return {
          id: clientDoc.id,
          name: client.name,
          enrolledWorkflows: client.enrolledWorkflows || [],
          assignedTo: (client.assignedUserIds || []).map((uid) => nameByUid[uid] || uid),
          progress,
        };
      })
    );

    res.json({ period, clients });
  })
);
