/**
 * src/components/LogsPanel.jsx
 *
 * Scrollable log of the last 20 detection frames + mode-change events.
 *
 * Performance
 * ───────────
 *   Debounced at 300 ms — DOM only re-renders once per 300 ms regardless
 *   of how fast the WebSocket fires.
 *   useMemo — column class strings computed once per entry, not per render.
 *
 * Columns: Time · Type / Mode · Conf · Source · Risk
 * Mode-change rows are visually distinct (purple tint, "user" source).
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useDetection } from "../context/DetectionContext";

const RISK_COLOR = {
  HIGH:   "text-red-400",
  MEDIUM: "text-amber-400",
  LOW:    "text-green-400",
};

const SOURCE_COLOR = {
  "rule":    "text-purple-400",
  "ml":      "text-blue-400",
  "rule+ml": "text-cyan-400",
  "user":    "text-purple-300",
  "none":    "text-gray-600",
};

const TYPE_ICON = {
  JAMMING:         "📡",
  SPOOFING:        "🎭",
  TRAFFIC_SPIKE:   "📈",
  TRAFFIC_ANOMALY: "⚠️",
  NONE:            "·",
};

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return "--"; }
}

// ── Single log row ────────────────────────────────────────────────────────────

function LogRow({ entry, isNewest }) {
  const isModeChange = entry.status === "MODE_CHANGE";

  // useMemo — class strings stable across re-renders for same entry
  const typeClass = useMemo(() =>
    isModeChange
      ? "text-purple-300 font-semibold"
      : entry.status === "ALERT"
        ? (RISK_COLOR[entry.risk] ?? "text-gray-300")
        : "text-gray-500",
  [isModeChange, entry.status, entry.risk]);

  const confClass = useMemo(() =>
    entry.confidence > 0 ? (RISK_COLOR[entry.risk] ?? "text-gray-400") : "text-gray-600",
  [entry.confidence, entry.risk]);

  const sourceClass = useMemo(() =>
    SOURCE_COLOR[entry.source] ?? "text-gray-600",
  [entry.source]);

  const riskClass = useMemo(() =>
    RISK_COLOR[entry.risk] ?? "text-gray-500",
  [entry.risk]);

  // Type label
  const typeLabel = isModeChange
    ? `→ ${entry.mode}`
    : (entry.type?.replace(/_/g, " ") ?? "—");

  const typeIcon = isModeChange ? "🔀" : (TYPE_ICON[entry.type] ?? "·");

  return (
    <div
      className={[
        "grid gap-x-3 px-3 py-2",
        "border-b border-[#1a2535]/60 text-[11px] tabular-nums items-center",
        isNewest ? "slide-in-left" : "",
        isModeChange ? "log-row-mode" : entry.status === "ALERT" ? "bg-white/[0.02]" : "",
      ].join(" ")}
      style={{ gridTemplateColumns: "80px 1fr 48px 60px 52px" }}
    >
      <span className="text-gray-500 truncate">{formatTime(entry.timestamp)}</span>

      <span className={`flex items-center gap-1 font-medium truncate ${typeClass}`}>
        <span>{typeIcon}</span>
        <span className="truncate">{typeLabel}</span>
      </span>

      <span className={`text-right ${confClass}`}>
        {entry.confidence > 0 ? `${entry.confidence}%` : "—"}
      </span>

      <span className={`${sourceClass} truncate`}>
        {entry.source === "rule+ml" ? "R+ML"
          : entry.source === "rule"  ? "Rule"
          : entry.source === "ml"    ? "ML"
          : entry.source === "user"  ? "User"
          : "—"}
      </span>

      <span className={`${riskClass} font-semibold`}>
        {isModeChange ? entry.mode?.slice(0, 4) : entry.risk}
      </span>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function LogsPanel() {
  const { logs } = useDetection();

  // Debounce — max one DOM update per 300 ms
  const [displayed, setDisplayed] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      setDisplayed(logs);
      timerRef.current = null;
    }, 300);
    return () => {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [logs]);

  return (
    <div className="rounded-2xl border border-[#1E2A3A] bg-[#121826] shadow-xl shadow-black/40 p-5 flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1]" />
          <h2 className="text-white font-semibold text-base tracking-tight">Detection Log</h2>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-600">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-400/60" />mode changes
          </span>
          <span>{displayed.length} / 20</span>
        </div>
      </div>

      {/* Table */}
      <div
        className="log-scroll overflow-y-auto max-h-64"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#1a2535 transparent" }}
      >
        {/* Min-width wrapper prevents grid collapse on small screens */}
        <div className="min-w-[480px]">
          {/* Column headers */}
          <div className="grid gap-x-3 px-3 pb-2 border-b border-[#1a2535] sticky top-0 bg-[#111827] z-10"
            style={{ gridTemplateColumns: "80px 1fr 48px 60px 52px" }}>
            {["Time", "Type / Mode", "Conf", "Source", "Risk"].map((h) => (
              <span key={h} className="text-[9px] text-slate-600 uppercase tracking-widest font-semibold">{h}</span>
            ))}
          </div>

          {displayed.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-slate-600 text-xs">
              Waiting for data…
            </div>
          ) : (
            displayed.map((entry, idx) => (
              <LogRow key={entry._id} entry={entry} isNewest={idx === 0} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
