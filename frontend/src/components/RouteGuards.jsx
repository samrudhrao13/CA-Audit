import { Navigate, useLocation } from "react-router-dom";
import { useUserProfile } from "../context/UserProfileContext";

function useLoadedProfile() {
  const { profile, loading } = useUserProfile();
  const location = useLocation();

  if (loading || profile === undefined) {
    return { pending: <div className="container">Loading...</div> };
  }
  if (!profile) {
    return { pending: <Navigate to="/login" replace /> };
  }
  if (profile.mustResetPassword && location.pathname !== "/reset-password") {
    return { pending: <Navigate to="/reset-password" replace /> };
  }
  return { profile };
}

export function RequireCompanyAccess({ children }) {
  const { pending, profile } = useLoadedProfile();
  if (pending) return pending;
  if (profile.role === "PLATFORM_ADMIN") return <Navigate to="/platform" replace />;
  return children;
}

export function RequirePlatformAdmin({ children }) {
  const { pending, profile } = useLoadedProfile();
  if (pending) return pending;
  if (profile.role !== "PLATFORM_ADMIN") return <Navigate to="/dashboard" replace />;
  return children;
}

/** For company-level admin-only pages (team, email schedule) — company users get bounced to the dashboard. */
export function RequireCompanyAdmin({ children }) {
  const { pending, profile } = useLoadedProfile();
  if (pending) return pending;
  if (profile.role === "PLATFORM_ADMIN") return <Navigate to="/platform" replace />;
  if (profile.role !== "COMPANY_ADMIN") return <Navigate to="/dashboard" replace />;
  return children;
}
