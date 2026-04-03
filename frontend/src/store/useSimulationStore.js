/**
 * src/store/useSimulationStore.js
 *
 * Zustand store — single source of truth for simulation mode and
 * WebSocket connection status.
 *
 * State
 * ─────
 *   mode        "NORMAL" | "JAMMING" | "SPOOFING"
 *   loading     true while POST /set-mode is in-flight
 *   error       ApiError | null
 *   lastSynced  Date | null — last successful backend HTTP sync
 *   connStatus  "connecting" | "connected" | "disconnected" | "error"
 *
 * Actions
 * ───────
 *   setMode(mode)        — synchronous local update, no network
 *   callSetMode(mode)    — optimistic update → POST /set-mode → rollback on error
 *                          sets a 500 ms user-lock so wsSync ignores the next frame
 *   wsSync(rawMode)      — called by the WebSocket hook on every frame;
 *                          skipped silently if the user acted within the lock window
 *   setConnStatus(s)     — called by the WebSocket hook on open/close/error
 *
 * Conflict resolution
 * ───────────────────
 *   User click  → callSetMode sets _userLockUntil = now + LOCK_MS
 *   WS frame    → wsSync checks Date.now() < _userLockUntil → skip if locked
 *
 *   This gives the user's intent priority for 500 ms after a click, after which
 *   the backend's echoed mode takes over.  The lock is stored in a module-level
 *   variable (not Zustand state) so it never triggers a re-render.
 */

import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { setSimulationMode, ApiError } from "../services/api";
import { MODE_ALERTS } from "../context/DetectionContext";

// ── Valid modes ───────────────────────────────────────────────────────────────

export const MODES = /** @type {const} */ ({
  NORMAL:   "NORMAL",
  JAMMING:  "JAMMING",
  SPOOFING: "SPOOFING",
});

const VALID_MODES = new Set(Object.values(MODES));

export const STORE_TO_API = {
  NORMAL:   "normal",
  JAMMING:  "jamming",
  SPOOFING: "spoofing",
};

// Maps lowercase backend values → uppercase store keys
const API_TO_STORE = {
  normal:   "NORMAL",
  jamming:  "JAMMING",
  spoofing: "SPOOFING",
  auto:     null,   // "auto" has no store equivalent — ignore
};

// ── User-lock (module-level, never causes re-renders) ─────────────────────────
const LOCK_MS = 500;
let _userLockUntil = 0;

function acquireUserLock() {
  _userLockUntil = Date.now() + LOCK_MS;
}

function isUserLocked() {
  return Date.now() < _userLockUntil;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const useSimulationStore = create((set, get) => ({

  // ── State ──────────────────────────────────────────────────────────────────
  mode:       MODES.NORMAL,
  loading:    false,
  error:      null,
  lastSynced: null,
  // connStatus lives in useConnectionStore — read from there

  // ── setMode — synchronous local update, no network ────────────────────────
  setMode: (rawMode) => {
    const next    = String(rawMode).toUpperCase();
    const current = get().mode;
    if (!VALID_MODES.has(next)) {
      console.warn(`[SimulationStore] setMode: unknown mode "${rawMode}" — ignored`);
      return;
    }
    if (current === next) return;
    set({ mode: next, error: null });
    console.log(`[SimulationStore] mode  ${current} → ${next}`);
  },

  // ── wsSync — called by WebSocket hook on every frame ──────────────────────
  /**
   * Sync mode from a backend WebSocket frame.
   * Silently skipped if the user clicked a button within the last LOCK_MS ms.
   *
   * @param {string} rawMode  — value of frame.mode (lowercase from backend)
   */
  wsSync: (rawMode) => {
    if (!rawMode) return;
    if (isUserLocked()) return;

    const next = API_TO_STORE[String(rawMode).toLowerCase()];
    if (!next) return;

    const current = get().mode;
    if (current === next) return;

    set({ mode: next });
    console.log(`[SimulationStore] wsSync  ${current} → ${next}`);
  },

  // ── callSetMode — optimistic update + POST /set-mode ──────────────────────
  /**
   * @param {string} rawMode
   * @returns {Promise<boolean>}
   */
  callSetMode: async (rawMode, pushAlert) => {
    const next    = String(rawMode).toUpperCase();
    const current = get().mode;

    if (!VALID_MODES.has(next)) {
      console.warn(`[SimulationStore] callSetMode: unknown mode "${rawMode}" — ignored`);
      return false;
    }
    if (get().loading) return false;

    acquireUserLock();
    set({ mode: next, loading: true, error: null });
    console.log(`[SimulationStore] callSetMode  ${current} → ${next}`);

    try {
      await setSimulationMode(STORE_TO_API[next]);
      set({ loading: false, lastSynced: new Date() });
      console.log(`[SimulationStore] synced  mode=${next}`);
      if (pushAlert && MODE_ALERTS[next]) pushAlert(MODE_ALERTS[next]);
      return true;
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(err.message);
      set({ mode: current, loading: false, error: apiErr });
      console.error(`[SimulationStore] rollback  mode=${current}  err=${apiErr.message}`);
      return false;
    }
  },

}));

export default useSimulationStore;

/** Shallow selector for ControlPanel — reads mode + loading + error + lastSynced */
export function useSimulationControls() {
  return useSimulationStore(
    (s) => ({
      mode:        s.mode,
      loading:     s.loading,
      error:       s.error,
      lastSynced:  s.lastSynced,
      callSetMode: s.callSetMode,
      wsSync:      s.wsSync,
      setMode:     s.setMode,
    }),
    shallow,
  );
}
