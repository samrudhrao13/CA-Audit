import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { platformAdminRouter } from "./routes/platformAdmin.js";
import { clientsRouter } from "./routes/clients.js";
import { workflowsRouter } from "./routes/workflows.js";
import { teamRouter } from "./routes/team.js";
import { gstRouter } from "./routes/gst.js";
import { tdsRouter } from "./routes/tds.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { emailScheduleRouter } from "./routes/emailSchedule.js";
import { driveSettingsRouter } from "./routes/driveSettings.js";
import { workflowProgressRouter } from "./routes/workflowProgress.js";
import { reportsRouter } from "./routes/reports.js";
import { documentsRouter } from "./routes/documents.js";
import { invoicesRouter } from "./routes/invoices.js";
import { companyDocumentsRouter } from "./routes/companyDocuments.js";
import { handscribeRouter, handscribeTemplatesRouter, handscribeGeneralRouter } from "./routes/handscribe.js";
import { convertRouter } from "./routes/convert.js";
import { attendanceRouter } from "./routes/attendance.js";
import { notificationsRouter } from "./routes/notifications.js";
import { startScheduler } from "./lib/scheduler.js";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/platform", platformAdminRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/team", teamRouter);
app.use("/api/clients/:clientId/gst", gstRouter);
app.use("/api/clients/:clientId/tds", tdsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/email-schedule", emailScheduleRouter);
app.use("/api/drive-settings", driveSettingsRouter);
app.use("/api/progress", workflowProgressRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/clients/:clientId/invoices", invoicesRouter);
app.use("/api/clients/:clientId/company-documents", companyDocumentsRouter);
app.use("/api/handscribe/templates", handscribeTemplatesRouter);
app.use("/api/handscribe", handscribeGeneralRouter);
app.use("/api/clients/:clientId/handscribe", handscribeRouter);
app.use("/api/convert", convertRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/notifications", notificationsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

startScheduler();
