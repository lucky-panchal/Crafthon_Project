/**
 * src/store/useRiskStore.js
 *
 * Zustand store — single source of truth for the risk score.
 *
 * State
 * ─────
 *   score   0–100, default 10 (LOW)
 *   level   "LOW" | "MEDIUM" | "HIGH"  — always derived from score
 *   color   hex string                 — always derived from score
 *   source  "ws" | "fallback"          — where the current value came from
 *
 * Actions
 * ───────
 *   setScore(raw, src?)       — manual / fallback update, auto-derives level
 *   syncFromFrame(frame)      — WS handler: reads risk_score → confidence → derives
 *   syncFromDetection(c, r)   — backward-compat alias for syncFromFrame
 */

import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { clampScore, calculateRisk } from "../utils/riskUtils";

const DEFAULT_SCORE = 10;
const { level: DEFAULT_LEVEL, color: DEFAULT_COLOR } = calculateRisk(DEFAULT_SCORE);

const useRiskStore = create((set, get) => ({

  // ── State ──────────────────────────────────────────────────────────────────
  score:     DEFAULT_SCORE,
  prevScore: DEFAULT_SCORE,
  delta:     0,             // signed difference from last change
  trend:     "stable",      // "up" | "down" | "stable"
  level:     DEFAULT_LEVEL, // "LOW"
  color:     DEFAULT_COLOR, // "#22C55E"
  source:    "fallback",    // "ws" | "fallback"

  // ── setScore — manual / fallback ──────────────────────────────────────────
  /**
   * @param {unknown}           raw
   * @param {"ws"|"fallback"}   [src="fallback"]
   */
  setScore: (raw, src = "fallback") => {
    const next = clampScore(raw);
    const prev = get().score;
    if (prev === next) return;
    const { level, color } = calculateRisk(next);
    const delta = next - prev;
    set({ score: next, prevScore: prev, delta, trend: delta > 0 ? "up" : "down", level, color, source: src });
    console.log(`[RiskStore] ${src} — score: ${next}  level: ${level}`);
  },

  // ── syncFromFrame — called by WebSocket hook on every frame ───────────────
  /**
   * Field priority for score value:
   *   1. frame.risk_score   (explicit dedicated field)
   *   2. frame.confidence   (detection confidence used as proxy)
   *
   * @param {{ risk_score?: number, confidence?: number, risk?: string }} frame
   */
  syncFromFrame: (frame) => {
    const raw = frame.risk_score ?? frame.confidence;
    if (raw === undefined) return;

    const next = clampScore(raw);
    const prev = get().score;
    if (prev === next) return; // no-op — prevents flicker

    const { level: derivedLevel, color } = calculateRisk(next);
    const level = frame.risk ?? derivedLevel;
    const delta = next - prev;

    set({ score: next, prevScore: prev, delta, trend: delta > 0 ? "up" : "down", level, color, source: "ws" });
    console.log(`[RiskStore] WS sync — score: ${next}  level: ${level}`);
  },

  // ── syncFromDetection — backward-compat alias ─────────────────────────────
  syncFromDetection: (confidence, backendRisk) => {
    useRiskStore.getState().syncFromFrame({ confidence, risk: backendRisk });
  },

}));

export default useRiskStore;

/** Shallow selector — RiskScoreCard, SystemStatus */
export function useRiskState() {
  return useRiskStore(
    (s) => ({
      score:     s.score,
      prevScore: s.prevScore,
      delta:     s.delta,
      trend:     s.trend,
      level:     s.level,
      color:     s.color,
      source:    s.source,
    }),
    shallow,
  );
}
