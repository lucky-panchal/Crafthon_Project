/**
 * src/components/SystemStatus.jsx
 *
 * Self-contained system status card.
 * Reads everything from Zustand stores + DetectionContext — zero props needed.
 *
 * Rows
 * ────
 *   Connection   — WS dot + label (green/yellow/red/gray)
 *   Mode         — NORMAL / JAMMING / SPOOFING with color icon
 *   Risk Level   — LOW / MEDIUM / HIGH with colored badge
 *   Risk Score   — numeric with mini trend arrow
 *   Last Updated — timestamp from telemetry stream
 *   Session      — total alert count
 */

import { useMemo } from "react";
import useSimulationStore  from "../store/useSimulationStore";
import useRiskStore        from "../store/useRiskStore";
import useConnectionStore  from "../store/useConnectionStore";
import useAlertStore       from "../store/useAlertStore";
import { useWebSocket }    from "../hooks/useWebSocket";

// ── Static config maps ────────────────────────────────────────────────────────

const CONN_CFG = {
  connected:    { dot: "bg-green-400 animate-pulse", text: "text-green-400",  label: "Connected",    icon: "●" },
  connecting:   { dot: "bg-yellow-400 animate-ping", text: "text-yellow-400", label: "Connecting…",  icon: "◌" },
  disconnected: { dot: "bg-gray-500",                text: "text-gray-400",   label: "Disconnected", icon: "○" },
  error:        { dot: "bg-red-500 animate-pulse",   text: "text-red-400",    label: "WS Error",     icon: "✕" },
};

const MODE_CFG = {
  NORMAL:   { color: "text-green-400",  bg: "bg-green-500/10  border-green-500/25",  icon: "✅", glow: "#22c55e" },
  JAMMING:  { color: "text-red-400",    bg: "bg-red-500/10    border-red-500/25",    icon: "📡", glow: "#ef4444" },
  SPOOFING: { color: "text-amber-400",  bg: "bg-amber-500/10  border-amber-500/25",  icon: "🎭", glow: "#f59e0b" },
};

const RISK_CFG = {
  LOW:    { color: "text-green-400",  bg: "bg-green-500/10  border-green-500/30",  bar: "#22c55e", label: "LOW"    },
  MEDIUM: { color: "text-amber-400",  bg: "bg-amber-500/10  border-amber-500/30",  bar: "#f59e0b", label: "MEDIUM" },
  HIGH:   { color: "text-red-400",    bg: "bg-red-500/10    border-red-500/30",    bar: "#ef4444", label: "HIGH"   },
};

// ── Row component ─────────────────────────────────────────────────────────────

function Row({ icon, label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[#1E2A3A] last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-base leading-none shrink-0 w-5 text-center">{icon}</span>
        <span className="text-xs text-gray-500 uppercase tracking-widest shrink-0">{label}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SystemStatus() {
  // ── Zustand — one selector per slice ─────────────────────────────────────
  const mode        = useSimulationStore((s) => s.mode);
  const lastSynced  = useSimulationStore((s) => s.lastSynced);
  const connStatus  = useConnectionStore((s) => s.status);
  const totalAlerts = useAlertStore((s) => s.totalAlerts);

  const riskScore  = useRiskStore((s) => s.score);
  const riskLevel  = useRiskStore((s) => s.level);
  const riskColor  = useRiskStore((s) => s.color);
  const delta      = useRiskStore((s) => s.delta);
  const trend      = useRiskStore((s) => s.trend);

  // ── Telemetry — last updated time ─────────────────────────────────────────
  const { lastUpdated } = useWebSocket();

  // ── Memoised derived values ───────────────────────────────────────────────
  const connCfg = useMemo(() => CONN_CFG[connStatus] ?? CONN_CFG.disconnected, [connStatus]);
  const modeCfg = useMemo(() => MODE_CFG[mode]       ?? MODE_CFG.NORMAL,       [mode]);
  const riskCfg = useMemo(() => RISK_CFG[riskLevel]  ?? RISK_CFG.LOW,          [riskLevel]);

  const syncedLabel = useMemo(() =>
    lastSynced
      ? lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : null,
  [lastSynced]);

  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : null;
  const trendColor = trend === "up" ? "text-red-400" : "text-green-400";

  return (
    <div className="rounded-2xl border border-[#1E2A3A] bg-[#121826] shadow-xl shadow-black/40 p-5 flex flex-col gap-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-cyan-500 shadow-[0_0_8px_#06b6d4]" />
          <h2 className="text-white font-semibold text-base tracking-tight">System Status</h2>
        </div>
        {/* Live pulse when connected */}
        {connStatus === "connected" && (
          <span className="flex items-center gap-1.5 text-[10px] text-green-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      {/* ── Rows ── */}

      {/* Connection */}
      <Row icon="🔌" label="Connection">
        <span className={`flex items-center gap-1.5 text-xs font-semibold ${connCfg.text}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${connCfg.dot}`} />
          {connCfg.label}
        </span>
      </Row>

      {/* Mode */}
      <Row icon={modeCfg.icon} label="Mode">
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${modeCfg.bg} ${modeCfg.color}`}>
          {mode}
        </span>
      </Row>

      {/* Risk Level */}
      <Row icon="🛡️" label="Risk Level">
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${riskCfg.bg} ${riskCfg.color}`}>
          {riskCfg.label}
        </span>
      </Row>

      {/* Risk Score */}
      <Row icon="📊" label="Risk Score">
        <div className="flex items-center gap-1.5">
          <span
            className="text-sm font-extrabold tabular-nums transition-colors duration-300"
            style={{ color: riskColor }}
          >
            {riskScore}
            <span className="text-[10px] text-gray-600 font-normal"> / 100</span>
          </span>
          {trendArrow && (
            <span className={`text-xs font-bold ${trendColor}`}>
              {trendArrow}{Math.abs(delta)}
            </span>
          )}
        </div>
      </Row>

      {/* Last Updated */}
      <Row icon="🕐" label="Updated">
        <span className="text-xs text-gray-400 tabular-nums">{lastUpdated}</span>
      </Row>

      {/* Last Synced */}
      <Row icon="🔄" label="Synced">
        <span className="text-xs text-gray-400 tabular-nums">
          {syncedLabel ?? <span className="text-gray-600">—</span>}
        </span>
      </Row>

      {/* Session Alerts */}
      <Row icon="⚠️" label="Alerts">
        <span className={`text-xs font-bold tabular-nums ${totalAlerts > 0 ? "text-red-400" : "text-gray-500"}`}>
          {totalAlerts}
          <span className="text-gray-600 font-normal"> this session</span>
        </span>
      </Row>

      {/* ── Risk bar ── */}
      <div className="mt-3 pt-3 border-t border-[#1E2A3A] flex flex-col gap-1.5">
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>Risk</span>
          <span className="tabular-nums" style={{ color: riskColor }}>{riskScore} / 100</span>
        </div>
        <div className="w-full h-1.5 bg-[#0B0F1A] rounded-full overflow-hidden border border-[#1E2A3A]">
          <div
            className="h-full rounded-full confidence-bar"
            style={{
              width:     `${riskScore}%`,
              background: riskColor,
              boxShadow:  riskScore > 0 ? `0 0 6px ${riskColor}60` : "none",
            }}
          />
        </div>
      </div>

    </div>
  );
}
