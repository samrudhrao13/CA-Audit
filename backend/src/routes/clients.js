import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/firebaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember, requireRole } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { canAccessClient, canAccessWorkflow } from "../lib/clientAccess.js";
import { ensureCompanyFolder } from "../lib/googleDrive.js";
import { currentPeriod, getClientProgress, summarizeClientStatus } from "../lib/workflowProgress.js";
import { TDS_OLD_CODE_SET, TDS_NEW_CODE_SET } from "../lib/tdsCodes.js";

export const clientsRouter = Router();

clientsRouter.use(requireAuth, requireCompanyMember);

function clientsCollection(orgId) {
  return db.collection("organizations").doc(orgId).collection("clients");
}

/** Company admins see every client; company users only see clients assigned to them. Each client
 *  gets a rolled-up status (see summarizeClientStatus) for the list page's color-coded dot. */
clientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const snap = await clientsCollection(req.orgId).orderBy("createdAt", "desc").get();
    const visible = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((client) => canAccessClient(req, client));

    const period = currentPeriod();
    const clients = await Promise.all(
      visible.map(async (client) => {
        const progress = await getClientProgress(req.orgId, client.id, period);
        return { ...client, status: summarizeClientStatus(client.enrolledWorkflows, progress), progress };
      })
    );

    res.json({ clients, period });
  })
);

// Must match frontend/src/pages/ClientsPage.jsx's dropdown options.
export const COMPANY_TYPES = [
  "Proprietorship",
  "Partnership",
  "LLP",
  "Private Limited Company",
  "Public Limited Company",
  "HUF",
  "Trust",
  "Society",
  "AOP/BOI",
  "Other",
];

// Must match frontend/src/pages/ClientsPage.jsx's dropdown options.
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const tdsCodeEntrySchema = z
  .object({
    regime: z.enum(["old", "new"]),
    code: z.string().min(1),
  })
  .refine((entry) => (entry.regime === "old" ? TDS_OLD_CODE_SET : TDS_NEW_CODE_SET).has(entry.code), {
    message: "Unrecognized TDS section code",
    path: ["code"],
  });

// Free-form "name/value" rows for whatever a client needs beyond the standard registration
// fields — the standard ones (GSTIN, PAN, TAN, HSN code, CIN) stay fixed for every client;
// this is only for the extra, client-specific ones.
const customFieldSchema = z.object({
  name: z.string().trim().min(1).max(100),
  value: z.string().trim().max(500).optional().default(""),
});

// Per-workflow document checklist for one client: which of the company's predefined
// documents (see workflows.js's documentDefaults) apply to this client, plus any extra
// documents unique to just this client that aren't in the predefined list at all. The
// resolved list (predefinedSelected + otherDocuments) is what actually drives that client's
// document-request emails and upload checklist — see routes/documents.js.
const documentSelectionSchema = z.object({
  predefinedSelected: z.array(z.string()).max(50).optional().default([]),
  otherDocuments: z.array(z.string()).max(50).optional().default([]),
});

// Shared by create and edit — the client-profile fields themselves. Create
// additionally asks for the document-request email recipients (see below);
// edit leaves those alone (they have their own dedicated save action).
const clientProfileFields = {
  name: z.string().min(1).max(200),
  gstin: z.string().trim().optional().default(""),
  pan: z.string().trim().optional().default(""),
  tan: z.string().trim().optional().default(""),
  hsnCode: z.string().trim().regex(/^\d*$/, "HSN code must be numeric").max(8).optional().default(""),
  cin: z.string().trim().max(21).optional().default(""),
  sacCode: z.string().trim().regex(/^\d*$/, "SAC code must be numeric").max(6).optional().default(""),
  addressLine1: z.string().trim().optional().default(""),
  addressLine2: z.string().trim().optional().default(""),
  addressLine3: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  state: z.enum(INDIAN_STATES).optional().nullable(),
  pinCode: z.string().trim().optional().default(""),
  phoneNumber: z.string().trim().optional().default(""),
  email: z.string().trim().optional().default(""),
  contactPersonName: z.string().trim().optional().default(""),
  contactPersonPhone: z.string().trim().optional().default(""),
  contactPersonEmail: z.string().email(),
  companyType: z.enum(COMPANY_TYPES).optional().nullable(),
  natureOfBusiness: z.string().trim().optional().default(""),
  tdsApplicability: z.array(tdsCodeEntrySchema).max(20).optional().default([]),
  customFields: z.array(customFieldSchema).max(30).optional().default([]),
  documentChecklistConfig: z.record(z.string(), documentSelectionSchema).optional().default({}),
};

/** Trims/drops blank entries so an accidental empty "Add" row never blocks saving, and
 *  normalizes the map into a plain object safe to store on the client doc. */
function normalizeDocumentChecklistConfig(config) {
  const normalized = {};
  for (const [workflowKey, selection] of Object.entries(config || {})) {
    normalized[workflowKey] = {
      predefinedSelected: (selection.predefinedSelected || []).map((s) => s.trim()).filter(Boolean),
      otherDocuments: (selection.otherDocuments || []).map((s) => s.trim()).filter(Boolean),
    };
  }
  return normalized;
}

