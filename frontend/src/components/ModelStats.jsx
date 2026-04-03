import { useMemo } from "react";
import useSimulationStore from "../store/useSimulationStore";
import useRiskStore from "../store/useRiskStore";

const STATS = {
  NORMAL: {
    accuracy:  91, precision: 93, recall: 89,
    fp: 6, latency: "<1s", model: "Isolation Forest",
    status: "Monitoring", statusColor: "#22c55e",
  },
  JAMMING: {
    accuracy:  94, precision: 96, recall: 92,
    fp: 4, latency: "0.3s", model: "Isolation Forest + Rule",
    status: "Active Detection", statusColor: "#ef4444",
  },
  SPOOFING: {
    accuracy:  89, precision: 91, recall: 87,
    fp: 8, latency: "0.5s", model: "Rule Engine",
    status: "Active Detection", statusColor: "#f59e0b",
  },
};

function Bar({ value, color }) {
  return (
    <div className="w-full h-1.5 bg-[#1E2A3A] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${value}%`, background: color, boxShadow: `0 0 4px ${color}60` }}
      />
    </div>
  );
}

export default function ModelStats() {
  const mode  = useSimulationStore((s) => s.mode);
  const score = useRiskStore((s) => s.score);
  const stats = STATS[mode] ?? STATS.NORMAL;

  const detections = useMemo(() => Math.floor(score * 0.4 + 12), [score]);

  return (
    <div className="glass rounded-2xl border shadow-xl shadow-black/40 p-5 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-cyan-500 shadow-[0_0_8px_#06b6d4]" />
          <h2 className="text-white font-semibold text-sm tracking-tight">AI Model Stats</h2>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
          style={{ color: stats.statusColor, borderColor: `${stats.statusColor}40`, background: `${stats.statusColor}15` }}>
          {stats.status}
        </span>
      </div>

      {/* Model name */}
      <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-[#0B0F1A]/60 border border-[#1E2A3A]">
        <span className="text-[9px] text-gray-500 font-mono">MODEL</span>
        <span className="text-xs text-blue-400 font-semibold ml-auto">{stats.model}</span>
      </div>

      {/* Metrics */}
      <div className="flex flex-col gap-3">
        {[
          { label: "Accuracy",  value: stats.accuracy,  color: "#22c55e" },
          { label: "Precision", value: stats.precision, color: "#3b82f6" },
          { label: "Recall",    value: stats.recall,    color: "#a855f7" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-500">{label}</span>
              <span className="font-bold tabular-nums" style={{ color }}>{value}%</span>
            </div>
            <Bar value={value} color={color} />
          </div>
        ))}
      </div>

      {/* Bottom stats */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#1E2A3A]">
        {[
          { label: "False +ve",  value: `${stats.fp}%`,    color: "#f59e0b" },
          { label: "Latency",    value: stats.latency,     color: "#3b82f6" },
          { label: "Detections", value: `${detections}`,   color: "#22c55e" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center gap-0.5 rounded-xl bg-[#0B0F1A]/40 py-2 border border-[#1E2A3A]">
            <span className="text-[9px] text-gray-600">{label}</span>
            <span className="text-xs font-bold tabular-nums" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
