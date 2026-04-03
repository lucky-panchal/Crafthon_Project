/**
 * src/store/useConnectionStore.js
 *
 * Single source of truth for WebSocket connection state.
 * Previously split across SimulationStore and DetectionContext — now unified here.
 *
 * State
 * ─────
 *   status   "connecting" | "connected" | "disconnected" | "error"
 *
 * Actions
 * ───────
 *   setStatus(s)  — called by useDetectionSocket on every WS lifecycle event
 */

import { create } from "zustand";
import { shallow } from "zustand/shallow";

const useConnectionStore = create((set, get) => ({

  status: "connecting",

  setStatus: (next) => {
    if (get().status === next) return;
    set({ status: next });
    console.log(`[ConnectionStore] ${next}`);
  },

}));

export default useConnectionStore;

/** Shallow selector — use when reading multiple fields at once */
export function useConnectionState() {
  return useConnectionStore(
    (s) => ({ status: s.status }),
    shallow,
  );
}
