/**
 * src/components/SignalIntegrityPanel.jsx
 *
 * Production-ready Signal Integrity Analysis panel.
 *
 * Features
 * ────────
 *   - SMA(3) smoothing on displayed SNR and Packet Loss values
 *   - ↑ / ↓ trend arrows comparing smoothed value to 3 frames ago
 *   - Tooltip: "Signal quality based on SNR and packet loss"
 *   - No-data fallback UI when history is empty
 *   - Responsive: 1-col mobile, 2-col sm+
 *   - useMemo on every derived value — no wasted recalculations
 */

import { useMemo } from "react";
import { useSignalMetrics, useSignalHistory } from "../store/useSignalStore";
import {
  getSnrStatus,
  getPacketLossStatus,
  getOverallSignalStatus,
  SNR_WARNING,
  SNR_CRITICAL,
  LOSS_WARNING,
  LOSS_CRITICAL,
} from "../utils/signalUtils";

// ── Fallback config ───────────────────────────────────────────────────────────

const UNKNOWN_CFG = { color: "#6b7280", text: "text-gray-500", bar: "bg-gray-600", label: "--" };

// ── SMA helper ────────────────────────────────────────────────────────────────

function sma(arr, key, n = 3) {
  if (!arr.length) return null;
  const slice = arr.slice(-n);
  return slice.reduce((sum, p) => sum + (p[key] ?? 0), 0) / slice.length;
}

// ── Trend arrow ───────────────────────────────────────────────────────────────
// Returns { arrow, color } comparing current smoothed value to value N frames ago.
// For SNR: up is good (green). For loss: up is bad (red).

function trend(history, key, invertGood = false) {
  if (history.length < 4) return null;
  const recent = sma(history.slice(-3), key);
  const older  = sma(history.slice(-6, -3), key);
  if (recent === null || older === null) return null;
  const diff = recent - older;
  if (Math.abs(diff) < 0.1) return null; // no meaningful change

  const up = diff > 0;
  // For SNR: up = good (green). For loss: up = bad (red).
  const isGood = invertGood ? !up : up;
  return {
    arrow: up ? "↑" : "↓",
    color: isGood ? "#22c55e" : "#ef4444",
    diff:  Math.abs(diff).toFixed(1),
  };
}

// ── Metric row ────────────────────────────────────────────────────────────────

