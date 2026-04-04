import { useState, useEffect } from "react";
import useAuthStore from "../store/useAuthStore";

const NAV_ITEMS = [
  { key: "dashboard", icon: "⚡", label: "Dashboard" },
  { key: "jamming",   icon: "📡", label: "Jamming Info" },
  { key: "spoofing",  icon: "🎭", label: "Spoofing Info" },
  { key: "visuals",   icon: "📊", label: "Visuals" },
  { key: "history",   icon: "🕐", label: "History" },
  { key: "report",    icon: "📋", label: "Report" },
  { key: "rules",     icon: "🛡️", label: "Rules" },
];

export default function Sidebar({ activePage, onNavigate, onAuthOpen, mobileOpen, onMobileClose, onCollapsedChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    onCollapsedChange?.(next);
  };

  // Close mobile drawer on nav
  const handleNav = (key) => {
    onNavigate(key);
    onMobileClose?.();
  };

  // Collapse on resize to tablet+
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e) => { if (!e.matches) onMobileClose?.(); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [onMobileClose]);

  const isExpanded = !collapsed;

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="sidebar-overlay visible"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar-drawer fixed left-0 top-0 h-full z-30 flex flex-col transition-all duration-300 ${mobileOpen ? "open" : ""}`}
        style={{
          width: collapsed ? "60px" : "200px",
          background: "rgba(10, 18, 12, 0.95)",
          backdropFilter: "blur(12px)",
          borderRight: "1px solid rgba(74, 94, 42, 0.35)",
          boxShadow: "4px 0 24px rgba(0,0,0,0.4)",
        }}
        aria-label="Sidebar navigation"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 py-4 border-b border-[#2a3a1a]/50">
          {isExpanded && (
            <div className="min-w-0">
              <p className="text-white text-xl font-bold leading-tight tracking-widest" style={{ fontFamily: "'Raleway', sans-serif" }}>RakSha</p>
              <p className="text-[12px] text-[#a3c45a] leading-snug tracking-wide font-medium">Real-Time Threat Monitor</p>
            </div>
          )}
          {!isExpanded && (
            <p className="text-white text-base font-bold" style={{ fontFamily: "'Raleway', sans-serif" }}>R</p>
          )}
          <button
            onClick={toggleCollapsed}
            className="ml-auto text-gray-500 hover:text-gray-300 transition-colors shrink-0"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
              {collapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />}
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 px-2 py-3 flex-1" role="navigation">
          {NAV_ITEMS.map(({ key, icon, label }) => {
            const isActive = activePage === key;
            return (
              <button
                key={key}
                onClick={() => handleNav(key)}
                title={collapsed ? label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 w-full",
                  isActive
                    ? "bg-[#3a4f1a]/60 text-[#a3c45a] border border-[#556b2f]/50 shadow-[0_0_8px_#556b2f30]"
                    : "text-gray-400 hover:bg-[#1e2d0e]/50 hover:text-gray-200 border border-transparent",
                ].join(" ")}
              >
                <span className="text-base shrink-0">{icon}</span>
                {isExpanded && <span className="text-[13px] font-medium truncate">{label}</span>}
                {isExpanded && isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#a3c45a] shrink-0" />
                )}
              </button>
            );
          })}
        </nav>


      </aside>
    </>
  );
}
