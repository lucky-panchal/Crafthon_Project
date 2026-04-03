/**
 * src/components/RiskScoreCard.jsx
 *
 * Risk Assessment card — shows a numeric score (0–100) and risk level.
 *
 * Data source
 * ───────────
 * When used inside <DetectionProvider> (default), reads live data from
 * DetectionContext.latestDetection.
 * Accepts optional `score` and `risk` props to override for static use.
 *
 * Visual elements
 * ───────────────
 *   - SVG arc gauge    — fills clockwise, color-matched to risk level
 *   - Big bold number  — animates via CSS counter-like transition
 *   - Risk level badge — LOW / MEDIUM / HIGH with matching color
 *   - Trend row        — shows ML anomaly score when available
 *   - Hover effect     — card lifts + border brightens
 */

import { useMemo, useEffect, useRef } from "react";
import { useDetection } from "../context/DetectionContext";
import { clampScore, calculateRisk, getRiskConfig, THRESHOLDS } from "../utils/riskUtils";
import useRiskStore from "../store/useRiskStore";

// ── SVG Arc Gauge ─────────────────────────────────────────────────────────────
//
// Draws a 270° arc (from 135° to 405°, i.e. bottom-left → bottom-right).
// The filled portion is driven by `score` (0–100).

const R          = 52;          // arc radius
const CX         = 64;          // centre x
const CY         = 64;          // centre y
const CIRCUMFERENCE = 2 * Math.PI * R;
const ARC_FRACTION  = 0.75;     // 270° / 360°
const ARC_LENGTH    = CIRCUMFERENCE * ARC_FRACTION;

