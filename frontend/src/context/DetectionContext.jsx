import { createContext, useContext } from "react";
import useAlertStore from "../store/useAlertStore";
import useConnectionStore from "../store/useConnectionStore";

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

const DetectionContext = createContext(false);

export function DetectionProvider({ children }) {
  return (
    <DetectionContext.Provider value={true}>
      {children}
    </DetectionContext.Provider>
  );
}

export function useDetection() {
  if (!useContext(DetectionContext)) {
    throw new Error("useDetection must be used inside <DetectionProvider>");
  }

  // Each selector returns a primitive or stable ref — no new objects created
  const latestDetection = useAlertStore((s) => s.latestDetection);
  const alerts          = useAlertStore((s) => s.alerts);
  const logs            = useAlertStore((s) => s.logs);
  const totalAlerts     = useAlertStore((s) => s.totalAlerts);
  const activeMode      = useAlertStore((s) => s.activeMode);
  const pushFrame       = useAlertStore((s) => s.pushFrame);
  const pushAlert       = useAlertStore((s) => s.pushAlert);
  const pushModeLog     = useAlertStore((s) => s.pushModeLog);
  const clearAlerts     = useAlertStore((s) => s.clearAlerts);
  const setActiveMode   = useAlertStore((s) => s.setActiveMode);
  const connStatus      = useConnectionStore((s) => s.status);
  const setConnStatus   = useConnectionStore((s) => s.setStatus);

  return {
    latestDetection,
    alerts,
    logs,
    totalAlerts,
    activeMode,
    connStatus,
    pushFrame,
    pushAlert,
    pushModeLog,
    clearAlerts,
    setActiveMode,
    setConnStatus,
  };
}
