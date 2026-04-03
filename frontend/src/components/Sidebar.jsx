import { useState } from "react";
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

export default function Sidebar({ activePage, onNavigate, onAuthOpen }) {
  const [collapsed, setCollapsed] = useState(false);
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside
      className="fixed left-0 top-0 h-full z-30 flex flex-col transition-all duration-300"
      style={{
        width: collapsed ? "60px" : "200px",
        background: "rgba(10, 18, 12, 0.82)",
        backdropFilter: "blur(12px)",
        borderRight: "1px solid rgba(74, 94, 42, 0.35)",
        boxShadow: "4px 0 24px rgba(0,0,0,0.4)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-4 border-b border-[#2a3a1a]/50">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 shadow-[0_0_12px_#3b82f660]">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white text-xs font-bold leading-tight truncate">RAKSHA</p>
            <p className="text-[9px] text-[#556b2f] leading-none">SHIELD v1.0</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="ml-auto text-gray-500 hover:text-gray-300 transition-colors shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />}
          </svg>
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 px-2 py-3 flex-1">
        {NAV_ITEMS.map(({ key, icon, label }) => {
          const isActive = activePage === key;
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              title={collapsed ? label : undefined}
              className={[
                "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 w-full",
                isActive
                  ? "bg-[#3a4f1a]/60 text-[#a3c45a] border border-[#556b2f]/50 shadow-[0_0_8px_#556b2f30]"
                  : "text-gray-400 hover:bg-[#1e2d0e]/50 hover:text-gray-200 border border-transparent",
              ].join(" ")}
            >
              <span className="text-base shrink-0">{icon}</span>
              {!collapsed && <span className="text-xs font-medium truncate">{label}</span>}
              {!collapsed && isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#a3c45a] shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 border-t border-[#2a3a1a]/50" />

      {/* Auth buttons */}
      <div className="flex flex-col gap-2 px-2 py-3">
        {user ? (
          <>
            {!collapsed && (
              <div className="px-2 py-1.5 rounded-lg bg-[#1e2d0e]/40 border border-[#2a3a1a]/40">
                <p className="text-[10px] text-[#a3c45a] font-semibold truncate">{user.name}</p>
                <p className="text-[9px] text-gray-600 truncate">{user.email}</p>
              </div>
            )}
            <button
              onClick={logout}
              title={collapsed ? "Logout" : undefined}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/15 transition-all text-xs font-semibold w-full"
            >
              <span className="text-base shrink-0">🚪</span>
              {!collapsed && <span>Logout</span>}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onAuthOpen("login")}
              title={collapsed ? "Login" : undefined}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-[#3b82f6]/30 bg-[#3b82f6]/10 text-blue-400 hover:bg-[#3b82f6]/20 transition-all text-xs font-semibold w-full"
            >
              <span className="text-base shrink-0">🔐</span>
              {!collapsed && <span>Login</span>}
            </button>
            <button
              onClick={() => onAuthOpen("signup")}
              title={collapsed ? "Sign Up" : undefined}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/10 text-green-400 hover:bg-[#22c55e]/20 transition-all text-xs font-semibold w-full"
            >
              <span className="text-base shrink-0">✨</span>
              {!collapsed && <span>Sign Up</span>}
            </button>
          </>
        )}
      </div>

      {/* Tactical bottom tag */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <p className="text-[8px] text-[#3a4f1a] font-mono tracking-widest uppercase">
            ◈ RAKSHA OPS ◈
          </p>
        </div>
      )}
    </aside>
  );
}
