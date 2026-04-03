/**
 * src/components/AlertCard.jsx
 *
 * Standalone, reusable alert card.
 * Fully prop-driven — no store or context dependency.
 * Used by AlertPanel internally and anywhere else a single alert needs rendering.
 *
 * Props
 * ─────
 *   type        string   — "SPOOFING" | "JAMMING" | "TRAFFIC_SPIKE" | etc.
 *   risk        string   — "HIGH" | "MEDIUM" | "LOW"
 *   reason      string   — human-readable explanation
 *   confidence  number   — 0–100
 *   timestamp   string   — ISO string or any Date-parseable value
 *   source      string?  — "rule" | "ml" | "rule+ml" (optional)
 *   isNew       bool?    — plays entrance blink animation (default false)
 *   className   string?  — extra classes for layout overrides
 *
 * Usage
 * ─────
 *   <AlertCard
 *     type="SPOOFING"
 *     risk="HIGH"
 *     reason="Duplicate source ID detected — source_id 999 is a known spoof."
 *     confidence={89}
 *     timestamp="2024-01-01T10:45:22Z"
 *     source="rule"
 *     isNew
 *   />
 */

import { memo, useMemo } from "react";

// ── Color config — matches RISK_CFG in AlertPanel exactly ────────────────────

const RISK_CFG = {
  HIGH: {
    border:    "border-red-500/60",
    bg:        "bg-red-500/10",
    titleText: "text-red-300",
    badge:     "bg-red-500/20 text-red-300 border-red-500/30",
    bar:       "#ef4444",
    glow:      "#ef444430",
    cardGlow:  "0 0 18px #ef444428, 0 0 6px #ef444418",  // HIGH outer glow
    label:     "HIGH",
  },
  MEDIUM: {
    border:    "border-amber-500/40",
    bg:        "bg-amber-500/8",
    titleText: "text-amber-300",
    badge:     "bg-amber-500/20 text-amber-300 border-amber-500/30",
    bar:       "#f59e0b",
    glow:      "#f59e0b30",
    cardGlow:  "0 0 10px #f59e0b14",                     // MEDIUM subtle glow
    label:     "MEDIUM",
  },
  LOW: {
    border:    "border-green-500/30",
    bg:        "bg-green-500/5",
    titleText: "text-green-400",
    badge:     "bg-green-500/20 text-green-300 border-green-500/30",
    bar:       "#22c55e",
    glow:      "#22c55e30",
    cardGlow:  null,
    label:     "LOW",
  },
};

// ── Type → icon map ───────────────────────────────────────────────────────────

const TYPE_ICON = {
  JAMMING:          "📡",
  SPOOFING:         "🎭",
  TRAFFIC_SPIKE:    "📈",
  TRAFFIC_ANOMALY:  "⚠️",
  RISK_ESCALATION:  "🔺",
  NONE:             "✅",
};

// ── Type → human label ────────────────────────────────────────────────────────

function typeToLabel(type) {
  if (!type) return "Unknown Alert";
  if (type === "RISK_ESCALATION") return "Risk Escalation Detected";
  return type.replace(/_/g, " ");
}

// ── Source chip ───────────────────────────────────────────────────────────────

const SOURCE_CFG = {
  "rule":    { label: "Rule Engine", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  "ml":      { label: "ML Model",    color: "text-blue-400",   bg: "bg-blue-500/10   border-blue-500/30"   },
  "rule+ml": { label: "Rule + ML",   color: "text-cyan-400",   bg: "bg-cyan-500/10   border-cyan-500/30"   },
};

function SourceChip({ source }) {
  const cfg = SOURCE_CFG[source];
  if (!cfg) return null;
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ── Timestamp formatter ───────────────────────────────────────────────────────

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return "--";
  }
}

function formatFull(ts) {
  try { return new Date(ts).toLocaleString(); }
  catch { return "--"; }
}

// ── AlertCard ─────────────────────────────────────────────────────────────────

