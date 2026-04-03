/**
 * src/components/LogPanel.jsx
 *
 * Production-ready Audit Trail panel.
 *
 * Features
 * ────────
 *   - Title: "Audit Trail Logs" with tooltip
 *   - Type filter tabs: ALL / ATTACK / ALERT / MODE
 *   - Keyword search (title + description, case-insensitive)
 *   - Single useMemo chain: type filter → keyword filter → JSX render
 *   - Export logs as JSON (filtered or all)
 *   - Auto-scroll to top on new entry
 *   - Clear Logs button
 *   - Empty state: "No logs available"
 *   - Responsive: flex-wrap on mobile
 */

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { shallow }  from "zustand/shallow";
import useLogStore  from "../store/useLogStore";
import LogEntry     from "./LogEntry";

// ── Filter config ─────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "ALL",         label: "All"    },
  { key: "ATTACK",      label: "Attack" },
  { key: "ALERT",       label: "Alert"  },
  { key: "MODE_CHANGE", label: "Mode"   },
];

const TYPE_COLOR = {
  ATTACK:      "text-red-400",
  ALERT:       "text-amber-400",
  MODE_CHANGE: "text-purple-400",
  NORMAL:      "text-green-400",
};

// ── Export helper ─────────────────────────────────────────────────────────────

function exportJson(logs) {
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `audit-trail-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LogPanel() {

  // ── Store — one shallow subscription ─────────────────────────────────────
  const { logs, count, clearLogs } = useLogStore(
    (s) => ({ logs: s.logs, count: s.logs.length, clearLogs: s.clearLogs }),
    shallow,
  );

  // ── Local UI state ────────────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [query,        setQuery]        = useState("");

  const handleFilterChange = useCallback((key) => setActiveFilter(key), []);
  const handleQueryChange  = useCallback((e)   => setQuery(e.target.value), []);
  const handleClearQuery   = useCallback(()    => setQuery(""), []);

  // ── Type breakdown — memoised ─────────────────────────────────────────────
  const breakdown = useMemo(() => {
    const map = {};
    logs.forEach((l) => { map[l.type] = (map[l.type] ?? 0) + 1; });
    return map;
  }, [logs]);

  // ── Single filter chain: type → keyword → JSX ────────────────────────────
  // One useMemo covers all three steps so toggling filter or typing in search
  // never triggers more than one recomputation.
  const { filtered, entries } = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = logs.filter((l) => {
      const typeMatch    = activeFilter === "ALL" || l.type === activeFilter;
      const keywordMatch = !q ||
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q);
      return typeMatch && keywordMatch;
    });

    const entries = filtered.map((log, idx) => (
      <LogEntry
        key={log.id}
        eventType={log.type}
        eventName={log.title}
        timestamp={log.timestamp}
        description={log.description}
        source={log.source}
        risk={log.risk}
        isNewest={idx === 0 && !q}
        showDivider={idx < filtered.length - 1}
      />
    ));

    return { filtered, entries };
  }, [logs, activeFilter, query]);

  // ── Auto-scroll to top on new entry ──────────────────────────────────────
  const scrollRef    = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (count > prevCountRef.current && !query) {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevCountRef.current = count;
  }, [count, query]);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    exportJson(filtered.length < count ? filtered : logs);
  }, [filtered, logs, count]);

  return (
    <div className="rounded-2xl border border-[#1E2A3A] bg-[#121826] shadow-xl shadow-black/40 p-5 flex flex-col gap-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">

        {/* Title + tooltip + count */}
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1] shrink-0" />
          <div className="has-tooltip">
            <span
              className="tooltip-text"
              style={{ whiteSpace: "normal", maxWidth: 220, textAlign: "center" }}
            >
              Audit trail of all system events
            </span>
            <h2 className="text-white font-semibold text-base tracking-tight cursor-default">
              Audit Trail Logs
            </h2>
          </div>
          {count > 0 && (
            <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full tabular-nums">
              {count}
            </span>
          )}
        </div>

        {/* Controls: breakdown + export + clear */}
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(breakdown).map(([type, n]) => (
            <span key={type} className={`text-[9px] font-bold tabular-nums ${TYPE_COLOR[type] ?? "text-gray-400"}`}>
              {type.replace("_", " ")} ×{n}
            </span>
          ))}
          {count > 0 && (
            <>
              <button
                onClick={handleExport}
                title={filtered.length < count ? "Export filtered logs as JSON" : "Export all logs as JSON"}
                className="text-[10px] text-gray-500 hover:text-indigo-300 border border-gray-700 hover:border-indigo-500/50 px-2 py-0.5 rounded-lg transition-colors"
              >
                ↓ Export
              </button>
              <button
                onClick={clearLogs}
                className="text-[10px] text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-2 py-0.5 rounded-lg transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Filter tabs + search row ── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Type filter tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {FILTERS.map(({ key, label }) => {
            const isActive = activeFilter === key;
            const n = key === "ALL" ? count : (breakdown[key] ?? 0);
            return (
              <button
                key={key}
                onClick={() => handleFilterChange(key)}
                className={[
                  "text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors",
                  isActive
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                    : "bg-transparent text-gray-500 border-gray-700 hover:text-gray-300 hover:border-gray-500",
                ].join(" ")}
              >
                {label}
                {n > 0 && <span className="ml-1 opacity-60 tabular-nums">({n})</span>}
              </button>
            );
          })}
        </div>

        {/* Keyword search */}
        <div className="relative flex-1 min-w-[140px]">
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search logs…"
            className="w-full bg-[#0B0F1A] border border-[#1E2A3A] rounded-lg px-3 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          {query && (
            <button
              onClick={handleClearQuery}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 text-xs leading-none"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Log list ── */}
      <div
        ref={scrollRef}
        className="overflow-y-auto max-h-72 rounded-xl border border-[#1E2A3A] bg-[#0B0F1A]"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#1E2A3A transparent" }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 select-none">
            <span className="text-3xl">📋</span>
            <span className="text-sm font-medium text-gray-500">
              {query ? `No results for "${query}"` : "No logs available"}
            </span>
            {(activeFilter !== "ALL" || query) && (
              <button
                onClick={() => { handleFilterChange("ALL"); handleClearQuery(); }}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : entries}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between text-[10px] text-gray-600 pt-1 border-t border-[#1E2A3A]">
        <span>
          {filtered.length < count
            ? <><span className="text-gray-500 tabular-nums">{filtered.length}</span> of <span className="text-gray-500 tabular-nums">{count}</span> entries</>
            : <><span className="text-gray-500 tabular-nums">{count}</span> entries</>
          }
          {query && <span className="ml-1 text-indigo-400/70">· filtered</span>}
        </span>
        <span className="tabular-nums">{count} / 50</span>
      </div>
    </div>
  );
}
