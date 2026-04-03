/**
 * src/context/DetectionContext.jsx
 *
 * Thin bridge — all state lives in useAlertStore (Zustand).
 * Keeps the existing useDetection() API surface so every component
 * that already calls useDetection() needs zero changes.
 *
 * New code should prefer direct store selectors:
 *   import { useAlerts, useLatestDetection, useLogs } from "../store/useAlertStore"
 *   import useConnectionStore from "../store/useConnectionStore"
 */

import { createContext, useContext } from "react";
import { shallow } from "zustand/shallow";
import useAlertStore   from "../store/useAlertStore";
import useConnectionStore from "../store/useConnectionStore";

// ── Synthetic alert templates (exported for SimulationStore) ──────────────────

export const MODE_ALERTS = {
  JAMMING: {
    status:     "ALERT",
    type:       "JAMMING",
    confidence: 92,
    risk:       "HIGH",
    reason:     "Jamming Detected — SNR critically suppressed; packet loss severe.",
    source:     "rule",
  },
  SPOOFING: {
    status:     "ALERT",
    type:       "SPOOFING",
    confidence: 89,
    risk:       "HIGH",
    reason:     "Spoofing Detected — source_id '999' is a known spoofed identifier.",
    source:     "rule",
  },
};

// ── Context (sentinel — just guards against usage outside provider) ───────────

const DetectionContext = createContext(false);

export function DetectionProvider({ children }) {
  return (
    <DetectionContext.Provider value={true}>
      {children}
    </DetectionContext.Provider>
  );
}

// ── useDetection — backward-compatible hook ───────────────────────────────────

/**
 * Returns the same shape as the old useReducer-based context.
 * Internally reads from useAlertStore + useConnectionStore with shallow comparison.
 */
export function useDetection() {
  if (!useContext(DetectionContext)) {
    throw new Error("useDetection must be used inside <DetectionProvider>");
  }

  const store = useAlertStore(
    (s) => ({
      latestDetection: s.latestDetection,
      alerts:          s.alerts,
      logs:            s.logs,
      totalAlerts:     s.totalAlerts,
      activeMode:      s.activeMode,
      pushFrame:       s.pushFrame,
      pushAlert:       s.pushAlert,
      pushModeLog:     s.pushModeLog,
      clearAlerts:     s.clearAlerts,
      setActiveMode:   s.setActiveMode,
    }),
    shallow,
  );

  const connStatus    = useConnectionStore((s) => s.status);
  const setConnStatus = useConnectionStore((s) => s.setStatus);

  return { ...store, connStatus, setConnStatus };
}
