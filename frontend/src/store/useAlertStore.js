/**
 * src/store/useAlertStore.js
 *
 * Single source of truth for detection alerts, frame logs, and latest detection.
 *
 * Alert shape (canonical)
 * ───────────────────────
 *   {
 *     id,           — unique string
 *     type,         — "SPOOFING" | "JAMMING" | "TRAFFIC_SPIKE" | ...
 *     reason,       — human-readable explanation
 *     confidence,   — 0–100 (boosted +10 per escalation, capped at 99)
 *     risk,         — "LOW" | "MEDIUM" | "HIGH"
 *     timestamp,    — ISO string (updated on each escalation)
 *     count,        — how many times this type has fired (starts at 1)
 *   }
 *
 * Smart alert logic
 * ─────────────────
 *   1. Dedup      — same type within DEDUP_WINDOW (2 s) → silently ignored
 *   2. Escalation — same type seen again after dedup window:
 *                   → find existing card in alerts[], increment count,
 *                     boost confidence +10 (cap 99), refresh timestamp
 *                   → if count reaches ESCALATION_THRESHOLD (3):
 *                     log escalation event
 *   3. New alert  — type not seen before → prepend fresh card (count: 1)
 *
 * Actions
 * ───────
 *   addAlert(alert)      — smart add: dedup → escalate → or insert
 *   clearAlerts()        — wipe visible list (totalAlerts preserved)
 *   pushFrame(frame)     — ingest WS detection frame
 *   pushAlert(alert)     — alias for addAlert (backward compat)
 *   pushModeLog(mode)    — inject mode-change log entry
 *   setActiveMode(mode)  — manual mode override
 */

import { create } from "zustand";
import { shallow } from "zustand/shallow";
import useLogStore from "./useLogStore";

const MAX_ALERTS            = 10;
const MAX_LOGS              = 20;
const DEDUP_WINDOW          = 2_000;  // ms — ignore same type within this window
const ESCALATION_THRESHOLD  = 3;      // count at which escalation is logged
const CONFIDENCE_BOOST      = 10;     // added per escalation
const CONFIDENCE_CAP        = 99;

// ── ID generator ──────────────────────────────────────────────────────────────

function makeId(prefix = "alert") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Normalise to canonical shape ──────────────────────────────────────────────

function normalise(raw) {
  return {
    id:         raw.id        ?? raw._id ?? makeId(),
    type:       raw.type      ?? "UNKNOWN",
    reason:     raw.reason    ?? "",
    confidence: Number(raw.confidence ?? 0),
    risk:       raw.risk      ?? "LOW",
    timestamp:  raw.timestamp ?? new Date().toISOString(),
    count:      raw.count     ?? 1,
    ...raw,
  };
}

// ── Escalation tracker ────────────────────────────────────────────────────────
// Module-level — survives re-renders, shared across all callers.
//
// _lastSeen[type]  = ms timestamp of last accepted alert for that type
// _typeCount[type] = total times this type has been accepted this session

const _lastSeen  = {};
const _typeCount = {};

/**
 * Decide what to do with an incoming alert.
 * Returns:
 *   { action: "ignore" }                    — within dedup window
 *   { action: "escalate", prevCount }       — same type, outside dedup window
 *   { action: "insert" }                    — new type or first occurrence
 */
function classifyAlert(type) {
  const now  = Date.now();
  const last = _lastSeen[type] ?? 0;

  // Within dedup window → ignore
  if (now - last < DEDUP_WINDOW) {
    return { action: "ignore" };
  }

  // Update tracker
  _lastSeen[type]  = now;
  _typeCount[type] = (_typeCount[type] ?? 0) + 1;
  const count = _typeCount[type];

  if (count > 1) {
    return { action: "escalate", count };
  }
  return { action: "insert", count: 1 };
}

// ── Store ─────────────────────────────────────────────────────────────────────

