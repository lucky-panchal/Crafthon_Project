/**
 * src/pages/Dashboard.jsx
 *
 * Production-ready dashboard.
 *
 * Performance
 * ───────────
 *   - Telemetry history throttled to 1 render/s via useRef timestamp guard
 *   - useMemo on all derived values (mode visuals, stat cards, mini-stats)
 *   - useCallback on all event handlers
 *   - Skeleton map driven by a config array — no duplicated JSX
 *
 * UX
 * ──
 *   - Per-panel skeleton loaders while WS is connecting
 *   - Full-page error fallback when WS fails after max retries
 *   - Tooltips on graph header and alert panel header
 *   - Smooth fade-in-up entrance on every panel (CSS, no lib)
 *   - Mode overlay (jamming/spoofing) behind all content
 *
 * Layout
 * ──────
 *   Mobile  : single column stack
 *   Tablet  : 2-col (6/6)
 *   Desktop : 8/4 left/right split + 12-col bottom row
 */

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { useWebSocket }       from "../hooks/useWebSocket";
import { useDetectionSocket } from "../hooks/useDetectionSocket";
import { DetectionProvider }  from "../context/DetectionContext";
import useSimulationStore     from "../store/useSimulationStore";
import useConnectionStore     from "../store/useConnectionStore";
import { ToastProvider }      from "../components/Toast";

import AlertPanel           from "../components/AlertPanel";
import ControlPanel         from "../components/ControlPanel";
import RiskScoreCard        from "../components/RiskScoreCard";
import LogsPanel            from "../components/LogsPanel";
import LogPanel             from "../components/LogPanel";
import ConfidenceMeter      from "../components/ConfidenceMeter";
import DetectionBanner      from "../components/DetectionBanner";
import StatusBadge          from "../components/StatusBadge";
import LiveGraph            from "../components/LiveGraph";
import SystemStatus         from "../components/SystemStatus";
import SignalIntegrityPanel from "../components/SignalIntegrityPanel";
import SignalGraph          from "../components/SignalGraph";

