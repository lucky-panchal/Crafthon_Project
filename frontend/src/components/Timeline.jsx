import { useMemo } from "react";
import useLogStore from "../store/useLogStore";
import useAlertStore from "../store/useAlertStore";

const TYPE_CFG = {
  ATTACK:      { color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", dot: "#ef4444", icon: "🔴", label: "ATTACK"      },
  ALERT:       { color: "#f59e0b", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.3)", dot: "#f59e0b", icon: "⚠️", label: "ALERT"       },
  MODE_CHANGE: { color: "#a855f7", bg: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.3)", dot: "#a855f7", icon: "🔀", label: "MODE"        },
  NORMAL:      { color: "#22c55e", bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.2)",  dot: "#22c55e", icon: "✅", label: "NORMAL"      },
  SIGNAL_DROP: { color: "#3b82f6", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.3)", dot: "#3b82f6", icon: "📉", label: "SIGNAL DROP" },
};

function formatTime(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return "--"; }
}

export default function Timeline() {
  const logs        = useLogStore((s) => s.logs);
  const alertLogs   = useAlertStore((s) => s.logs);

  // Merge and sort all events newest first
  const events = useMemo(() => {
    const all = [...logs, ...alertLogs].filter(Boolean);
    const seen = new Set();
    return all
      .filter(e => { const k = e.id || e._id || e.timestamp; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 30);
  }, [logs, alertLogs]);

  return (
    <div className="glass rounded-2xl border shadow-xl shadow-black/40 p-5 flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]" />
          <h2 className="text-white font-semibold text-base tracking-tight">Attack Timeline</h2>
          <span className="text-[9px] font-mono text-purple-400 border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 rounded-full">
            CAUSE → EFFECT
          </span>
        </div>
        <span className="text-[10px] text-gray-600 tabular-nums">{events.length} events</span>
      </div>

      {/* Timeline */}
      <div className="relative overflow-y-auto max-h-72" style={{ scrollbarWidth: "thin", scrollbarColor: "#1E2A3A transparent" }}>

        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-600">
            <span className="text-3xl">📋</span>
            <span className="text-xs">No events yet — inject an attack to see the timeline</span>
          </div>
        ) : (
          <div className="relative pl-6">
            {/* Vertical line */}
            <div className="absolute left-2 top-0 bottom-0 w-px bg-[#1E2A3A]" />

            {events.map((e, idx) => {
              const type = e.type || "NORMAL";
              const cfg  = TYPE_CFG[type] ?? TYPE_CFG.NORMAL;
              const title = e.title || e.type?.replace(/_/g, " ") || "Event";
              const desc  = e.description || e.reason || "";

              return (
                <div
                  key={e.id || e._id || idx}
                  className="relative mb-3 pl-4"
                  style={{ animation: idx === 0 ? "slideInLeft 0.3s ease-out both" : undefined }}
                >
                  {/* Dot */}
                  <div
                    className="absolute left-[-6px] top-1.5 w-3 h-3 rounded-full border-2 border-[#0B0F1A]"
                    style={{ background: cfg.dot, boxShadow: `0 0 6px ${cfg.dot}80` }}
                  />

                  {/* Card */}
                  <div
                    className="rounded-xl px-3 py-2 flex flex-col gap-0.5"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
                          style={{ color: cfg.color, borderColor: cfg.border, background: "rgba(0,0,0,0.3)" }}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span className="text-xs font-semibold text-white truncate">{title}</span>
                      </div>
                      <time className="text-[9px] text-gray-600 tabular-nums shrink-0">
                        {formatTime(e.timestamp)}
                      </time>
                    </div>
                    {desc && (
                      <p className="text-[10px] text-gray-400 truncate pl-1">{desc}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