const useAlertStore = create((set, get) => ({

  // ── State ──────────────────────────────────────────────────────────────────
  latestDetection: null,
  alerts:          [],
  logs:            [],
  totalAlerts:     0,
  activeMode:      "auto",

  // ── addAlert ───────────────────────────────────────────────────────────────
  addAlert: (alert) => {
    const a      = normalise(alert);
    const result = classifyAlert(a.type);

    if (result.action === "ignore") {
      console.log(`[AlertStore] dedup  type=${a.type} — ignored (within ${DEDUP_WINDOW}ms)`);
      return;
    }

    const prev = get();

    if (result.action === "escalate") {
      // Find the most recent card of this type and update it in-place
      const idx = prev.alerts.findIndex((x) => x.type === a.type);

      if (idx !== -1) {
        const existing    = prev.alerts[idx];
        const newCount    = result.count;
        const newConf     = Math.min(existing.confidence + CONFIDENCE_BOOST, CONFIDENCE_CAP);
        const updatedCard = {
          ...existing,
          count:      newCount,
          confidence: newConf,
          timestamp:  new Date().toISOString(),
          reason:     a.reason || existing.reason,
        };

        // Move updated card to top, remove old position
        const rest    = prev.alerts.filter((_, i) => i !== idx);
        const updated = [updatedCard, ...rest].slice(0, MAX_ALERTS);

        set({ alerts: updated });

        if (newCount >= ESCALATION_THRESHOLD) {
          console.log(`[AlertStore] ESCALATION  type=${a.type}  count=${newCount}  conf=${newConf}`);
          // Log escalation event to audit trail
          useLogStore.getState().addLog({
            type:        "ALERT",
            title:       `${a.type.replace(/_/g, " ")} (x${newCount})`,
            description: `Escalated — confidence boosted to ${newConf}%`,
            timestamp:   new Date().toISOString(),
            source:      updatedCard.source ?? null,
            risk:        updatedCard.risk   ?? null,
          });
        } else {
          console.log(`[AlertStore] escalate  type=${a.type}  count=${newCount}  conf=${newConf}`);
        }
        return;
      }
      // No existing card found (e.g. was cleared) — fall through to insert
    }

    // Insert new card
    const newCard = { ...a, count: result.count };
    set({
      alerts:      [newCard, ...prev.alerts].slice(0, MAX_ALERTS),
      totalAlerts: prev.totalAlerts + 1,
    });
    console.log(`[AlertStore] insert  type=${a.type}  risk=${a.risk}  conf=${a.confidence}`);

    // Sync to audit log — frontend-generated timestamp
    useLogStore.getState().addLog({
      type:        "ALERT",
      title:       a.type.replace(/_/g, " "),
      description: a.reason || `Confidence: ${a.confidence}%`,
      timestamp:   new Date().toISOString(),
      source:      a.source ?? null,
      risk:        a.risk   ?? null,
    });
  },

  // ── clearAlerts ────────────────────────────────────────────────────────────
  clearAlerts: () => {
    set({ alerts: [] });
    // Reset session trackers so cleared alerts can re-appear fresh
    Object.keys(_lastSeen).forEach((k)  => delete _lastSeen[k]);
    Object.keys(_typeCount).forEach((k) => delete _typeCount[k]);
    console.log("[AlertStore] clearAlerts — trackers reset");
  },

  // ── pushFrame ──────────────────────────────────────────────────────────────
  pushFrame: (frame) => {
    const isAlert = frame.status === "ALERT";

    const logEntry = {
      _id:        makeId("log"),
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
        alerts:      [normalise({ ...frame, id: logEntry._id }), ...prev.alerts].slice(0, MAX_ALERTS),
        totalAlerts: prev.totalAlerts + 1,
      }),
    });

    if (isAlert) {
      console.log(`[AlertStore] frame  type=${frame.type}  risk=${frame.risk}  conf=${frame.confidence}`);
    }
  },

  // ── pushAlert — backward-compat alias ─────────────────────────────────────
  pushAlert: (alert) => {
    useAlertStore.getState().addAlert(alert);
  },

  // ── pushModeLog ────────────────────────────────────────────────────────────
  pushModeLog: (mode) => {
    const entry = {
      _id:        makeId("mode"),
      timestamp:  new Date().toISOString(),
      type:       `MODE:${mode}`,
      confidence: 0,
      risk:       "LOW",
      source:     "user",
      status:     "MODE_CHANGE",
      mode,
    };
    set((s) => ({ logs: [entry, ...s.logs].slice(0, MAX_LOGS) }));
    console.log(`[AlertStore] modeLog  mode=${mode}`);

    // Sync to audit log
    useLogStore.getState().addLog({
      type:        "MODE_CHANGE",
      title:       `Mode → ${mode}`,
      description: `Simulation mode changed to ${mode}`,
      timestamp:   entry.timestamp,
      source:      "user",
      risk:        null,
    });
  },

  // ── setActiveMode ──────────────────────────────────────────────────────────
  setActiveMode: (mode) => {
    if (get().activeMode === mode) return;
    set({ activeMode: mode });
    console.log(`[AlertStore] setActiveMode  mode=${mode}`);
  },

}));

export default useAlertStore;

// ── Selectors ─────────────────────────────────────────────────────────────────

export function useAlerts() {
  return useAlertStore(
    (s) => ({ alerts: s.alerts, totalAlerts: s.totalAlerts }),
    shallow,
  );
}

export function useAlertList() {
  return useAlertStore(
    (s) => s.alerts.map(({ id, type, reason, confidence, risk, timestamp, count }) => ({
      id, type, reason, confidence, risk, timestamp, count,
    })),
    shallow,
  );
}

export function useLatestDetection() {
  return useAlertStore((s) => s.latestDetection);
}

export function useLogs() {
  return useAlertStore((s) => s.logs);
}
