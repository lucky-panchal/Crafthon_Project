/**
 * src/components/AlertPanel.jsx
 *
 * Displays rolling alert history from DetectionContext.
 * Alerts are injected from two sources:
 *   1. Backend WebSocket frames (status === "ALERT")
 *   2. Synthetic alerts from ControlPanel mode changes (JAMMING / SPOOFING)
 *
 * Features
 * ────────
 *   - Latest alert on top, max 10
 *   - Auto-scroll to newest on each new alert
 *   - Confidence progress bar per card
 *   - RED cards for HIGH, AMBER for MEDIUM, GREEN for LOW
 *   - Newest card blinks once (CSS .alert-blink)
 *   - Short Web Audio beep on HIGH alerts
 */

import { useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useDetection } from "../context/DetectionContext";

// ── Web Audio beep ────────────────────────────────────────────────────────────

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { /* browser blocked */ }
  }
  return _audioCtx;
}

function playBeep(frequency = 520, durationMs = 140, volume = 0.18) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type            = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch { /* ignore */ }
}

// ── Risk config ───────────────────────────────────────────────────────────────

const RISK_CFG = {
  HIGH: {
    border: "border-red-500/50",
    bg:     "bg-red-500/10",
    icon:   "text-red-300",
    badge:  "bg-red-500/20 text-red-300 border-red-500/30",
    bar:    "#ef4444",
    label:  "HIGH",
  },
  MEDIUM: {
    border: "border-amber-500/50",
    bg:     "bg-amber-500/10",
    icon:   "text-amber-300",
    badge:  "bg-amber-500/20 text-amber-300 border-amber-500/30",
    bar:    "#f59e0b",
    label:  "MEDIUM",
  },
  LOW: {
    border: "border-green-500/30",
    bg:     "bg-green-500/5",
    icon:   "text-green-400",
    badge:  "bg-green-500/20 text-green-300 border-green-500/30",
    bar:    "#22c55e",
    label:  "LOW",
  },
};

const TYPE_ICON = {
  JAMMING:          "📡",
  SPOOFING:         "🎭",
  TRAFFIC_SPIKE:    "📈",
  TRAFFIC_ANOMALY:  "⚠️",
  RISK_ESCALATION:  "🔺",
  NONE:             "✅",
};

function formatTime(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return "--"; }
}

// ── Alert card — memo so unchanged cards never re-render ─────────────────────

const AlertCard = memo(function AlertCard({ alert, isNewest }) {
  const cfg        = RISK_CFG[alert.risk] ?? RISK_CFG.LOW;
  const confidence = alert.confidence ?? 0;
  const typeLabel  =
    alert.type === "RISK_ESCALATION"
      ? "Risk Escalation Detected"
      : (alert.type?.replace(/_/g, " ") ?? "UNKNOWN");

  // Full ISO string shown on hover; short time shown inline
  const timeShort = formatTime(alert.timestamp);
  const timeFull  = alert.timestamp
    ? new Date(alert.timestamp).toLocaleString()
    : "--";

  return (
    <div
      className={[
        "flex flex-col gap-2 rounded-xl border px-4 py-3 shadow-lg",
        "transition-colors duration-300",
        cfg.border, cfg.bg,
        isNewest ? "alert-blink" : "",
      ].join(" ")}
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none shrink-0">{TYPE_ICON[alert.type] ?? "⚠️"}</span>
          <span className={`font-bold text-sm truncate ${cfg.icon}`}>
            {typeLabel}
          </span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 shrink-0">
          Conf: <span className="font-semibold tabular-nums" style={{ color: cfg.bar }}>{confidence}%</span>
        </span>
        <div className="flex-1 h-1.5 bg-[#0B0F1A] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full confidence-bar"
            style={{ width: `${confidence}%`, background: cfg.bar }}
          />
        </div>
      </div>

      {/* Reason */}
      {alert.reason && (
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{alert.reason}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-gray-600">
        <div className="flex items-center gap-3">
          {alert.telemetry && (
            <>
              <span>PR: <span className="text-gray-400">{alert.telemetry.packet_rate}</span></span>
              <span>SNR: <span className="text-gray-400">{alert.telemetry.snr} dB</span></span>
            </>
          )}
          {alert.source && alert.source !== "none" && (
            <span className="text-gray-700 capitalize">src: {alert.source}</span>
          )}
        </div>
        {/* Timestamp — short inline, full on hover */}
        <time
          dateTime={alert.timestamp}
          title={timeFull}
          className="tabular-nums shrink-0 cursor-default"
        >
          {timeShort}
        </time>
      </div>
    </div>
  );
});

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function AlertPanel() {
  const { alerts, totalAlerts, connStatus, clearAlerts } = useDetection();
  const scrollRef    = useRef(null);
  const prevCountRef = useRef(0);

  // Auto-scroll to top + beep on every new alert
  useEffect(() => {
    if (alerts.length > prevCountRef.current) {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      if (alerts[0]?.risk === "HIGH") playBeep();
    }
    prevCountRef.current = alerts.length;
  }, [alerts]);

  // Memoize rendered cards — only rebuilds when alerts array changes
  const alertCards = useMemo(() =>
    alerts.map((alert, idx) => (
      <AlertCard key={alert._id} alert={alert} isNewest={idx === 0} />
    ))
  , [alerts]);

  // Counts for header badges
  const highCount = useMemo(() =>
    alerts.filter((a) => a.risk === "HIGH").length
  , [alerts]);

  const connDot =
    connStatus === "connected"    ? "bg-green-400 animate-pulse" :
    connStatus === "connecting"   ? "bg-yellow-400 animate-ping" :
    connStatus === "disconnected" ? "bg-gray-500"                :
                                    "bg-red-500";

  return (
    <div className="rounded-2xl border border-[#1E2A3A] bg-[#121826] shadow-xl shadow-black/40 p-5 flex flex-col gap-4 h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
          <h2 className="text-white font-semibold text-base tracking-tight">Threat Alerts</h2>
          {/* Total session count */}
          {totalAlerts > 0 && (
            <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
              {totalAlerts}
            </span>
          )}
          {/* HIGH-only pulse badge */}
          {highCount > 0 && (
            <span className="text-[10px] font-bold bg-red-600/30 text-red-300 border border-red-500/50 px-2 py-0.5 rounded-full animate-pulse">
              {highCount} HIGH
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connDot}`} title={`WS: ${connStatus}`} />
          {alerts.length > 0 && (
            <button
              onClick={clearAlerts}
              className="text-[10px] text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-2 py-1 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Alert list ── */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0 pr-1 alert-scroll"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#1E2A3A transparent" }}
      >
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-600">
            <span className="text-4xl select-none">🛡️</span>
            <span className="text-sm font-medium text-gray-500">No threats detected</span>
            <span className="text-xs">
              {connStatus === "connected" ? "Monitoring active" : `Status: ${connStatus}`}
            </span>
          </div>
        ) : alertCards}
      </div>

      {/* ── Footer ── */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#1E2A3A] shrink-0">
        {[
          { label: "HIGH",   color: "#ef4444" },
          { label: "MEDIUM", color: "#f59e0b" },
          { label: "LOW",    color: "#22c55e" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span style={{ color }}>{label}</span>
          </div>
        ))}
        <span className="ml-auto text-[10px] text-gray-600 tabular-nums">{alerts.length} / 10</span>
      </div>
    </div>
  );
}