function clientProfileData(parsedData) {
  return {
    name: parsedData.name,
    gstin: parsedData.gstin || null,
    pan: parsedData.pan || null,
    tan: parsedData.tan || null,
    hsnCode: parsedData.hsnCode || null,
    cin: parsedData.cin || null,
    sacCode: parsedData.sacCode || null,
    addressLine1: parsedData.addressLine1 || null,
    addressLine2: parsedData.addressLine2 || null,
    addressLine3: parsedData.addressLine3 || null,
    city: parsedData.city || null,
    state: parsedData.state || null,
    pinCode: parsedData.pinCode || null,
    phoneNumber: parsedData.phoneNumber || null,
    email: parsedData.email || null,
    tdsApplicability: parsedData.tdsApplicability || [],
    customFields: parsedData.customFields || [],
    documentChecklistConfig: normalizeDocumentChecklistConfig(parsedData.documentChecklistConfig),
    contactPersonName: parsedData.contactPersonName || null,
    contactPersonPhone: parsedData.contactPersonPhone || null,
    contactPersonEmail: parsedData.contactPersonEmail,
    companyType: parsedData.companyType || null,
    natureOfBusiness: parsedData.natureOfBusiness || null,
  };
}

const createClientSchema = z
  .object({
    ...clientProfileFields,
    notifyCompanyEmail: z.boolean().optional().default(false),
    notifyContactPersonEmail: z.boolean().optional().default(true),
  })
  .refine((data) => data.notifyCompanyEmail || data.notifyContactPersonEmail, {
    message: "Select at least one email to send document requests to",
    path: ["notifyContactPersonEmail"],
  })
  .refine((data) => !data.notifyCompanyEmail || data.email, {
    message: "Company email is required when it's selected as a recipient",
    path: ["email"],
  });

const updateClientSchema = z.object(clientProfileFields);

clientsRouter.post(
  "/",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = createClientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    const ref = clientsCollection(req.orgId).doc();
    const data = {
      ...clientProfileData(parsed.data),
      country: "India",
      notifyCompanyEmail: parsed.data.notifyCompanyEmail,
      notifyContactPersonEmail: parsed.data.notifyContactPersonEmail,
      enrolledWorkflows: [],
      assignedUserIds: [],
      workflowAssignments: {},
      createdAt: new Date().toISOString(),
    };
    await ref.set(data);

    // Best-effort — a client is fully usable even if Drive isn't configured or this call
    // fails; ensureMonthFolder falls back to creating the company folder lazily later.
    try {
      await ensureCompanyFolder(req.orgId, ref.id);
    } catch (err) {
      console.error(`Drive: failed to create company folder for client ${ref.id}:`, err.message);
    }

    res.json({ id: ref.id, ...data });
  })
);

clientsRouter.get(
  "/:clientId",
  asyncHandler(async (req, res) => {
    const snap = await clientsCollection(req.orgId).doc(req.params.clientId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Client not found" });
    }
    if (!canAccessClient(req, snap.data())) {
      return res.status(403).json({ error: "This client isn't assigned to you" });
    }
    const client = snap.data();
    // Which of this client's enrolled workflows the requesting user can actually work on —
    // company admins get all of them, company users only the ones they're split into (see canAccessWorkflow).
    const visibleWorkflowKeys = (client.enrolledWorkflows || []).filter((key) =>
      canAccessWorkflow(req, client, key)
    );
    res.json({ id: snap.id, ...client, visibleWorkflowKeys });
  })
);

/** Company admin edits a client's profile — company/registration/address/contact fields only.
 *  Doesn't touch enrolledWorkflows, assignedUserIds, workflowAssignments, or notify prefs, which
 *  all have their own dedicated actions elsewhere. */
clientsRouter.put(
  "/:clientId",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = updateClientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    const clientRef = clientsCollection(req.orgId).doc(req.params.clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: "Client not found" });
    }

    const data = clientProfileData(parsed.data);
    await clientRef.update(data);
    res.json({ id: clientRef.id, ...clientSnap.data(), ...data });
  })
);

/**
 * Company admin deletes a client entirely — removes the client doc and every subcollection
 * under it (extractions, invoices, companyDocuments, documentChecklist/files, emailLog,
 * workflowProgress, gst/tds runs & credentials & periods, etc.) from Firestore via
 * recursiveDelete, which walks arbitrarily deep so nothing needs to be enumerated by hand
 * here as new subcollections get added over time.
 *
 * Deliberately does NOT touch Google Drive — the client's Drive folders (invoices, Company
 * Documents) and everything filed in them are left exactly as they are. Deleting a client
 * from the app is not the same as destroying the paper trail; the Drive folder just becomes
 * unlinked from the app (still findable by its company name under the configured root).
 */
clientsRouter.delete(
  "/:clientId",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const clientRef = clientsCollection(req.orgId).doc(req.params.clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: "Client not found" });
    }

    await db.recursiveDelete(clientRef);
    res.json({ ok: true });
  })
);

