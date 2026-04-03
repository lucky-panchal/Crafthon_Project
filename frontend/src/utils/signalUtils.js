/**
 * src/utils/signalUtils.js
 *
 * Pure utility functions for signal integrity analysis.
 * No React imports — usable in hooks, stores, tests, and components.
 *
 * Levels
 * ──────
 *   GOOD     — signal is healthy
 *   WARNING  — degraded, monitor closely
 *   CRITICAL — severe degradation or attack likely
 *
 * Thresholds
 * ──────────
 *   SNR (dB)
 *     > SNR_WARNING  (20) → GOOD
 *     ≥ SNR_CRITICAL (15) → WARNING
 *     < SNR_CRITICAL (15) → CRITICAL
 *
 *   Packet Loss (%)
 *     < LOSS_WARNING  (10) → GOOD
 *     ≤ LOSS_CRITICAL (25) → WARNING
 *     > LOSS_CRITICAL (25) → CRITICAL
 */

// ── Threshold constants ───────────────────────────────────────────────────────

export const SNR_WARNING  = 20;   // dB — below this → WARNING
export const SNR_CRITICAL = 15;   // dB — below this → CRITICAL

export const LOSS_WARNING  = 10;  // %  — at or above this → WARNING
export const LOSS_CRITICAL = 25;  // %  — above this       → CRITICAL

// ── Level identifiers ─────────────────────────────────────────────────────────

export const SIGNAL_LEVELS = /** @type {const} */ ({
  GOOD:     "GOOD",
  WARNING:  "WARNING",
  CRITICAL: "CRITICAL",
});

// ── Visual config per level ───────────────────────────────────────────────────

export const SIGNAL_LEVEL_CFG = {
  GOOD: {
    level:  "GOOD",
    color:  "#22c55e",
    label:  "Good",
    text:   "text-green-400",
    bar:    "bg-green-500",
  },
  WARNING: {
    level:  "WARNING",
    color:  "#f59e0b",
    label:  "Warning",
    text:   "text-amber-400",
    bar:    "bg-amber-500",
  },
  CRITICAL: {
    level:  "CRITICAL",
    color:  "#ef4444",
    label:  "Critical",
    text:   "text-red-400",
    bar:    "bg-red-500",
  },
};

// ── getSnrStatus ──────────────────────────────────────────────────────────────

/**
 * Derive signal integrity status from an SNR value.
 *
 * @param {number | null | undefined} snr — Signal-to-Noise Ratio in dB
 * @returns {{ level: "GOOD"|"WARNING"|"CRITICAL", color: string, label: string }}
 *
 * @example
 * getSnrStatus(25)   // { level: "GOOD",     color: "#22c55e", label: "Good"     }
 * getSnrStatus(17)   // { level: "WARNING",  color: "#f59e0b", label: "Warning"  }
 * getSnrStatus(10)   // { level: "CRITICAL", color: "#ef4444", label: "Critical" }
 * getSnrStatus(null) // null
 */
export function getSnrStatus(snr) {
  if (snr === null || snr === undefined || !Number.isFinite(Number(snr))) {
    return null;
  }
  const v = Number(snr);
  if (v > SNR_WARNING)  return SIGNAL_LEVEL_CFG.GOOD;
  if (v >= SNR_CRITICAL) return SIGNAL_LEVEL_CFG.WARNING;
  return SIGNAL_LEVEL_CFG.CRITICAL;
}

// ── getPacketLossStatus ───────────────────────────────────────────────────────

/**
 * Derive signal integrity status from a packet loss percentage.
 *
 * @param {number | null | undefined} loss — Packet loss as a percentage (0–100)
 * @returns {{ level: "GOOD"|"WARNING"|"CRITICAL", color: string, label: string }}
 *
 * @example
 * getPacketLossStatus(5)    // { level: "GOOD",     color: "#22c55e", label: "Good"     }
 * getPacketLossStatus(15)   // { level: "WARNING",  color: "#f59e0b", label: "Warning"  }
 * getPacketLossStatus(30)   // { level: "CRITICAL", color: "#ef4444", label: "Critical" }
 * getPacketLossStatus(null) // null
 */
export function getPacketLossStatus(loss) {
  if (loss === null || loss === undefined || !Number.isFinite(Number(loss))) {
    return null;
  }
  const v = Number(loss);
  if (v < LOSS_WARNING)  return SIGNAL_LEVEL_CFG.GOOD;
  if (v <= LOSS_CRITICAL) return SIGNAL_LEVEL_CFG.WARNING;
  return SIGNAL_LEVEL_CFG.CRITICAL;
}

// ── getOverallSignalStatus ────────────────────────────────────────────────────

/**
 * Returns the worst status of SNR and packet loss combined.
 * Useful for a single panel-level health indicator.
 *
 * @param {number|null} snr
 * @param {number|null} loss
 * @returns {{ level: "GOOD"|"WARNING"|"CRITICAL", color: string, label: string } | null}
 */
export function getOverallSignalStatus(snr, loss) {
  const s = getSnrStatus(snr);
  const l = getPacketLossStatus(loss);
  if (!s && !l) return null;

  const rank = { GOOD: 0, WARNING: 1, CRITICAL: 2 };
  const sRank = s ? (rank[s.level] ?? 0) : -1;
  const lRank = l ? (rank[l.level] ?? 0) : -1;
  const worst = Math.max(sRank, lRank);

  return SIGNAL_LEVEL_CFG[["GOOD", "WARNING", "CRITICAL"][worst]] ?? null;
}
