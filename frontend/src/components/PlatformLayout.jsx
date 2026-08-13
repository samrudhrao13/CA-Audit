import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BuildingIcon, CatalogIcon, LogoutIcon, MenuIcon, CloseIcon } from "./icons";

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || "SARN Technologies Pvt Ltd";
const PLATFORM_URL = import.meta.env.VITE_PLATFORM_URL || "https://www.sarntech.in/";

function SidebarLink({ to, icon, label, onNavigate }) {
  return (
    <NavLink to={to} end onClick={onNavigate} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
      {icon}
      {label}
    </NavLink>
  );
}

export function PlatformLayout() {
  const { signOut } = useAuth();
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
          <div className="sidebar-brand-text">
            <strong>Platform admin</strong>
            <span>Operator console</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <SidebarLink to="/platform" icon={<BuildingIcon />} label="Companies" onNavigate={closeSidebar} />
          <SidebarLink
            to="/platform/workflows"
            icon={<CatalogIcon />}
            label="Workflow catalog"
            onNavigate={closeSidebar}
          />
        </nav>

        <div className="sidebar-footer">
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

        <main className="page-content" key={location.pathname}>
          <div className="page-fade">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
