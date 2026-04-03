/**
 * src/store/useAlertStore.js
 *
 * Single source of truth for detection alerts, frame logs, and latest detection.
 * Migrated from the DetectionContext useReducer so all components can subscribe
 * with fine-grained selectors and shallow comparison instead of context re-renders.
 *
 * State
 * ─────
 *   latestDetection  — most recent WS detection frame
 *   alerts           — rolling list, newest first, max MAX_ALERTS
 *   logs             — rolling list, newest first, max MAX_LOGS
 *   totalAlerts      — session-total alert count (never resets on clear)
 *   activeMode       — mirrors backend _detection_mode
 *
 * Actions
 * ───────
 *   pushFrame(frame)     — ingest a WS detection frame
 *   pushAlert(alert)     — inject a synthetic alert (mode change, risk escalation)
 *   pushModeLog(mode)    — inject a mode-change log entry
 *   clearAlerts()        — wipe visible alert list (totalAlerts preserved)
 *   setActiveMode(mode)  — manual mode override
 */

import { create } from "zustand";
import { shallow } from "zustand/shallow";

const MAX_ALERTS = 10;
const MAX_LOGS   = 20;

const useAlertStore = create((set, get) => ({

  // ── State ──────────────────────────────────────────────────────────────────
  latestDetection: null,
  alerts:          [],
  logs:            [],
  totalAlerts:     0,
  activeMode:      "auto",

  // ── pushFrame ──────────────────────────────────────────────────────────────
  pushFrame: (frame) => {
    const isAlert = frame.status === "ALERT";

    const logEntry = {
      _id:        `${Date.now()}-${Math.random()}`,
      timestamp:  frame.timestamp,
      type:       frame.type,
      confidence: frame.confidence,
      risk:       frame.risk,
      source:     frame.source ?? "none",
      status:     frame.status,
    };

    const prev = get();

    set({
      latestDetection: frame,
      activeMode:      frame.mode ?? prev.activeMode,
      logs:            [logEntry, ...prev.logs].slice(0, MAX_LOGS),
      ...(isAlert && {
        alerts:      [{ ...frame, _id: logEntry._id }, ...prev.alerts].slice(0, MAX_ALERTS),
        totalAlerts: prev.totalAlerts + 1,
      }),
    });

    if (isAlert) {
      console.log(`[AlertStore] ALERT  type=${frame.type}  risk=${frame.risk}  conf=${frame.confidence}`);
    }
  },

  // ── pushAlert ──────────────────────────────────────────────────────────────
  pushAlert: (alert) => {
    const a = {
      ...alert,
      _id:       `manual-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
    };
    const prev = get();
    set({
      alerts:      [a, ...prev.alerts].slice(0, MAX_ALERTS),
      totalAlerts: prev.totalAlerts + 1,
    });
    console.log(`[AlertStore] PUSH_ALERT  type=${a.type}  risk=${a.risk}`);
  },

  // ── pushModeLog ────────────────────────────────────────────────────────────
  pushModeLog: (mode) => {
    const entry = {
      _id:        `mode-${Date.now()}-${Math.random()}`,
      timestamp:  new Date().toISOString(),
      type:       `MODE:${mode}`,
      confidence: 0,
      risk:       "LOW",
      source:     "user",
      status:     "MODE_CHANGE",
      mode,
    };
    set((s) => ({ logs: [entry, ...s.logs].slice(0, MAX_LOGS) }));
    console.log(`[AlertStore] MODE_LOG  mode=${mode}`);
  },

  // ── clearAlerts ────────────────────────────────────────────────────────────
  clearAlerts: () => {
    set({ alerts: [] });
    console.log("[AlertStore] CLEAR_ALERTS");
  },

  // ── setActiveMode ──────────────────────────────────────────────────────────
  setActiveMode: (mode) => {
    if (get().activeMode === mode) return;
    set({ activeMode: mode });
    console.log(`[AlertStore] SET_MODE  mode=${mode}`);
  },

}));

export default useAlertStore;

// ── Shallow selectors — import these in components ────────────────────────────

/** Alerts list + count — AlertPanel */
export function useAlerts() {
  return useAlertStore(
    (s) => ({ alerts: s.alerts, totalAlerts: s.totalAlerts }),
    shallow,
  );
}

/** Latest detection frame — RiskScoreCard, ConfidenceMeter, DetectionBanner */
export function useLatestDetection() {
  return useAlertStore((s) => s.latestDetection);
}

/** Logs list — LogsPanel */
export function useLogs() {
  return useAlertStore((s) => s.logs);
}
