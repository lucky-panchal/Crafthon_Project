/**
 * src/components/ConfidenceMeter.jsx
 *
 * Shows the latest detection result as:
 *   - Animated confidence progress bar (CSS transition)
 *   - Risk badge (HIGH / MEDIUM / LOW)
 *   - Detection source chip (Rule / ML / Rule+ML / —)
 *   - Attack type label
 */

import { useDetection } from "../context/DetectionContext";

// ── Risk config ───────────────────────────────────────────────────────────────

const RISK = {
  HIGH:   { bar: "#ef4444", glow: "#ef444440", label: "HIGH",   text: "text-red-400",   badge: "bg-red-500/15 border-red-500/40 text-red-300"   },
  MEDIUM: { bar: "#f59e0b", glow: "#f59e0b40", label: "MEDIUM", text: "text-amber-400", badge: "bg-amber-500/15 border-amber-500/40 text-amber-300" },
  LOW:    { bar: "#22c55e", glow: "#22c55e40", label: "LOW",    text: "text-green-400", badge: "bg-green-500/15 border-green-500/40 text-green-300" },
};

// ── Source chip ───────────────────────────────────────────────────────────────

const SOURCE_CFG = {
  "rule":     { label: "Rule Engine", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  "ml":       { label: "ML Model",    color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30"   },
  "rule+ml":  { label: "Rule + ML",   color: "text-cyan-400",   bg: "bg-cyan-500/10 border-cyan-500/30"   },
  "none":     { label: "—",           color: "text-gray-500",   bg: "bg-gray-700/30 border-gray-700"      },
};

function SourceChip({ source }) {
  const cfg = SOURCE_CFG[source] ?? SOURCE_CFG["none"];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConfidenceMeter() {
  const { latestDetection } = useDetection();

  const confidence = latestDetection?.confidence ?? 0;
  const risk       = latestDetection?.risk       ?? "LOW";
  const source     = latestDetection?.source     ?? "none";
  const type       = latestDetection?.type       ?? "NONE";
  const status     = latestDetection?.status     ?? "NORMAL";

  const rcfg = RISK[risk] ?? RISK.LOW;
  const isAlert = status === "ALERT";

  return (
    <div className="rounded-2xl border border-[#1E2A3A] bg-[#121826] shadow-xl shadow-black/40 p-5 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="w-1 h-5 rounded-full bg-cyan-500 shadow-[0_0_8px_#06b6d4]" />
        <h2 className="text-white font-semibold text-base tracking-tight">Detection Confidence</h2>
      </div>

      {/* Type + source row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={`text-sm font-bold ${isAlert ? rcfg.text : "text-gray-400"}`}>
          {isAlert ? type.replace(/_/g, " ") : "NORMAL"}
        </span>
        <div className="flex items-center gap-2">
          <SourceChip source={source} />
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${rcfg.badge}`}>
            {rcfg.label}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>Confidence</span>
          <span className={`font-bold tabular-nums ${rcfg.text}`}>{confidence}%</span>
        </div>
        <div className="w-full h-3 bg-[#0B0F1A] rounded-full overflow-hidden border border-[#1E2A3A]">
          <div
            className="confidence-bar h-full rounded-full"
            style={{
              width:     `${confidence}%`,
              background: rcfg.bar,
              boxShadow:  confidence > 0 ? `0 0 8px ${rcfg.glow}` : "none",
            }}
          />
        </div>
        {/* Threshold markers */}
        <div className="relative h-2">
          <span className="absolute left-[40%] text-[8px] text-gray-700 -translate-x-1/2">40</span>
          <span className="absolute left-[70%] text-[8px] text-gray-700 -translate-x-1/2">70</span>
          <span className="absolute left-[40%] top-0 w-px h-2 bg-gray-700" />
          <span className="absolute left-[70%] top-0 w-px h-2 bg-gray-700" />
        </div>
      </div>

      {/* ML sub-score */}
      {latestDetection?.ml && (
        <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-[#1E2A3A]">
          <span>ML anomaly score</span>
          <span className={`tabular-nums font-medium ${latestDetection.ml.is_anomaly ? "text-red-400" : "text-green-400"}`}>
            {latestDetection.ml.anomaly_score?.toFixed(4) ?? "--"}
          </span>
          <span className={latestDetection.ml.is_anomaly ? "text-red-400" : "text-green-400"}>
            {latestDetection.ml.is_anomaly ? "anomaly" : "normal"}
          </span>
        </div>
      )}
    </div>
  );
}
