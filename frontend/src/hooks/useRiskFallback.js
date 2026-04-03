/**
 * src/hooks/useRiskFallback.js
 *
 * Activates when the WebSocket is disconnected or errored.
 * Generates a smoothly drifting simulated risk score every 2 s so the
 * RiskScoreCard never shows a stale value during backend downtime.
 *
 * Drift model
 * ───────────
 * Each tick adds a random delta in [-12, +12] to the current score,
 * then clamps to [5, 95].  This produces a realistic wandering signal
 * rather than jarring random jumps.
 *
 * Lifecycle
 * ─────────
 *   WS connected    → interval cleared immediately, store source = "ws"
 *   WS disconnected → interval starts after GRACE_MS (avoids flicker on
 *                     brief reconnects)
 *
 * Mount this hook once alongside useDetectionSocket() in DashboardInner.
 */

import { useEffect, useRef } from "react";
import useSimulationStore from "../store/useSimulationStore";
import useRiskStore from "../store/useRiskStore";
import { clampScore } from "../utils/riskUtils";

const INTERVAL_MS = 2_000;   // tick every 2 s
const GRACE_MS    = 1_500;   // wait before starting fallback (avoids flicker)
const MAX_DELTA   = 12;      // max score change per tick

function nextSimulatedScore(current) {
  const delta = (Math.random() * MAX_DELTA * 2) - MAX_DELTA; // [-12, +12]
  return clampScore(Math.round(current + delta));
}

export function useRiskFallback() {
  const intervalRef = useRef(null);
  const graceRef    = useRef(null);

  useEffect(() => {
    // Subscribe to connStatus changes — Zustand subscribe is outside React
    const unsub = useSimulationStore.subscribe(
      (state) => state.connStatus,
      (connStatus) => {
        const isDown = connStatus === "disconnected" || connStatus === "error";

        if (!isDown) {
          // WS is up — cancel fallback immediately
          clearTimeout(graceRef.current);
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          return;
        }

        // WS is down — start fallback after grace period
        if (intervalRef.current) return; // already running

        graceRef.current = setTimeout(() => {
          // Double-check still disconnected after grace period
          const status = useSimulationStore.getState().connStatus;
          if (status !== "disconnected" && status !== "error") return;

          console.log("[RiskFallback] WS offline — starting simulated scores");

          intervalRef.current = setInterval(() => {
            const current = useRiskStore.getState().score;
            const next    = nextSimulatedScore(current);
            useRiskStore.getState().setScore(next, "fallback");
          }, INTERVAL_MS);
        }, GRACE_MS);
      },
    );

    return () => {
      unsub();
      clearTimeout(graceRef.current);
      clearInterval(intervalRef.current);
    };
  }, []);
}
