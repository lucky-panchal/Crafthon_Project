/**
 * src/utils/riskUtils.js
 *
 * Pure utility functions for risk score calculation.
 * No React imports — usable in hooks, stores, tests, and components alike.
 *
 * Thresholds (spec)
 * ─────────────────
 *   0  – 40  → LOW
 *   41 – 70  → MEDIUM
 *   71 – 100 → HIGH
 */

// ── Color tokens (single source of truth) ────────────────────────────────────

export const RISK_COLORS = {
  LOW:    "#22C55E",
  MEDIUM: "#F59E0B",
  HIGH:   "#EF4444",
};

// ── Visual config (Tailwind classes + hex values per level) ──────────────────

export const RISK_CFG = {
  HIGH: {
    level:       "HIGH",
    color:       RISK_COLORS.HIGH,
    glow:        "#EF444430",
    textScore:   "text-red-400",
    textBadge:   "text-red-300",
    bgBadge:     "bg-red-500/15 border-red-500/40",
    hoverBorder: "hover:border-red-500/30",
  },
  MEDIUM: {
    level:       "MEDIUM",
    color:       RISK_COLORS.MEDIUM,
    glow:        "#F59E0B30",
    textScore:   "text-amber-400",
    textBadge:   "text-amber-300",
    bgBadge:     "bg-amber-500/15 border-amber-500/40",
    hoverBorder: "hover:border-amber-500/30",
  },
  LOW: {
    level:       "LOW",
    color:       RISK_COLORS.LOW,
    glow:        "#22C55E30",
    textScore:   "text-green-400",
    textBadge:   "text-green-300",
    bgBadge:     "bg-green-500/15 border-green-500/40",
    hoverBorder: "hover:border-green-500/30",
  },
};

// ── Threshold legend data ─────────────────────────────────────────────────────

export const THRESHOLDS = [
  { label: "LOW",    range: "0 – 40",   color: RISK_COLORS.LOW    },
  { label: "MEDIUM", range: "41 – 70",  color: RISK_COLORS.MEDIUM },
  { label: "HIGH",   range: "71 – 100", color: RISK_COLORS.HIGH   },
];

// ── clampScore ────────────────────────────────────────────────────────────────

/**
 * Clamp a raw score to the valid 0–100 range.
 * Non-numeric input returns 0.
 *
 * @param {unknown} raw
 * @returns {number} integer in [0, 100]
 *
 * @example
 * clampScore(87)    // 87
 * clampScore(-5)    // 0
 * clampScore(120)   // 100
 * clampScore(null)  // 0
 */
export function clampScore(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, Math.min(100, n)));
}

// ── calculateRisk ─────────────────────────────────────────────────────────────

/**
 * Derive risk level and color from a numeric score.
 *
 * @param {number} score — raw score (will be clamped internally)
 * @returns {{ level: "LOW"|"MEDIUM"|"HIGH", color: string }}
 *
 * @example
 * calculateRisk(0)   // { level: "LOW",    color: "#22C55E" }
 * calculateRisk(40)  // { level: "LOW",    color: "#22C55E" }
 * calculateRisk(41)  // { level: "MEDIUM", color: "#F59E0B" }
 * calculateRisk(70)  // { level: "MEDIUM", color: "#F59E0B" }
 * calculateRisk(71)  // { level: "HIGH",   color: "#EF4444" }
 * calculateRisk(100) // { level: "HIGH",   color: "#EF4444" }
 */
export function calculateRisk(score) {
  const s = clampScore(score);
  if (s >= 71) return { level: "HIGH",   color: RISK_COLORS.HIGH   };
  if (s >= 41) return { level: "MEDIUM", color: RISK_COLORS.MEDIUM };
  return         { level: "LOW",    color: RISK_COLORS.LOW    };
}

/**
 * Return the full visual config object for a given risk level.
 * Convenience wrapper so components don't need to import RISK_CFG directly.
 *
 * @param {"LOW"|"MEDIUM"|"HIGH"} level
 * @returns {typeof RISK_CFG["LOW"]}
 */
export function getRiskConfig(level) {
  return RISK_CFG[level] ?? RISK_CFG.LOW;
}