// Starting angle: 135° (bottom-left), going clockwise
const START_DEG = 135;
const START_RAD = (START_DEG * Math.PI) / 180;

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const s   = polarToCartesian(cx, cy, r, startDeg);
  const e   = polarToCartesian(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function ArcGauge({ score, color, glow, isHigh }) {
  const clamped    = Math.max(0, Math.min(100, score));
  const trackEnd   = START_DEG + ARC_FRACTION * 360;
  const trackD     = arcPath(CX, CY, R, START_DEG, trackEnd);

  // strokeDasharray approach: full arc length as dash, offset drives fill
  const filled  = ARC_LENGTH * (clamped / 100);
  const offset  = ARC_LENGTH - filled;          // 0 = full, ARC_LENGTH = empty

  // We draw the full arc path and clip via dashoffset
  const fullArcD = arcPath(CX, CY, R, START_DEG, trackEnd);

  return (
    <svg viewBox="0 0 128 128" className="w-36 h-36 drop-shadow-lg" aria-hidden="true">
      <defs>
        <filter id="arcGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Pulse ring — only when HIGH */}
      {isHigh && (
        <circle
          cx={CX} cy={CY} r={R + 8}
          fill="none"
          stroke={color}
          strokeWidth="2"
          opacity="0.35"
          className="risk-pulse-ring"
        />
      )}

      {/* Track */}
      <path d={trackD} fill="none" stroke="#1E2A3A" strokeWidth="10" strokeLinecap="round" />

      {/* Animated fill via strokeDashoffset */}
      <path
        d={fullArcD}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={ARC_LENGTH}
        strokeDashoffset={offset}
        filter="url(#arcGlow)"
        style={{
          transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease",
        }}
      />

      {/* Centre label: "87 / 100" */}
      <text
        x={CX} y={CY - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize="20"
        fontWeight="800"
        fontFamily="ui-monospace, monospace"
        style={{ transition: "fill 0.4s ease" }}
      >
        {clamped}
      </text>
      <text
        x={CX} y={CY + 14}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#6B7280"
        fontSize="9"
        fontWeight="500"
        letterSpacing="1"
      >
        / 100
      </text>
    </svg>
  );
}

// ── Threshold legend is imported from riskUtils ──────────────────────────────

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param {{ score?: number, risk?: "LOW"|"MEDIUM"|"HIGH" }} props
 *   Both props are optional — defaults to live DetectionContext data.
 */
export default function RiskScoreCard({ score: scoreProp, risk: riskProp }) {
  const { latestDetection, pushAlert } = useDetection();

  const storeScore = useRiskStore((s) => s.score);
  const storeLevel = useRiskStore((s) => s.level);
  const delta      = useRiskStore((s) => s.delta);
  const trend      = useRiskStore((s) => s.trend);

  const rawScore = scoreProp ?? storeScore;
  const score    = clampScore(rawScore);
  const risk     = riskProp ?? storeLevel ?? latestDetection?.risk ?? calculateRisk(score).level;
  const cfg      = useMemo(() => getRiskConfig(risk), [risk]);

  // ── Fire "Risk Escalation" alert once per HIGH transition ────────────────────
  const prevRiskRef = useRef(risk);
  useEffect(() => {
    if (risk === "HIGH" && prevRiskRef.current !== "HIGH") {
      pushAlert({
        status:     "ALERT",
        type:       "RISK_ESCALATION",
        confidence: score,
        risk:       "HIGH",
        reason:     `Risk score escalated to ${score}/100 — immediate threat assessment required.`,
        source:     "risk-tracker",
      });
    }
    prevRiskRef.current = risk;
  }, [risk, score, pushAlert]);

  const mlScore   = latestDetection?.ml?.anomaly_score;
  const mlAnomaly = latestDetection?.ml?.is_anomaly;

  // ── Delta chip ─────────────────────────────────────────────────────────────────────
  const showDelta = delta !== 0;
  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
  const deltaColor = trend === "up" ? "text-red-400" : "text-green-400";
  const deltaArrow = trend === "up" ? "↑" : "↓";

  return (
    <div
      className={[
        "rounded-2xl border bg-[#121826]",
        "shadow-xl shadow-black/40 p-6",
        "flex flex-col gap-5",
        "transition-all duration-300 ease-out",
        "hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/60",
        risk === "HIGH" ? "border-red-500/50 shadow-red-500/10" : "border-[#1E2A3A]",
        cfg.hoverBorder,
      ].join(" ")}
      style={risk === "HIGH" ? { boxShadow: "0 0 24px #ef444420, 0 20px 40px #00000066" } : undefined}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5">
        <span
          className="w-1 h-6 rounded-full"
          style={{ background: cfg.color, boxShadow: `0 0 10px ${cfg.glow}` }}
        />
        <h2 className="text-white font-bold text-base tracking-tight">
          Risk Assessment
        </h2>
      </div>

      {/* ── Gauge + labels ── */}
      <div className="flex items-center gap-6">
        <ArcGauge score={score} color={cfg.color} glow={cfg.glow} isHigh={risk === "HIGH"} />

        <div className="flex flex-col gap-3 flex-1 min-w-0">

          {/* Score + delta */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Risk Score</span>
            <div className="flex items-end gap-2">
              <span className={`text-4xl font-extrabold tabular-nums leading-none transition-colors duration-400 ${cfg.textScore}`}>
                {score}
              </span>
              {showDelta && (
                <span className={`flex items-center gap-0.5 text-xs font-bold tabular-nums mb-1 ${deltaColor}`}>
                  <span>{deltaArrow}</span>
                  <span>{deltaLabel}</span>
                </span>
              )}
            </div>
          </div>

          {/* Risk level badge */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Risk Level</span>
            <span
              className={[
                "inline-flex items-center gap-1.5 self-start",
                "px-3 py-1 rounded-full border text-xs font-bold tracking-widest",
                cfg.bgBadge, cfg.textBadge,
              ].join(" ")}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
              {cfg.level}
            </span>
          </div>

          {/* Attack type */}
          {latestDetection?.type && latestDetection.type !== "NONE" && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Threat</span>
              <span className={`text-xs font-semibold ${cfg.textScore}`}>
                {latestDetection.type.replace(/_/g, " ")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Horizontal bar ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>0</span>
          <span className="text-gray-500">Risk Score</span>
          <span>100</span>
        </div>
        <div className="w-full h-2 bg-[#0B0F1A] rounded-full overflow-hidden border border-[#1E2A3A]">
          <div
            className="h-full rounded-full confidence-bar"
            style={{ width: `${score}%`, background: cfg.color, boxShadow: score > 0 ? `0 0 8px ${cfg.glow}` : "none" }}
          />
        </div>
        <div className="relative h-2">
          {[40, 70].map((pct) => (
            <span key={pct}>
              <span className="absolute top-0 w-px h-2 bg-gray-700" style={{ left: `${pct}%` }} />
              <span className="absolute text-[8px] text-gray-700 -translate-x-1/2" style={{ left: `${pct}%` }}>{pct}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── ML anomaly row ── */}
      {mlScore !== undefined && (
        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#1E2A3A]">
          <span className="text-gray-500">ML anomaly score</span>
          <div className="flex items-center gap-2">
            <span className={`tabular-nums font-semibold ${mlAnomaly ? "text-red-400" : "text-green-400"}`}>
              {mlScore.toFixed(4)}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
              mlAnomaly ? "bg-red-500/15 text-red-300" : "bg-green-500/15 text-green-300"
            }`}>
              {mlAnomaly ? "ANOMALY" : "NORMAL"}
            </span>
          </div>
        </div>
      )}

      {/* ── Threshold legend ── */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1E2A3A]">
        {THRESHOLDS.map(({ label, range, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span style={{ color }}>{label}</span>
            <span className="text-gray-700">{range}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
