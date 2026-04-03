/**
 * AlertPanel — 3 live threat rows, always visible, update with simulation mode.
 * NORMAL → all clear, JAMMING → jamming row active, SPOOFING → spoofing row active.
 */

import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import useSimulationStore from "../store/useSimulationStore";
import useConnectionStore from "../store/useConnectionStore";
import useAlertStore      from "../store/useAlertStore";
import useSignalStore     from "../store/useSignalStore";

// ── Row config ────────────────────────────────────────────────────────────────

const ROWS = [
  {
    key:       "NORMAL",
    label:     "Normal Traffic",
    icon:      "🛡️",
    activeColor:  "#22c55e",
    activeBg:     "bg-green-500/10",
    activeBorder: "border-green-500/40",
    activeText:   "text-green-400",
    activeDot:    "bg-green-400 animate-pulse",
    idleBg:       "bg-[#0d1220]/60",
    idleBorder:   "border-[#1a2535]",
    idleText:     "text-slate-500",
    idleDot:      "bg-slate-700",
    risk:      "LOW",
    reason:    "All systems nominal — no anomalies detected.",
    confidence: 100,
  },
  {
    key:       "JAMMING",
    label:     "RF Jamming",
    icon:      "📡",
    activeColor:  "#ef4444",
    activeBg:     "bg-red-500/10",
    activeBorder: "border-red-500/40",
    activeText:   "text-red-400",
    activeDot:    "bg-red-400 animate-pulse",
    idleBg:       "bg-[#0d1220]/60",
    idleBorder:   "border-[#1a2535]",
    idleText:     "text-slate-500",
    idleDot:      "bg-slate-700",
    risk:      "HIGH",
    reason:    "SNR critically suppressed — packet loss severe.",
    confidence: 92,
  },
  {
    key:       "SPOOFING",
    label:     "Source Spoofing",
    icon:      "🎭",
    activeColor:  "#f59e0b",
    activeBg:     "bg-amber-500/10",
    activeBorder: "border-amber-500/40",
    activeText:   "text-amber-400",
    activeDot:    "bg-amber-400 animate-pulse",
    idleBg:       "bg-[#0d1220]/60",
    idleBorder:   "border-[#1a2535]",
    idleText:     "text-slate-500",
    idleDot:      "bg-slate-700",
    risk:      "HIGH",
    reason:    "Source ID '999' is a known spoofed identifier.",
    confidence: 89,
  },
];

const CONN_DOT = {
  connected:    "bg-green-400 animate-pulse",
  connecting:   "bg-yellow-400 animate-ping",
  disconnected: "bg-gray-500",
  error:        "bg-red-500 animate-pulse",
};

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfBar({ value, color, active }) {
  return (
    <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width:      active ? `${value}%` : "0%",
          background: color,
          boxShadow:  active ? `0 0 6px ${color}80` : "none",
        }}
      />
    </div>
  );
}

// ── Single threat row ─────────────────────────────────────────────────────────

function ThreatRow({ row, isActive, latestSnr, latestPacketRate }) {
  const bg     = isActive ? row.activeBg     : row.idleBg;
  const border = isActive ? row.activeBorder : row.idleBorder;
  const text   = isActive ? row.activeText   : row.idleText;
  const dot    = isActive ? row.activeDot    : row.idleDot;

  // Live metric shown when active
  const liveMetric = useMemo(() => {
    if (!isActive) return null;
    if (row.key === "JAMMING")  return latestSnr     != null ? `SNR ${latestSnr} dB`       : null;
    if (row.key === "SPOOFING") return latestPacketRate != null ? `${latestPacketRate} pps` : null;
    if (row.key === "NORMAL")   return latestPacketRate != null ? `${latestPacketRate} pps` : null;
    return null;
  }, [isActive, row.key, latestSnr, latestPacketRate]);

  return (
    <div
      className={`
        relative flex flex-col gap-2 rounded-xl border px-4 py-3
        transition-all duration-500
        ${bg} ${border}
        ${isActive ? "shadow-lg" : "opacity-50"}
      `}
    >
      {/* Row header */}
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className="text-base leading-none">{row.icon}</span>
        <span className={`text-xs font-bold tracking-wide uppercase flex-1 ${text}`}>
          {row.label}
        </span>

        {/* Risk badge */}
        {isActive && (
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
              row.risk === "HIGH"
                ? "bg-red-500/20 text-red-300 border-red-500/40"
                : "bg-green-500/20 text-green-300 border-green-500/40"
            }`}
          >
            {row.risk}
          </span>
        )}

        {/* Live metric */}
        {liveMetric && (
          <span
            className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-md border"
            style={{
              color:            row.activeColor,
              borderColor:      `${row.activeColor}40`,
              backgroundColor:  `${row.activeColor}10`,
            }}
          >
            {liveMetric}
          </span>
        )}
      </div>

      {/* Reason */}
      <p className={`text-[10px] leading-relaxed pl-[18px] ${isActive ? "text-slate-400" : "text-slate-600"}`}>
        {isActive ? row.reason : "Inactive — not currently detected"}
      </p>

      {/* Confidence bar */}
      <div className="pl-[18px] flex items-center gap-2">
        <ConfBar value={row.confidence} color={row.activeColor} active={isActive} />
        {isActive && (
          <span className="text-[9px] tabular-nums shrink-0" style={{ color: row.activeColor }}>
            {row.confidence}%
          </span>
        )}
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function AlertPanel() {
  const mode       = useSimulationStore((s) => s.mode);
  const connStatus = useConnectionStore((s) => s.status);
  const { totalAlerts, clearAlerts } = useAlertStore(
    (s) => ({ totalAlerts: s.totalAlerts, clearAlerts: s.clearAlerts }),
    shallow,
  );

  const latestSnr        = useSignalStore((s) => s.snr);
  const latestPacketRate = useSignalStore((s) => s.packetRate);

  // Active row = current simulation mode (NORMAL / JAMMING / SPOOFING)
  const activeKey = mode ?? "NORMAL";

  return (
    <div className="glass rounded-2xl border border-[#1E2A3A] shadow-xl shadow-black/40 p-5 flex flex-col gap-3 h-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444] shrink-0" />
          <h2 className="text-white font-semibold text-base tracking-tight">Threat Alerts</h2>
          {totalAlerts > 0 && (
            <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full tabular-nums">
              {totalAlerts}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${CONN_DOT[connStatus] ?? "bg-gray-500"}`}
            title={`WebSocket: ${connStatus}`}
          />
          {totalAlerts > 0 && (
            <button
              onClick={clearAlerts}
              className="text-[10px] text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-2 py-1 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* 3 live rows */}
      <div className="flex flex-col gap-2.5 flex-1">
        {ROWS.map((row) => (
          <ThreatRow
            key={row.key}
            row={row}
            isActive={activeKey === row.key}
            latestSnr={latestSnr}
            latestPacketRate={latestPacketRate}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[#1E2A3A] shrink-0">
        <div className="flex items-center gap-3">
          {[
            { label: "NORMAL",   color: "#22c55e" },
            { label: "JAMMING",  color: "#ef4444" },
            { label: "SPOOFING", color: "#f59e0b" },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              <span style={{ color }}>{label}</span>
            </div>
          ))}
        </div>
        <span className="text-[10px] text-gray-600 tabular-nums">
          {connStatus === "connected" ? "● Live" : connStatus}
        </span>
      </div>
    </div>
  );
}