const AlertCard = memo(function AlertCard({
  type       = "TRAFFIC_ANOMALY",
  risk       = "LOW",
  reason     = "",
  confidence = 0,
  timestamp  = null,
  source     = null,
  count      = 1,
  isNew      = false,
  className  = "",
}) {
  // Force HIGH styling for jamming/spoofing attack types
  const effectiveRisk = (type === "JAMMING" || type === "SPOOFING") ? "HIGH" : risk;
  const cfg       = RISK_CFG[effectiveRisk] ?? RISK_CFG.LOW;
  const icon      = TYPE_ICON[type] ?? "⚠️";
  const baseLabel = typeToLabel(type);
  const conf      = Math.max(0, Math.min(100, Number(confidence) || 0));
  const timeShort = timestamp ? formatTime(timestamp) : "--";
  const timeFull  = timestamp ? formatFull(timestamp) : "--";
  const isHigh    = effectiveRisk === "HIGH";
  const escalated = count >= 3;  // 3+ occurrences = escalated state

  // Title: "Jamming Detected" or "Jamming Detected (x3)"
  const displayLabel = count >= 2 ? `${baseLabel} (x${count})` : baseLabel;

  const barStyle = useMemo(() => ({
    width:     `${conf}%`,
    background: cfg.bar,
    boxShadow:  conf > 0 ? `0 0 6px ${cfg.glow}` : "none",
  }), [conf, cfg.bar, cfg.glow]);

  // Escalated HIGH cards get a stronger glow
  const cardStyle = useMemo(() => {
    if (!cfg.cardGlow) return undefined;
    if (escalated && isHigh) {
      return { boxShadow: "0 0 28px #ef444450, 0 0 10px #ef444430" };
    }
    return { boxShadow: cfg.cardGlow };
  }, [cfg.cardGlow, escalated, isHigh]);

  const iconStyle = useMemo(() => ({
    background: `${cfg.bar}18`,
    border:     `1px solid ${cfg.bar}30`,
    ...(isHigh && { boxShadow: `0 0 ${escalated ? 14 : 8}px ${cfg.bar}${escalated ? "70" : "50"}` }),
  }), [cfg.bar, isHigh, escalated]);

  return (
    <div
      className={[
        "flex flex-col gap-2.5",
        "rounded-2xl border px-4 py-3.5",
        "shadow-lg shadow-black/30",
        "transition-all duration-300",
        cfg.border, cfg.bg,
        // Slide-in from top on new alert, blink on HIGH
        isNew ? "alert-slide-in" : "",
        isNew && isHigh ? "alert-blink" : "",
        // Continuous pulse ring on HIGH
        isHigh ? "alert-high-pulse" : "",
        className,
      ].filter(Boolean).join(" ")}
      style={cardStyle}
    >
      {/* ── Row 1: icon + title + risk badge ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 text-sm"
            style={iconStyle}
            aria-hidden="true"
          >
            {icon}
          </span>

          {/* Alert type label */}
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest leading-none mb-0.5">
              ⚠ Alert
            </span>
            <span className={`text-sm font-bold leading-tight truncate ${cfg.titleText}`}>
              {displayLabel}
            </span>
          </div>
        </div>

        {/* Risk badge + escalation badge */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {escalated && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
              ESC
            </span>
          )}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* ── Row 2: reason ── */}
      {reason && (
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 pl-9">
          <span className="text-gray-600 font-medium">Reason: </span>
          {reason}
        </p>
      )}

      {/* ── Row 3: confidence bar ── */}
      <div className="flex flex-col gap-1 pl-9">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-500">Confidence</span>
          <span className="font-bold tabular-nums" style={{ color: cfg.bar }}>
            {conf}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-[#0B0F1A] rounded-full overflow-hidden border border-[#1E2A3A]">
          <div className="h-full rounded-full confidence-bar" style={barStyle} />
        </div>
      </div>

      {/* ── Row 4: footer — source chip + count + timestamp ── */}
      <div className="flex items-center justify-between pl-9">
        <div className="flex items-center gap-1.5">
          <SourceChip source={source} />
          {count >= 2 && (
            <span className="text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-[#1E2A3A] text-gray-400 border border-[#2A3A4A]">
              ×{count}
            </span>
          )}
        </div>
        <time
          dateTime={timestamp ?? undefined}
          title={timeFull}
          className="text-[10px] text-gray-600 tabular-nums cursor-default ml-auto"
        >
          🕐 {timeShort}
        </time>
      </div>
    </div>
  );
});

export default AlertCard;
