/**
 * src/store/useLogStore.js
 *
 * Global audit trail store — independent of useAlertStore.
 * Designed for the LogEntry component and any audit panel.
 *
 * Log shape (canonical)
 * ─────────────────────
 *   {
 *     id,           — unique string
 *     type,         — "ALERT" | "ATTACK" | "MODE_CHANGE" | "NORMAL"
 *     title,        — short event name, e.g. "Jamming Injected"
 *     description,  — detail line, e.g. "Simulation Triggered"
 *     timestamp,    — ISO string (frontend-generated if not provided)
 *     source?,      — "rule" | "ml" | "rule+ml" | "user"
 *     risk?,        — "HIGH" | "MEDIUM" | "LOW"
 *   }
 *
 * Actions
 * ───────
 *   addLog(log)   — prepend, cap at MAX_LOGS (50)
 *   clearLogs()   — wipe list
 */

import { create } from "zustand";
import { shallow } from "zustand/shallow";

const MAX_LOGS    = 50;
const DEDUP_WINDOW = 2_000; // ms — ignore same title within this window

// Module-level dedup map — key: title, value: last accepted ms timestamp
const _logSeen = {};

function isDuplicateLog(title) {
  const now  = Date.now();
  const last = _logSeen[title] ?? 0;
  if (now - last < DEDUP_WINDOW) return true;
  _logSeen[title] = now;
  return false;
}

function makeId() {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalise(raw) {
  return {
    id:          raw.id          ?? makeId(),
    type:        raw.type        ?? "NORMAL",
    title:       raw.title       ?? "Unknown Event",
    description: raw.description ?? "",
    timestamp:   raw.timestamp   ?? new Date().toISOString(),
    source:      raw.source      ?? null,
    risk:        raw.risk        ?? null,
  };
}

const useLogStore = create((set, get) => ({

  // ── State ──────────────────────────────────────────────────────────────────
  logs: [],

  // ── addLog ─────────────────────────────────────────────────────────────────
  /**
   * Prepend a new log entry. Caps list at MAX_LOGS (50).
   * Accepts any object — normalised to canonical shape internally.
   *
   * @param {{ type?, title?, description?, timestamp?, source?, risk? }} log
   */
  addLog: (log) => {
    const entry = normalise(log);

    // Dedup: same title within 2 s — silently ignored
    if (isDuplicateLog(entry.title)) {
      console.log(`[LogStore] dedup  title="${entry.title}" — skipped`);
      return;
    }

    set((s) => ({ logs: [entry, ...s.logs].slice(0, MAX_LOGS) }));
    console.log(`[LogStore] addLog  type=${entry.type}  title=${entry.title}`);
  },

  // ── clearLogs ──────────────────────────────────────────────────────────────
  clearLogs: () => {
    set({ logs: [] });
    Object.keys(_logSeen).forEach((k) => delete _logSeen[k]);
    console.log("[LogStore] clearLogs");
  },

}));

export default useLogStore;

// ── Selectors ─────────────────────────────────────────────────────────────────

/** Full log list + count */
export function useLogs() {
  return useLogStore(
    (s) => ({ logs: s.logs, count: s.logs.length }),
    shallow,
  );
}

/** Latest N entries — audit panel preview */
export function useRecentLogs(n = 10) {
  return useLogStore((s) => s.logs.slice(0, n));
}