// ── Throttle constant ─────────────────────────────────────────────────────────
const RENDER_THROTTLE_MS = 1_000;

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className = "", rows = 3 }) {
  return (
    <div className={`rounded-2xl border border-[#1E2A3A] bg-[#121826] p-5 flex flex-col gap-3 ${className}`}>
      <div className="h-3 w-2/5 bg-[#1E2A3A] rounded shimmer" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-[#1E2A3A]/60 shimmer"
          style={{ height: i === 0 ? "120px" : "32px", opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}

// ── Tooltip wrapper ───────────────────────────────────────────────────────────

function Tip({ text, children }) {
  return (
    <div className="has-tooltip">
      <span className="tooltip-text">{text}</span>
      {children}
    </div>
  );
}

// ── WS Error fallback ─────────────────────────────────────────────────────────

function WsErrorFallback({ onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4 fade-in">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-red-400" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-white font-bold text-lg">Backend Unreachable</h2>
        <p className="text-gray-500 text-sm max-w-xs">
          WebSocket connection failed after maximum retries.<br />
          Ensure the backend is running on <span className="text-gray-400 font-mono">localhost:8000</span>.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-[0_0_16px_#3b82f640]"
      >
        Retry Connection
      </button>
    </div>
  );
}

// ── Mini stat card ────────────────────────────────────────────────────────────

function MiniStat({ label, value, unit, color }) {
  return (
    <div className="rounded-2xl border border-[#1E2A3A] bg-[#121826] px-5 py-4 flex flex-col gap-1 panel-enter">
      <span className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</span>
      <span
        className="text-2xl font-bold tabular-nums transition-all duration-300"
        style={{ color }}
      >
        {value}
      </span>
      <span className="text-[10px] text-gray-600">{unit}</span>
    </div>
  );
}

// ── Mode visuals hook ─────────────────────────────────────────────────────────

function useModeVisuals(mode) {
  return useMemo(() => {
    switch (mode) {
      case "JAMMING":  return { overlayClass: "overlay-jamming",  chartClass: "chart-jamming",  snrColor: "#ef4444", badgeStatus: "jamming",  badgeLabel: "JAMMING"  };
      case "SPOOFING": return { overlayClass: "overlay-spoofing", chartClass: "chart-spoofing", snrColor: "#f59e0b", badgeStatus: "spoofing", badgeLabel: "SPOOFING" };
      default:         return { overlayClass: "",                 chartClass: "chart-normal",   snrColor: "#10b981", badgeStatus: "normal",   badgeLabel: "Normal"   };
    }
  }, [mode]);
}

// ── Throttled history hook ────────────────────────────────────────────────────
// Prevents chart from re-rendering on every WS frame (fires ~1/s from backend).
// If the backend ever fires faster, this caps UI updates to RENDER_THROTTLE_MS.

function useThrottledHistory(rawHistory) {
  const [history, setHistory] = useState(rawHistory);
  const lastRender = useRef(0);
  const pending    = useRef(null);

  useEffect(() => {
    const now  = Date.now();
    const wait = RENDER_THROTTLE_MS - (now - lastRender.current);

    if (wait <= 0) {
      lastRender.current = now;
      setHistory(rawHistory);
      return;
    }

    clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      lastRender.current = Date.now();
      setHistory(rawHistory);
    }, wait);

    return () => clearTimeout(pending.current);
  }, [rawHistory]);

  return history;
}

// ── Skeleton layout config ────────────────────────────────────────────────────

const SKELETONS = [
  { key: "graph",   cls: "col-span-12 lg:col-span-8",  rows: 4, h: "h-72" },
  { key: "ctrl",    cls: "col-span-12 sm:col-span-6 lg:col-span-4", rows: 3, h: "h-72" },
  { key: "alerts",  cls: "col-span-12 sm:col-span-6 lg:col-span-4", rows: 3, h: "h-64" },
  { key: "status",  cls: "col-span-12 sm:col-span-6 lg:col-span-4", rows: 3, h: "h-64" },
  { key: "risk",    cls: "col-span-12 sm:col-span-6 lg:col-span-4", rows: 2, h: "h-64" },
];

// ── Inner dashboard ───────────────────────────────────────────────────────────

function DashboardInner() {
  const { history: rawHistory, latest, status, connStatus, lastUpdated } = useWebSocket();
  useDetectionSocket();

  // Throttle chart re-renders
  const history = useThrottledHistory(rawHistory);

  const mode = useSimulationStore((s) => s.mode);
  const wsStatus = useConnectionStore((s) => s.status);

  const { overlayClass, chartClass, snrColor, badgeStatus, badgeLabel } = useModeVisuals(mode);

  // Loading: WS connecting and no data yet
  const isLoading = rawHistory.length === 0 && connStatus === "connecting";

  // Error: WS failed (telemetry socket) or detection socket errored out
  const isError = connStatus === "error" || (connStatus === "disconnected" && rawHistory.length === 0);

  // Retry — reload the page (simplest safe retry for WS)
  const handleRetry = useCallback(() => window.location.reload(), []);

  // Mini stat cards — memoised, only recompute when latest or snrColor changes
  const miniStats = useMemo(() => [
    { label: "Packet Rate", value: latest?.packetRate ?? "--", unit: "pps", color: "#3b82f6" },
    { label: "SNR",         value: latest?.snr        ?? "--", unit: "dB",  color: snrColor  },
  ], [latest?.packetRate, latest?.snr, snrColor]);

  return (
    <div className="relative min-h-screen bg-[#0B0F1A] text-white">

      {/* Mode overlay — pointer-events:none, sits behind everything */}
      {overlayClass && (
        <div className={`fixed inset-0 z-0 pointer-events-none ${overlayClass}`} aria-hidden="true" />
      )}

      {/* ── Header ── */}
      <header className="relative z-20 border-b border-[#1E2A3A] bg-[#0D1220]/90 backdrop-blur-md sticky top-0">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">

          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-[0_0_12px_#3b82f6] shrink-0">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-bold tracking-tight text-white leading-tight">DefComm Shield</h1>
              <p className="text-[10px] text-gray-500 leading-none">Real-Time Communication Monitor</p>
            </div>
          </div>

          {/* Right — WS status + mode badge */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* WS connection pill */}
            <span className={`hidden md:flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full border ${
              wsStatus === "connected"
                ? "text-green-400 bg-green-500/10 border-green-500/20"
                : wsStatus === "connecting"
                ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                : "text-red-400 bg-red-500/10 border-red-500/20"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                wsStatus === "connected" ? "bg-green-400 animate-pulse" :
                wsStatus === "connecting" ? "bg-yellow-400 animate-ping" : "bg-red-500"
              }`} />
              {wsStatus === "connected" ? "Live" : wsStatus === "connecting" ? "Connecting…" : "Disconnected"}
            </span>
            <span className="text-[10px] text-gray-500 hidden lg:block tabular-nums">
              {lastUpdated !== "--" ? `Updated ${lastUpdated}` : ""}
            </span>
            <StatusBadge status={badgeStatus} label={badgeLabel} />
          </div>
        </div>
        <DetectionBanner />
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 p-4 flex flex-col gap-4">

        {/* Error state */}
        {isError && !isLoading && (
          <WsErrorFallback onRetry={handleRetry} />
        )}

        {/* Skeleton state */}
        {isLoading && !isError && (
          <div className="grid grid-cols-12 gap-4">
            {SKELETONS.map(({ key, cls, rows, h }) => (
              <div key={key} className={cls}>
                <Skeleton className={h} rows={rows} />
              </div>
            ))}
          </div>
        )}

        {/* Live content — fade in once data arrives */}
        {!isLoading && !isError && (
          <div className="grid grid-cols-12 gap-4">

            {/* ── LEFT col: 8 ── */}
            <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">

              {/* Live Graph with tooltip */}
              <Tip text="Live telemetry — Packet Rate &amp; SNR from /ws/telemetry">
                <div className="panel-enter">
                  <LiveGraph
                    history={history}
                    latest={latest}
                    snrColor={snrColor}
                    chartClass={chartClass}
                  />
                </div>
              </Tip>

              {/* Alert Panel with tooltip */}
              <Tip text="Detected anomalies — injected by rule engine &amp; ML model">
                <div className="flex-1 min-h-0 panel-enter" style={{ animationDelay: "60ms" }}>
                  <AlertPanel />
                </div>
              </Tip>
            </div>

            {/* ── RIGHT col: 4 ── */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
              <div className="panel-enter" style={{ animationDelay: "40ms" }}>
                <ControlPanel />
              </div>
              <div className="panel-enter" style={{ animationDelay: "80ms" }}>
                <SystemStatus />
              </div>
            </div>

            {/* ── Bottom row ── */}
            <div className="col-span-12 grid grid-cols-12 gap-4">

              <div className="col-span-12 md:col-span-5 panel-enter" style={{ animationDelay: "100ms" }}>
                <RiskScoreCard />
              </div>

              <div className="col-span-12 md:col-span-4 panel-enter" style={{ animationDelay: "120ms" }}>
                <ConfidenceMeter />
              </div>

              <div className="col-span-12 md:col-span-3 panel-enter" style={{ animationDelay: "130ms" }}>
                <SignalIntegrityPanel />
              </div>
            </div>

            {/* Signal Graph — full width */}
            <div className="col-span-12 panel-enter" style={{ animationDelay: "145ms" }}>
              <SignalGraph />
            </div>

            {/* Logs — full width */}
            <div className="col-span-12 panel-enter" style={{ animationDelay: "140ms" }}>
              <LogsPanel />
            </div>

            {/* Audit Trail — full width */}
            <div className="col-span-12 panel-enter" style={{ animationDelay: "155ms" }}>
              <LogPanel />
            </div>

          </div>
        )}

        <p className="text-center text-[10px] text-gray-700 pb-2 mt-2">
          DefComm Shield · Dual WebSocket · Rule Engine + Isolation Forest · localhost:8000
        </p>
      </main>
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  return (
    <DetectionProvider>
      <ToastProvider>
        <DashboardInner />
      </ToastProvider>
    </DetectionProvider>
  );
}
