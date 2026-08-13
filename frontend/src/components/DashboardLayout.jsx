import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useUserProfile } from "../context/UserProfileContext";
import { ComplianceBanner } from "./ComplianceBanner";
import { AccountIcon } from "./AccountIcon";
import {
  DashboardIcon,
  ClientsIcon,
  ReportsIcon,
  WorkflowIcon,
  TeamIcon,
  MailIcon,
  ScanIcon,
  CatalogIcon,
  LogoutIcon,
  MenuIcon,
  CloseIcon,
} from "./icons";

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || "SARN Technologies Pvt Ltd";
const PLATFORM_URL = import.meta.env.VITE_PLATFORM_URL || "https://www.sarntech.in/";
const PLATFORM_LOGO_URL = import.meta.env.VITE_PLATFORM_LOGO_URL || null;

function SidebarLink({ to, icon, label, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
    >
      {icon}
      {label}
    </NavLink>
  );
}

export function DashboardLayout() {
  const { signOut } = useAuth();
  const { profile } = useUserProfile();
  const isAdmin = profile.role === "COMPANY_ADMIN";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <div className="app-shell">
      <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={closeSidebar} />

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-brand">
          {profile.logoUrl && <img src={profile.logoUrl} alt={`${profile.orgName} logo`} />}
          <div className="sidebar-brand-text">
            <strong>{profile.orgName}</strong>
            <span>{isAdmin ? "Admin" : "User"}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <SidebarLink to="/dashboard" icon={<DashboardIcon />} label="Dashboard" onNavigate={closeSidebar} />
          <SidebarLink to="/clients" icon={<ClientsIcon />} label="Clients" onNavigate={closeSidebar} />
          <SidebarLink to="/extractor" icon={<ScanIcon />} label="Extractor" onNavigate={closeSidebar} />
          {isAdmin && (
            <SidebarLink to="/reports" icon={<ReportsIcon />} label="Reports & Analytics" onNavigate={closeSidebar} />
          )}
          {isAdmin && (
            <SidebarLink
              to="/settings/workflows"
              icon={<WorkflowIcon />}
              label="Workflows"
              onNavigate={closeSidebar}
            />
          )}
          {isAdmin && <SidebarLink to="/settings/team" icon={<TeamIcon />} label="Team" onNavigate={closeSidebar} />}
          {isAdmin && (
            <SidebarLink
              to="/settings/email-schedule"
              icon={<MailIcon />}
              label="Email schedule"
              onNavigate={closeSidebar}
            />
          )}
          {isAdmin && (
            <SidebarLink
              to="/settings/extractor"
              icon={<CatalogIcon />}
              label="Manage templates"
              onNavigate={closeSidebar}
            />
          )}
        </nav>

        <div className="sidebar-footer">
          {PLATFORM_LOGO_URL && <img src={PLATFORM_LOGO_URL} alt={PLATFORM_NAME} />}
          Powered by{" "}
          <a href={PLATFORM_URL} target="_blank" rel="noreferrer" className="sidebar-footer-link">
            {PLATFORM_NAME}
          </a>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle menu">
            {sidebarOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
          <span />
          <div className="topbar-user">
            <Link to="/profile" className="topbar-account-link" title="My profile & settings">
              <AccountIcon size={24} />
              <span>
                {profile.name} ({profile.userId})
              </span>
            </Link>
            <button
              className="secondary signout-btn"
              onClick={signOut}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <LogoutIcon size={15} />
              Sign out
            </button>
          </div>
        </header>

        <ComplianceBanner />

        <main className="page-content" key={location.pathname}>
          <div className="page-fade">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
