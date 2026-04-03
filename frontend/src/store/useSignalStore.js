/**
 * src/store/useSignalStore.js
 *
 * Single source of truth for live telemetry signal values.
 *
 * Fixes applied
 * ─────────────
 *   1. snr resolution: raw.snr (no self-reference)
 *   2. _fallbackTimer moved to module-level — avoids Zustand state anti-pattern
 *      and React StrictMode double-fire
 *   3. stopFallback called via useSignalStore.getState() not get() to avoid
 *      fragile pre-set() call ordering
 */

import { create } from "zustand";
import { shallow } from "zustand/shallow";

const MAX_HISTORY          = 20;
const FALLBACK_INTERVAL_MS = 1_000;

const SIM = {
  snr:        { drift: 1.5, min: 10,  max: 35  },
  packetLoss: { drift: 0.8, min: 0,   max: 40  },
  packetRate: { drift: 20,  min: 100, max: 800 },
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function step(current, cfg) {
  return parseFloat(
    clamp(current + (Math.random() - 0.5) * 2 * cfg.drift, cfg.min, cfg.max).toFixed(2)
  );
}

// Module-level — never stored in Zustand state, no re-renders, no StrictMode issues
let _fallbackTimer = null;

// ── Store ─────────────────────────────────────────────────────────────────────

const useSignalStore = create((set, get) => ({

  // ── State ──────────────────────────────────────────────────────────────────
  snr:         28,
  packetLoss:  5,
  packetRate:  0,
  lastUpdated: "--",
  source:      "fallback",  // "live" | "fallback"
  history:     [],          // Array<{ time, snr, packetLoss }>, max MAX_HISTORY

  // ── setSignalData ──────────────────────────────────────────────────────────
  setSignalData: (raw) => {
    // Fix 1: correct field resolution — no self-reference
    const snr        = raw.snr;
    const packetLoss = raw.packetLoss ?? raw.packet_loss;
    const packetRate = raw.packetRate ?? raw.packet_rate;
    const time       = raw.time;

    const next = {};
    if (Number.isFinite(snr))        next.snr        = snr;
    if (Number.isFinite(packetLoss)) next.packetLoss = packetLoss;
    if (Number.isFinite(packetRate)) next.packetRate = packetRate;
    if (time)                        next.lastUpdated = time;

    if (Object.keys(next).length === 0) return;

    // Fix 3: use getState() not get() — safe regardless of call ordering
    if (get().source === "fallback") {
      useSignalStore.getState().stopFallback();
      next.source = "live";
    }

    // Append to rolling history using current state snapshot
    const s = get();
    next.history = [
      ...s.history.slice(-(MAX_HISTORY - 1)),
      {
        time:       next.lastUpdated ?? s.lastUpdated,
        snr:        next.snr        ?? s.snr,
        packetLoss: next.packetLoss ?? s.packetLoss,
      },
    ];

    set(next);
    console.log(`[SignalStore] live  snr=${next.snr ?? "--"}  loss=${next.packetLoss ?? "--"}`);
  },

  // ── startFallback ──────────────────────────────────────────────────────────
  startFallback: () => {
    if (_fallbackTimer) return; // Fix 2: module-level guard, no Zustand state needed

    console.log("[SignalStore] fallback started");

    _fallbackTimer = setInterval(() => {
      const s   = get();
      const now = new Date().toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      const nextSnr  = step(s.snr,        SIM.snr);
      const nextLoss = step(s.packetLoss, SIM.packetLoss);
      const nextPR   = step(s.packetRate, SIM.packetRate);

      set({
        snr:         nextSnr,
        packetLoss:  nextLoss,
        packetRate:  nextPR,
        lastUpdated: now,
        source:      "fallback",
        history:     [
          ...s.history.slice(-(MAX_HISTORY - 1)),
          { time: now, snr: nextSnr, packetLoss: nextLoss },
        ],
      });
    }, FALLBACK_INTERVAL_MS);
  },

  // ── stopFallback ───────────────────────────────────────────────────────────
  stopFallback: () => {
    if (!_fallbackTimer) return;
    clearInterval(_fallbackTimer);
    _fallbackTimer = null;
    console.log("[SignalStore] fallback stopped");
  },

}));

export default useSignalStore;

// ── Selectors ─────────────────────────────────────────────────────────────────

/** SNR + Packet Loss + lastUpdated — SignalIntegrityPanel */
export function useSignalMetrics() {
  return useSignalStore(
    (s) => ({ snr: s.snr, packetLoss: s.packetLoss, lastUpdated: s.lastUpdated }),
    shallow,
  );
}

/** All signal fields — SystemStatus, MiniStat cards */
export function useSignalData() {
  return useSignalStore(
    (s) => ({
      snr:         s.snr,
      packetLoss:  s.packetLoss,
      packetRate:  s.packetRate,
      lastUpdated: s.lastUpdated,
      source:      s.source,
    }),
    shallow,
  );
}

/** Rolling history — SignalGraph */
export function useSignalHistory() {
  return useSignalStore((s) => s.history);
}
