/**
 * src/components/LogEntry.jsx
 *
 * Reusable audit trail entry — compact dark card row with divider.
 * Fully prop-driven, no store or context dependency.
 *
 * Props
 * ─────
 *   eventType    "ALERT" | "ATTACK" | "MODE_CHANGE" | "NORMAL" | string
 *   eventName    string   — e.g. "Jamming Injected", "Spoofing Detected"
 *   timestamp    string   — ISO string or any Date-parseable value
 *   description  string   — short status / detail line
 *   source       string?  — "rule" | "ml" | "rule+ml" | "user" (optional)
 *   risk         string?  — "HIGH" | "MEDIUM" | "LOW" (optional)
 *   isNewest     bool?    — plays slide-in animation (default false)
 *   showDivider  bool?    — renders a bottom border (default true)
 *
 * Usage
 * ─────
 *   <LogEntry
 *     eventType="ATTACK"
 *     eventName="Jamming Injected"
 *     timestamp="2024-01-01T10:45:22Z"
 *     description="Simulation Triggered — SNR suppressed"
 *     source="user"
 *     risk="HIGH"
 *     isNewest
 *   />
 */

import { memo, useMemo } from "react";

// ── Event type config ─────────────────────────────────────────────────────────

const EVENT_CFG = {
  ALERT: {
    tag:    "ALERT",
    tagBg:  "bg-amber-500/15 border-amber-500/40 text-amber-300",
    dot:    "bg-amber-400",
    icon:   "⚠️",
  },
  ATTACK: {
    tag:    "ATTACK",
    tagBg:  "bg-red-500/15 border-red-500/40 text-red-300",
    dot:    "bg-red-500",
    icon:   "🔴",
  },
  MODE_CHANGE: {
    tag:    "MODE",
    tagBg:  "bg-purple-500/15 border-purple-500/40 text-purple-300",
    dot:    "bg-purple-400",
    icon:   "🔀",
  },
  NORMAL: {
    tag:    "NORMAL",
    tagBg:  "bg-green-500/15 border-green-500/30 text-green-300",
    dot:    "bg-green-400",
    icon:   "✅",
  },
};

const DEFAULT_CFG = {
  tag:   "INFO",
  tagBg: "bg-blue-500/15 border-blue-500/30 text-blue-300",
  dot:   "bg-blue-400",
  icon:  "ℹ️",
};

// ── Risk badge ────────────────────────────────────────────────────────────────

const RISK_BADGE = {
  HIGH:   "bg-red-500/15    text-red-300    border-red-500/30",
  MEDIUM: "bg-amber-500/15  text-amber-300  border-amber-500/30",
  LOW:    "bg-green-500/15  text-green-300  border-green-500/30",
};

// ── Source label ──────────────────────────────────────────────────────────────

const SOURCE_LABEL = {
  "rule":    "Rule",
  "ml":      "ML",
  "rule+ml": "R+ML",
  "user":    "User",
};

// ── Timestamp formatter ───────────────────────────────────────────────────────

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return "--"; }
}

function formatFull(ts) {
  try { return new Date(ts).toLocaleString(); }
  catch { return "--"; }
}

// ── LogEntry ──────────────────────────────────────────────────────────────────

const LogEntry = memo(function LogEntry({
  eventType   = "INFO",
  eventName   = "Unknown Event",
  timestamp   = null,
  description = "",
  source      = null,
  risk        = null,
  isNewest    = false,
  showDivider = true,
}) {
  const cfg       = EVENT_CFG[eventType] ?? DEFAULT_CFG;
  const timeShort = useMemo(() => timestamp ? formatTime(timestamp) : "--", [timestamp]);
  const timeFull  = useMemo(() => timestamp ? formatFull(timestamp)  : "--", [timestamp]);

  return (
    <div
      className={[
        "flex items-start gap-3 px-3 py-2.5",
        showDivider ? "border-b border-[#1E2A3A]/60" : "",
        isNewest    ? "slide-in-left bg-white/[0.015]" : "",
        "transition-colors duration-200",
      ].filter(Boolean).join(" ")}
    >
      {/* Left: colored dot */}
      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} aria-hidden="true" />

      {/* Centre: main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">

        {/* Row 1: event type tag + name */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border tracking-widest ${cfg.tagBg}`}>
            {cfg.tag}
          </span>
          <span className="text-xs font-semibold text-white truncate">
            {cfg.icon} {eventName}
          </span>
          {risk && RISK_BADGE[risk] && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${RISK_BADGE[risk]}`}>
              {risk}
            </span>
          )}
        </div>

        {/* Row 2: description */}
        {description && (
          <p className="text-[11px] text-gray-400 leading-snug truncate">
            {description}
          </p>
        )}

        {/* Row 3: time + source */}
        <div className="flex items-center gap-2 text-[10px] text-gray-600">
          <time dateTime={timestamp ?? undefined} title={timeFull} className="tabular-nums cursor-default">
            🕐 {timeShort}
          </time>
          {source && SOURCE_LABEL[source] && (
            <>
              <span>·</span>
              <span>src: {SOURCE_LABEL[source]}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default LogEntry;