function MetricRow({ icon, label, value, unit, rawValue, barPct, cfg, sublabel, trendInfo }) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl border border-[#1E2A3A] bg-[#0B0F1A]">

      {/* Top: icon + label + badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none shrink-0">{icon}</span>
          <span className="text-xs text-gray-500 uppercase tracking-widest font-medium truncate">
            {label}
          </span>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0"
          style={{ color: cfg.color, background: `${cfg.color}18`, borderColor: `${cfg.color}40` }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Value + trend arrow */}
      <div className="flex items-end gap-2 pl-1">
        <span
          className="text-3xl font-extrabold tabular-nums leading-none transition-all duration-500"
          style={{ color: cfg.color }}
        >
          {value}
        </span>
        <span className="text-xs text-gray-600 mb-0.5">{unit}</span>

        {trendInfo && (
          <span
            className="text-sm font-bold mb-0.5 tabular-nums leading-none"
            style={{ color: trendInfo.color }}
            title={`${trendInfo.arrow}${trendInfo.diff} ${unit} vs 3 frames ago`}
          >
            {trendInfo.arrow}
          </span>
        )}

        {/* Raw value in small text when smoothed differs */}
        {rawValue !== null && Math.abs(rawValue - parseFloat(value)) > 0.2 && (
          <span className="text-[10px] text-gray-600 mb-0.5 tabular-nums">
            ({rawValue.toFixed(1)})
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-1">
        <div className="w-full h-2 bg-[#1E2A3A] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full confidence-bar ${cfg.bar}`}
            style={{
              width:     `${Math.min(100, Math.max(0, barPct))}%`,
              boxShadow: barPct > 0 ? `0 0 6px ${cfg.color}50` : "none",
            }}
          />
        </div>
        {sublabel && <span className="text-[10px] text-gray-600">{sublabel}</span>}
      </div>
    </div>
  );
}

// ── No-data fallback ──────────────────────────────────────────────────────────

function NoDataFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-600">
      <span className="text-3xl select-none">📡</span>
      <span className="text-sm font-medium text-gray-500">Waiting for signal data…</span>
      <span className="text-xs">Fallback simulator will start shortly</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SignalIntegrityPanel() {
  const { snr: rawSnr, packetLoss: rawLoss, lastUpdated } = useSignalMetrics();
  const history = useSignalHistory();

  const hasData = history.length > 0;

  // ── SMA(3) smoothed values ────────────────────────────────────────────────
  const smoothedSnr  = useMemo(() => sma(history, "snr",        3) ?? rawSnr,  [history, rawSnr]);
  const smoothedLoss = useMemo(() => sma(history, "packetLoss", 3) ?? rawLoss, [history, rawLoss]);

  // ── Trend arrows ──────────────────────────────────────────────────────────
  // SNR: up is good (invertGood=false → up=green)
  // Loss: up is bad (invertGood=true → up=red)
  const snrTrend  = useMemo(() => trend(history, "snr",        false), [history]);
  const lossTrend = useMemo(() => trend(history, "packetLoss", true),  [history]);

  // ── Status derivation from smoothed values ────────────────────────────────
  const snrStatus  = useMemo(() => getSnrStatus(smoothedSnr),                        [smoothedSnr]);
  const lossStatus = useMemo(() => getPacketLossStatus(smoothedLoss),                [smoothedLoss]);
  const overall    = useMemo(() => getOverallSignalStatus(smoothedSnr, smoothedLoss), [smoothedSnr, smoothedLoss]);

  const snrCfg     = snrStatus  ?? UNKNOWN_CFG;
  const lossCfg    = lossStatus ?? UNKNOWN_CFG;
  const overallCfg = overall    ?? UNKNOWN_CFG;

  // ── Bar percentages ───────────────────────────────────────────────────────
  const snrBarPct  = useMemo(() => Math.min(100, Math.max(0, (smoothedSnr  / 40) * 100)), [smoothedSnr]);
  const lossBarPct = useMemo(() => Math.min(100, Math.max(0,  smoothedLoss)),              [smoothedLoss]);

  // ── Sublabels ─────────────────────────────────────────────────────────────
  const snrSublabel =
    smoothedSnr > SNR_WARNING   ? "Strong signal — no interference"
    : smoothedSnr >= SNR_CRITICAL ? "Moderate — minor degradation"
    :                               "Weak — possible jamming";

  const lossSublabel =
    smoothedLoss < LOSS_WARNING   ? "Acceptable — link stable"
    : smoothedLoss <= LOSS_CRITICAL ? "Elevated — monitor closely"
    :                                 "Severe — link degraded";

  return (
    <div className="rounded-2xl border border-[#1E2A3A] bg-[#121826] shadow-xl shadow-black/40 p-5 flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span
            className="w-1 h-6 rounded-full shrink-0"
            style={{ background: overallCfg.color, boxShadow: `0 0 8px ${overallCfg.color}60` }}
          />
          <div>
            {/* Tooltip on title */}
            <div className="has-tooltip">
              <span
                className="tooltip-text"
                style={{ whiteSpace: "normal", maxWidth: 220, textAlign: "center" }}
              >
                Signal quality based on SNR and packet loss
              </span>
              <h2 className="text-white font-bold text-base tracking-tight leading-tight cursor-default">
                Signal Integrity Analysis
              </h2>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">
              SMA(3) smoothed · {history.length} / 20 pts
            </p>
          </div>
        </div>

        {/* Overall health pill */}
        <span
          className="text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0"
          style={{ color: overallCfg.color, background: `${overallCfg.color}15`, borderColor: `${overallCfg.color}40` }}
        >
          {overallCfg.label}
        </span>
      </div>

      {/* ── Content ── */}
      {!hasData ? <NoDataFallback /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MetricRow
            icon="📶"
            label="SNR"
            value={smoothedSnr.toFixed(1)}
            rawValue={rawSnr}
            unit="dB"
            barPct={snrBarPct}
            cfg={snrCfg}
            sublabel={snrSublabel}
            trendInfo={snrTrend}
          />
          <MetricRow
            icon="📦"
            label="Packet Loss"
            value={smoothedLoss.toFixed(1)}
            rawValue={rawLoss}
            unit="%"
            barPct={lossBarPct}
            cfg={lossCfg}
            sublabel={lossSublabel}
            trendInfo={lossTrend}
          />
        </div>
      )}

      {/* ── Footer legend ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-[#1E2A3A]">
        {[
          { label: "Good",     color: "#22c55e", snr: `>${SNR_WARNING}`,              loss: `<${LOSS_WARNING}%`  },
          { label: "Warning",  color: "#f59e0b", snr: `${SNR_CRITICAL}–${SNR_WARNING}`, loss: `${LOSS_WARNING}–${LOSS_CRITICAL}%` },
          { label: "Critical", color: "#ef4444", snr: `<${SNR_CRITICAL}`,              loss: `>${LOSS_CRITICAL}%` },
        ].map(({ label, color, snr: s, loss: l }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
            <span style={{ color }}>{label}</span>
            <span className="text-gray-700">SNR {s} · Loss {l}</span>
          </div>
        ))}
        <span className="ml-auto text-[10px] text-gray-600 tabular-nums">
          {lastUpdated !== "--" ? `↻ ${lastUpdated}` : "—"}
        </span>
      </div>
    </div>
  );
}
