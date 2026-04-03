/**
 * src/components/ControlPanel.jsx — Attack Simulation Engine (production-ready)
 *
 * Optimizations
 * ─────────────
 *   useMemo      — badge classes, button active/idle class strings
 *   useCallback  — handleMode, handleConfirm (stable refs, no re-creation)
 *   Debounce     — 300 ms ref guard prevents double-clicks firing two requests
 *   Loading gate — callSetMode returns early if already loading (Zustand guard)
 *
 * UX
 * ──
 *   Tooltips     — CSS .has-tooltip on each button wrapper
 *   Confirmation — attack modes (JAMMING / SPOOFING) show an inline confirm step
 *   Toast        — error toast via useToast() on sync failure
 *   Mode log     — every confirmed mode change is pushed to LogsPanel via pushModeLog
 */

import { useState, useCallback, useRef, useMemo } from "react";
import useSimulationStore, { STORE_TO_API } from "../store/useSimulationStore";
import useConnectionStore  from "../store/useConnectionStore";
import { useDetection }    from "../context/DetectionContext";
import { useToast }        from "./Toast";

// ── Button config ─────────────────────────────────────────────────────────────

const BUTTONS = [
  {
    storeMode:   "NORMAL",
    label:       "Normal Traffic",
    icon:        "✅",
    tooltip:     "Reset to clean baseline signal",
    confirm:     false,
    activeBg:    "bg-green-600",    activeBorder: "border-green-400",
    activeText:  "text-white",      activeGlow:   "shadow-[0_0_20px_#22c55e70]",
    idleBg:      "bg-green-600/10", idleBorder:   "border-green-500/25",
    idleText:    "text-green-400",  hoverBg:      "hover:bg-green-600/20",
    hoverBorder: "hover:border-green-500/60", hoverGlow: "hover:shadow-[0_0_14px_#22c55e50]",
  },
  {
    storeMode:   "JAMMING",
    label:       "Inject Jamming",
    icon:        "📡",
    tooltip:     "Simulate RF jamming — drops SNR, spikes packet loss",
    confirm:     true,
    activeBg:    "bg-red-600",      activeBorder: "border-red-400",
    activeText:  "text-white",      activeGlow:   "shadow-[0_0_20px_#ef444470]",
    idleBg:      "bg-red-600/10",   idleBorder:   "border-red-500/25",
    idleText:    "text-red-400",    hoverBg:      "hover:bg-red-600/20",
    hoverBorder: "hover:border-red-500/60", hoverGlow: "hover:shadow-[0_0_14px_#ef444450]",
  },
  {
    storeMode:   "SPOOFING",
    label:       "Inject Spoofing",
    icon:        "🎭",
    tooltip:     "Simulate source spoofing — injects fake source_id 999",
    confirm:     true,
    activeBg:    "bg-amber-500",    activeBorder: "border-amber-400",
    activeText:  "text-white",      activeGlow:   "shadow-[0_0_20px_#f59e0b70]",
    idleBg:      "bg-amber-500/10", idleBorder:   "border-amber-500/25",
    idleText:    "text-amber-400",  hoverBg:      "hover:bg-amber-500/20",
    hoverBorder: "hover:border-amber-500/60", hoverGlow: "hover:shadow-[0_0_14px_#f59e0b50]",
  },
];

const MODE_BADGE = {
  NORMAL:   { label: "NORMAL",   color: "text-green-400", bg: "bg-green-500/10",  border: "border-green-500/30",  dot: "bg-green-400"  },
  JAMMING:  { label: "JAMMING",  color: "text-red-400",   bg: "bg-red-500/10",    border: "border-red-500/30",    dot: "bg-red-400"    },
  SPOOFING: { label: "SPOOFING", color: "text-amber-400", bg: "bg-amber-500/10",  border: "border-amber-500/30",  dot: "bg-amber-400"  },
};

