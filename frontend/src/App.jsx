import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import { RequireCompanyAccess, RequireCompanyAdmin, RequirePlatformAdmin } from "./components/RouteGuards";
import { DashboardLayout } from "./components/DashboardLayout";
import { PlatformLayout } from "./components/PlatformLayout";
import { LandingPage } from "./pages/LandingPage";
import { TermsPage } from "./pages/TermsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { PlatformAdminPage } from "./pages/PlatformAdminPage";
import { CompanySubscriptionsPage } from "./pages/CompanySubscriptionsPage";
import { PlatformWorkflowsPage } from "./pages/PlatformWorkflowsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ClientsPage } from "./pages/ClientsPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { GstWorkspacePage } from "./pages/GstWorkspacePage";
import { TdsWorkspacePage } from "./pages/TdsWorkspacePage";
import { SettingsWorkflowsPage } from "./pages/SettingsWorkflowsPage";
import { SettingsTeamPage } from "./pages/SettingsTeamPage";
import { EmailScheduleSettingsPage } from "./pages/EmailScheduleSettingsPage";
import { DriveSettingsPage } from "./pages/DriveSettingsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsExtractorPage } from "./pages/SettingsExtractorPage";
import { ExtractorPage } from "./pages/ExtractorPage";
import { ProfilePage } from "./pages/ProfilePage";
import { DocumentChecklistPage } from "./pages/DocumentChecklistPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/reset-password"
        element={
          <RequireAuth>
            <ResetPasswordPage />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <RequirePlatformAdmin>
              <PlatformLayout />
            </RequirePlatformAdmin>
          </RequireAuth>
        }
      >
        <Route path="/platform" element={<PlatformAdminPage />} />
        <Route path="/platform/workflows" element={<PlatformWorkflowsPage />} />
        <Route path="/platform/companies/:orgId" element={<CompanySubscriptionsPage />} />
      </Route>

      <Route
        element={
          <RequireAuth>
            <RequireCompanyAccess>
              <DashboardLayout />
            </RequireCompanyAccess>
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/extractor" element={<ExtractorPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:clientId" element={<ClientDetailPage />} />
        <Route path="/clients/:clientId/gst" element={<GstWorkspacePage />} />
        <Route path="/clients/:clientId/tds" element={<TdsWorkspacePage />} />
        <Route path="/clients/:clientId/documents/:workflowKey" element={<DocumentChecklistPage />} />
        <Route
          path="/reports"
          element={
            <RequireCompanyAdmin>
              <ReportsPage />
            </RequireCompanyAdmin>
          }
        />
        <Route
          path="/settings/workflows"
          element={
            <RequireCompanyAdmin>
              <SettingsWorkflowsPage />
            </RequireCompanyAdmin>
          }
        />
        <Route
          path="/settings/team"
          element={
            <RequireCompanyAdmin>
              <SettingsTeamPage />
            </RequireCompanyAdmin>
          }
        />
        <Route
          path="/settings/email-schedule"
          element={
            <RequireCompanyAdmin>
              <EmailScheduleSettingsPage />
            </RequireCompanyAdmin>
          }
        />
        <Route
          path="/settings/drive"
          element={
            <RequireCompanyAdmin>
              <DriveSettingsPage />
            </RequireCompanyAdmin>
          }
        />
        <Route
          path="/settings/extractor"
          element={
            <RequireCompanyAdmin>
              <SettingsExtractorPage />
            </RequireCompanyAdmin>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