/** History of document-request emails sent for this client — shown inline on its detail page. */
clientsRouter.get(
  "/:clientId/email-log",
  asyncHandler(async (req, res) => {
    const clientRef = clientsCollection(req.orgId).doc(req.params.clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: "Client not found" });
    }
    if (!canAccessClient(req, clientSnap.data())) {
      return res.status(403).json({ error: "This client isn't assigned to you" });
    }

    const logSnap = await clientRef.collection("emailLog").orderBy("sentAt", "desc").limit(20).get();
    res.json({ emailLog: logSnap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  })
);

const notificationPrefsSchema = z
  .object({
    notifyCompanyEmail: z.boolean(),
    notifyContactPersonEmail: z.boolean(),
  })
  .refine((data) => data.notifyCompanyEmail || data.notifyContactPersonEmail, {
    message: "Select at least one email to send document requests to",
  });

/** Saved and reused for every future document-request email — not asked again each run. */
clientsRouter.put(
  "/:clientId/notification-prefs",
  asyncHandler(async (req, res) => {
    const parsed = notificationPrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    const clientRef = clientsCollection(req.orgId).doc(req.params.clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: "Client not found" });
    }
    if (!canAccessClient(req, clientSnap.data())) {
      return res.status(403).json({ error: "This client isn't assigned to you" });
    }
    if (parsed.data.notifyCompanyEmail && !clientSnap.data().email) {
      return res.status(400).json({ error: "This client has no company email on file" });
    }

    await clientRef.update(parsed.data);
    res.json({ ok: true });
  })
);

const assignmentSchema = z.object({ assignedUserIds: z.array(z.string()).max(50) });

/** Only the company admin assigns clients to users — see canAccessClient for how it's enforced. */
clientsRouter.put(
  "/:clientId/assignment",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = assignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const clientRef = clientsCollection(req.orgId).doc(req.params.clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: "Client not found" });
    }

    const membersSnap = await db.collection("users").where("orgId", "==", req.orgId).get();
    const validUids = new Set(membersSnap.docs.map((d) => d.id));
    const invalid = parsed.data.assignedUserIds.filter((uid) => !validUids.has(uid));
    if (invalid.length > 0) {
      return res.status(400).json({ error: "One or more selected users aren't part of this company" });
    }

    await clientRef.update({ assignedUserIds: parsed.data.assignedUserIds });
    res.json({ ok: true });
  })
);

const workflowAssignmentSchema = z.object({ assignedUserIds: z.array(z.string()).max(50) });

/**
 * Splits one workflow (e.g. TDS) off to specific teammates within a client —
 * separate from the client-level assignment above, so e.g. GST can go to one
 * person and TDS to another on the same client. Assignees must already be
 * client-level assignees (workflow assignment refines who does what among
 * people who can already see this client, it doesn't grant new client access).
 * An empty list clears the split — every client-level assignee can work on
 * it again, see canAccessWorkflow.
 */
clientsRouter.put(
  "/:clientId/workflows/:workflowKey/assignment",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = workflowAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const clientRef = clientsCollection(req.orgId).doc(req.params.clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: "Client not found" });
    }
    const client = clientSnap.data();
    if (!(client.enrolledWorkflows || []).includes(req.params.workflowKey)) {
      return res.status(400).json({ error: "This workflow isn't enabled for this client" });
    }

    const clientAssignees = new Set(client.assignedUserIds || []);
    const invalid = parsed.data.assignedUserIds.filter((uid) => !clientAssignees.has(uid));
    if (invalid.length > 0) {
      return res.status(400).json({ error: "One or more selected users aren't assigned to this client" });
    }

    await clientRef.update({
      [`workflowAssignments.${req.params.workflowKey}`]: parsed.data.assignedUserIds,
    });
    res.json({ ok: true });
  })
);

const enrollSchema = z.object({ workflowKey: z.string().min(1) });

/** Enables a workflow for a client, only if the org's subscription to it is active. Admin-only — company users just see what's already enabled for their assigned clients. */
clientsRouter.post(
  "/:clientId/workflows",
  requireRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = enrollSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    const { workflowKey } = parsed.data;

    const subSnap = await db
      .collection("organizations")
      .doc(req.orgId)
      .collection("workflowSubscriptions")
      .doc(workflowKey)
      .get();
    if (!subSnap.exists || subSnap.data().status !== "active") {
      return res.status(400).json({ error: "This workflow is not active on your subscription" });
    }

    const clientRef = clientsCollection(req.orgId).doc(req.params.clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: "Client not found" });
    }
    if (!canAccessClient(req, clientSnap.data())) {
      return res.status(403).json({ error: "This client isn't assigned to you" });
    }

    const enrolledWorkflows = new Set(clientSnap.data().enrolledWorkflows || []);
    enrolledWorkflows.add(workflowKey);
    await clientRef.update({ enrolledWorkflows: [...enrolledWorkflows] });

    res.json({ ok: true });
  })
);
