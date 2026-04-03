/**
 * src/components/DetectionBanner.jsx
 *
 * Sticky banner rendered just below the header.
 * - Hidden when status is NORMAL
 * - Pulses red for HIGH, amber for MEDIUM
 * - Shows attack type, confidence, and reason
 * - Dismissible per-alert (reappears on next ALERT frame)
 */

import { useState, useEffect } from "react";
import { useDetection } from "../context/DetectionContext";

const RISK_STYLES = {
  HIGH:   "bg-red-500/15 border-red-500/40 text-red-300",
  MEDIUM: "bg-amber-500/15 border-amber-500/40 text-amber-300",
  LOW:    "bg-green-500/10 border-green-500/30 text-green-300",
};

const RISK_PULSE = {
  HIGH:   "bg-red-400",
  MEDIUM: "bg-amber-400",
  LOW:    "bg-green-400",
};

export default function DetectionBanner() {
  const { latestDetection } = useDetection();
  const [dismissed, setDismissed] = useState(null); // stores _id of dismissed frame

  // Reset dismiss when a new ALERT arrives
  useEffect(() => {
    if (latestDetection?.status === "ALERT") {
      setDismissed(null);
    }
  }, [latestDetection?.timestamp]);

  if (!latestDetection) return null;
  if (latestDetection.status !== "ALERT") return null;
  if (dismissed === latestDetection.timestamp) return null;

  const { type, confidence, risk, reason } = latestDetection;
  const styles = RISK_STYLES[risk] ?? RISK_STYLES.LOW;
  const pulse  = RISK_PULSE[risk]  ?? RISK_PULSE.LOW;

  return (
    <div className={`border-b px-6 py-2.5 flex items-center justify-between gap-4 ${styles}`}>
      <div className="flex items-center gap-3 min-w-0">
        {/* Pulsing dot */}
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 animate-pulse ${pulse}`} />

        {/* Type + confidence */}
        <span className="font-bold text-sm shrink-0">
          ⚠ {type.replace(/_/g, " ")}
        </span>
        <span className="text-xs opacity-70 shrink-0">
          Confidence: {confidence}% · Risk: {risk}
        </span>

        {/* Reason — truncated */}
        <span className="text-xs opacity-60 truncate hidden md:block">
          {reason}
        </span>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(latestDetection.timestamp)}
        className="shrink-0 text-xs opacity-50 hover:opacity-100 transition-opacity px-2 py-0.5 rounded border border-current"
        aria-label="Dismiss alert"
      >
        ✕
      </button>
    </div>
  );
}
