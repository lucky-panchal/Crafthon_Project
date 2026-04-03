/**
 * src/components/AlertPanel.jsx
 *
 * Production-ready alert panel.
 *
 * Features
 * ────────
 *   - Title: "Threat Alerts"
 *   - Filter: ALL / HIGH toggle — memoised, no re-render on unrelated state
 *   - useMemo for filtered card list — only rebuilds when alerts or filter changes
 *   - Auto-scroll to top on new alert
 *   - Web Audio beep on HIGH (opt-in after first user gesture)
 *   - Confidence tooltip on the bar label
 *   - WS error / disconnected fallback banner
 *   - Clear Alerts button
 *   - Responsive: works at any width (flex-wrap headers, full-width cards)
 *   - Smooth animations via alert-slide-in + alert-high-pulse (CSS)
 */

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { shallow }        from "zustand/shallow";
import useAlertStore      from "../store/useAlertStore";
import useConnectionStore from "../store/useConnectionStore";
import AlertCard          from "./AlertCard";

// ── Web Audio beep ────────────────────────────────────────────────────────────

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { /* browser blocked */ }
  }
  return _audioCtx;
}

function playBeep() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type            = "sine";
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.14);
  } catch { /* ignore */ }
}

// ── Confidence tooltip ────────────────────────────────────────────────────────

function ConfidenceTip() {
  return (
    <span className="has-tooltip cursor-default">
      <span className="tooltip-text" style={{ whiteSpace: "normal", maxWidth: 200, textAlign: "center" }}>
        Confidence = how certain the detection engine is this is a real threat (0–100%)
      </span>
      <span className="text-[10px] text-gray-600 border border-gray-700 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center leading-none select-none">
        ?
      </span>
    </span>
  );
}

// ── WS status config ──────────────────────────────────────────────────────────

const CONN_DOT = {
  connected:    "bg-green-400 animate-pulse",
  connecting:   "bg-yellow-400 animate-ping",
  disconnected: "bg-gray-500",
  error:        "bg-red-500 animate-pulse",
};

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function AlertPanel() {

  // ── Store selectors — shallow, one subscription ──────────────────────────
  const { alerts, totalAlerts, clearAlerts } = useAlertStore(
    (s) => ({ alerts: s.alerts, totalAlerts: s.totalAlerts, clearAlerts: s.clearAlerts }),
    shallow,
  );
  const connStatus = useConnectionStore((s) => s.status);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [showHighOnly, setShowHighOnly] = useState(false);
  const toggleFilter = useCallback(() => setShowHighOnly((v) => !v), []);

  // ── Derived counts — memoised ─────────────────────────────────────────────
  const highCount = useMemo(
    () => alerts.filter((a) => a.risk === "HIGH").length,
    [alerts],
  );

  // ── Filtered + memoised card list ─────────────────────────────────────────
  // Only rebuilds when alerts array OR showHighOnly changes.
  const visibleAlerts = useMemo(
    () => showHighOnly ? alerts.filter((a) => a.risk === "HIGH") : alerts,
    [alerts, showHighOnly],
  );

  const alertCards = useMemo(() =>
    visibleAlerts.map((alert, idx) => (
      <AlertCard
        key={alert.id}
        type={alert.type}
        risk={alert.risk}
        reason={alert.reason}
        confidence={alert.confidence}
        timestamp={alert.timestamp}
        source={alert.source !== "none" ? alert.source : null}
        count={alert.count ?? 1}
        isNew={idx === 0 && !showHighOnly}
      />
    ))
  , [visibleAlerts, showHighOnly]);

  // ── Auto-scroll + beep ────────────────────────────────────────────────────
  const scrollRef    = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (alerts.length > prevCountRef.current) {
      if (!showHighOnly) {
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (alerts[0]?.risk === "HIGH") playBeep();
    }
    prevCountRef.current = alerts.length;
  }, [alerts, showHighOnly]);

  // ── WS error / disconnected ───────────────────────────────────────────────
  const wsError = connStatus === "error" || connStatus === "disconnected";

  return (
    <div className="glass rounded-2xl border border-[#1E2A3A] shadow-xl shadow-black/40 p-5 flex flex-col gap-3 h-full max-h-[520px]">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">

        {/* Left: title + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-1 h-5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444] shrink-0" />
          <h2 className="text-white font-semibold text-base tracking-tight">Threat Alerts</h2>

          {totalAlerts > 0 && (
            <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full tabular-nums">
              {totalAlerts}
            </span>
          )}
          {highCount > 0 && (
            <span className="text-[10px] font-bold bg-red-600/30 text-red-300 border border-red-500/50 px-2 py-0.5 rounded-full animate-pulse tabular-nums">
              {highCount} HIGH
            </span>
          )}
        </div>

        {/* Right: filter + WS dot + clear */}
        <div className="flex items-center gap-2 shrink-0">

          {/* HIGH filter toggle */}
          <button
            onClick={toggleFilter}
            title={showHighOnly ? "Show all alerts" : "Show HIGH only"}
            className={[
              "text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors",
              showHighOnly
                ? "bg-red-500/20 text-red-300 border-red-500/40"
                : "bg-transparent text-gray-500 border-gray-700 hover:text-gray-300 hover:border-gray-500",
            ].join(" ")}
          >
            HIGH only
          </button>

          {/* WS dot */}
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${CONN_DOT[connStatus] ?? "bg-gray-500"}`}
            title={`WebSocket: ${connStatus}`}
          />

          {/* Clear button */}
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

      {/* ── WS error banner ── */}
      {wsError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/8 px-3 py-2 text-xs text-red-400 fade-in">
          <span className="shrink-0">⚠</span>
          <span>
            {connStatus === "error"
              ? "WebSocket error — alerts may be delayed. Reconnecting…"
              : "WebSocket disconnected — waiting to reconnect…"}
          </span>
        </div>
      )}

      {/* ── Alert list ── */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0 pr-1 alert-scroll"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#1E2A3A transparent" }}
      >
        {visibleAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 select-none">
            <span className="text-4xl">🛡️</span>
            <span className="text-sm font-medium text-gray-500">
              {showHighOnly ? "No HIGH alerts" : "No threats detected"}
            </span>
            <span className="text-xs text-gray-600">
              {connStatus === "connected"
                ? "Monitoring active"
                : wsError
                ? "Connection lost"
                : `Status: ${connStatus}`}
            </span>
          </div>
        ) : alertCards}
      </div>

      {/* ── Footer — legend + confidence tooltip + count ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2 border-t border-[#1E2A3A] shrink-0">
        {[
          { label: "HIGH",   color: "#ef4444" },
          { label: "MEDIUM", color: "#f59e0b" },
          { label: "LOW",    color: "#22c55e" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
            <span style={{ color }}>{label}</span>
          </div>
        ))}

        {/* Confidence tooltip */}
        <div className="flex items-center gap-1 text-[10px] text-gray-600">
          <span>Conf</span>
          <ConfidenceTip />
        </div>

        <span className="ml-auto text-[10px] text-gray-600 tabular-nums">
          {visibleAlerts.length} / {alerts.length}
        </span>
      </div>
    </div>
  );
}