const WS_DOT = {
  connected:    { dot: "bg-green-400",               text: "text-green-400",  label: "Connected"    },
  connecting:   { dot: "bg-yellow-400 animate-ping", text: "text-yellow-400", label: "Connecting…"  },
  disconnected: { dot: "bg-gray-500",                text: "text-gray-400",   label: "Disconnected" },
  error:        { dot: "bg-red-500",                 text: "text-red-400",    label: "WS Error"     },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function WsStatusDot({ connStatus }) {
  const cfg = WS_DOT[connStatus] ?? WS_DOT.disconnected;
  return (
    <span className="flex items-center gap-1.5" title={`WebSocket: ${cfg.label}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <span className={`text-[10px] font-medium hidden sm:block ${cfg.text}`}>{cfg.label}</span>
    </span>
  );
}

function SimButton({ label, icon, tooltip, isActive, isLoading, disabled, onClick, cfg }) {
  // useMemo — class strings only recompute when isActive changes
  const classes = useMemo(() => {
    const active = [cfg.activeBg, cfg.activeBorder, cfg.activeText, cfg.activeGlow].join(" ");
    const idle   = [cfg.idleBg, cfg.idleBorder, cfg.idleText, cfg.hoverBg, cfg.hoverBorder, cfg.hoverGlow].join(" ");
    return isActive ? active : idle;
  }, [isActive, cfg]);

  return (
    <div className="has-tooltip">
      <span className="tooltip-text">{tooltip}</span>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={[
          "relative flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border",
          "text-sm font-semibold tracking-wide",
          "transition-all duration-200 ease-out",
          "hover:scale-[1.03] active:scale-[0.97]",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100",
          classes,
        ].join(" ")}
      >
        <span className="w-5 h-5 flex items-center justify-center shrink-0">
          {isLoading
            ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <span className="text-base leading-none">{icon}</span>
          }
        </span>
        <span className="flex-1 text-left">{label}</span>
        {isActive && !isLoading && (
          <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse shrink-0" />
        )}
      </button>
    </div>
  );
}

// ── Inline confirmation dialog ────────────────────────────────────────────────

function ConfirmBar({ storeMode, onConfirm, onCancel }) {
  const cfg = BUTTONS.find((b) => b.storeMode === storeMode);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-600/50 bg-gray-800/60 px-3 py-2 text-xs fade-in">
      <span className="text-gray-300 flex-1">
        Inject <span className="font-bold text-white">{storeMode}</span>? This will affect live data.
      </span>
      <button
        onClick={onConfirm}
        className={`px-3 py-1 rounded-lg font-semibold text-white transition-colors ${
          storeMode === "JAMMING" ? "bg-red-600 hover:bg-red-500" : "bg-amber-500 hover:bg-amber-400"
        }`}
      >
        Confirm
      </button>
      <button
        onClick={onCancel}
        className="px-3 py-1 rounded-lg font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;

export default function ControlPanel() {
  // ── Zustand — one selector per slice, no unnecessary re-renders ───────────
  const mode        = useSimulationStore((s) => s.mode);
  const loading     = useSimulationStore((s) => s.loading);
  const error       = useSimulationStore((s) => s.error);
  const lastSynced  = useSimulationStore((s) => s.lastSynced);
  const callSetMode = useSimulationStore((s) => s.callSetMode);
  const connStatus  = useConnectionStore((s) => s.status);

  // ── Context ───────────────────────────────────────────────────────────────
  const { setActiveMode, pushAlert, pushModeLog } = useDetection();
  const toast = useToast();

  // ── Local UI state ────────────────────────────────────────────────────────
  const [pendingMode, setPendingMode] = useState(null); // awaiting confirmation
  const debounceRef = useRef(0);                        // last click timestamp

  // ── Memoised badge ────────────────────────────────────────────────────────
  const badge = useMemo(() => MODE_BADGE[mode] ?? MODE_BADGE.NORMAL, [mode]);

  // ── Click handler — debounced, confirmation-aware ─────────────────────────
  const handleClick = useCallback((storeMode) => {
    const now = Date.now();
    if (now - debounceRef.current < DEBOUNCE_MS) return; // debounce guard
    debounceRef.current = now;

    const btn = BUTTONS.find((b) => b.storeMode === storeMode);
    if (btn?.confirm && mode !== storeMode) {
      setPendingMode(storeMode); // show confirmation bar
    } else {
      executeMode(storeMode);
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Execute mode change ───────────────────────────────────────────────────
  const executeMode = useCallback(async (storeMode) => {
    setPendingMode(null);
    if (loading) return;

    const ok = await callSetMode(storeMode, pushAlert);
    const finalMode = useSimulationStore.getState().mode;
    setActiveMode(STORE_TO_API[finalMode] ?? "normal");
    pushModeLog(storeMode);

    if (!ok) {
      toast.error(`Sync failed — rolled back to ${useSimulationStore.getState().mode}`);
    } else {
      toast.success(`Mode set to ${storeMode}`);
    }
  }, [loading, callSetMode, pushAlert, setActiveMode, pushModeLog, toast]);

  const handleConfirm = useCallback(() => {
    if (pendingMode) executeMode(pendingMode);
  }, [pendingMode, executeMode]);

  const handleCancel = useCallback(() => setPendingMode(null), []);

  // ── Memoised last-synced string ───────────────────────────────────────────
  const syncedLabel = useMemo(() =>
    lastSynced ? lastSynced.toLocaleTimeString() : null,
  [lastSynced]);

  return (
    <div className="rounded-2xl border border-[#1E2A3A] bg-[#121826] shadow-xl shadow-black/40 p-6 flex flex-col gap-5">

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5">
        <span className="w-1 h-6 rounded-full bg-purple-500 shadow-[0_0_10px_#a855f7]" />
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold text-base tracking-tight leading-tight">
            Attack Simulation Engine
          </h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Force backend into a specific attack scenario
          </p>
        </div>
        <WsStatusDot connStatus={connStatus} />
      </div>

      {/* ── MODE badge ── */}
      <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 transition-colors duration-300 ${badge.bg} ${badge.border}`}>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 animate-pulse ${badge.dot}`} />
        <span className="text-xs text-gray-400 font-medium tracking-widest uppercase">Mode</span>
        <span className={`ml-auto text-sm font-bold tracking-widest transition-colors duration-300 ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      {/* ── Confirmation bar (replaces error banner while pending) ── */}
      {pendingMode ? (
        <ConfirmBar
          storeMode={pendingMode}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      ) : error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-400 fade-in">
          <span className="shrink-0 mt-0.5">⚠</span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-semibold">Sync failed — rolled back</span>
            <span className="text-red-500/70 truncate">{error.message}</span>
          </div>
        </div>
      ) : null}

      {/* ── Buttons ── */}
      <div className="flex flex-col gap-2.5">
        {BUTTONS.map((cfg) => (
          <SimButton
            key={cfg.storeMode}
            label={cfg.label}
            icon={cfg.icon}
            tooltip={cfg.tooltip}
            isActive={mode === cfg.storeMode}
            isLoading={loading && mode === cfg.storeMode}
            disabled={loading || pendingMode !== null}
            onClick={() => handleClick(cfg.storeMode)}
            cfg={cfg}
          />
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between text-[10px] text-gray-600">
        <span>
          {syncedLabel
            ? <>Synced <span className="text-gray-500">{syncedLabel}</span></>
            : "Not yet synced"
          }
        </span>
        <span>~1 s latency</span>
      </div>
    </div>
  );
}
