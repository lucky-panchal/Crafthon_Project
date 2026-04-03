import { useMemo } from "react";
import useSimulationStore from "../store/useSimulationStore";
import useSignalStore from "../store/useSignalStore";
import useAlertStore from "../store/useAlertStore";

const EXPLAIN = {
  JAMMING: {
    title:   "Why Jamming Detected?",
    color:   "#ef4444",
    icon:    "📡",
    reasons: (snr, loss) => [
      { label: "SNR Level",       value: `${snr?.toFixed(1) ?? "--"} dB`,  status: snr < 15 ? "critical" : snr < 20 ? "warning" : "normal", note: "Below 15 dB = RF interference" },
      { label: "Packet Loss",     value: `${loss?.toFixed(1) ?? "--"}%`,   status: loss > 25 ? "critical" : loss > 10 ? "warning" : "normal", note: "Spike indicates signal blocking" },
      { label: "Detection Rule",  value: "SNR < 15 dB",                   status: "info",     note: "Rule Engine triggered" },
      { label: "AI Confidence",   value: "92%",                           status: "critical", note: "Isolation Forest anomaly score" },
    ],
    action: "Switch to backup frequency band. Activate frequency hopping protocol.",
  },
  SPOOFING: {
    title:   "Why Spoofing Detected?",
    color:   "#f59e0b",
    icon:    "🎭",
    reasons: (snr, loss) => [
      { label: "Source ID",       value: "999 (FAKE)",  status: "critical", note: "Known spoofed identifier detected" },
      { label: "Packet Rate",     value: "Elevated",    status: "warning",  note: "Abnormal injection rate" },
      { label: "Detection Rule",  value: "source_id=999", status: "info",   note: "Rule Engine triggered" },
      { label: "AI Confidence",   value: "89%",         status: "critical", note: "Isolation Forest anomaly score" },
    ],
    action: "Isolate node. Verify source identity via secondary channel. Block source_id 999.",
  },
  NORMAL: {
    title:   "System Operating Normally",
    color:   "#22c55e",
    icon:    "🛡️",
    reasons: (snr, loss) => [
      { label: "SNR Level",     value: `${snr?.toFixed(1) ?? "--"} dB`, status: "normal", note: "Within safe range (>20 dB)" },
      { label: "Packet Loss",   value: `${loss?.toFixed(1) ?? "--"}%`,  status: "normal", note: "Acceptable (<10%)" },
      { label: "Source IDs",    value: "All verified",                  status: "normal", note: "No spoofed identifiers" },
      { label: "AI Score",      value: "Normal",                        status: "normal", note: "No anomalies detected" },
    ],
    action: "No action required. Continue monitoring.",
  },
};

const STATUS_CFG = {
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "CRITICAL" },
  warning:  { color: "#f59e0b", bg: "rgba(245,158,11,0.10)", label: "WARNING"  },
  normal:   { color: "#22c55e", bg: "rgba(34,197,94,0.08)",  label: "NORMAL"   },
  info:     { color: "#3b82f6", bg: "rgba(59,130,246,0.10)", label: "INFO"     },
};

export default function ExplainPanel() {
  const mode       = useSimulationStore((s) => s.mode);
  const snr        = useSignalStore((s) => s.snr);
  const packetLoss = useSignalStore((s) => s.packetLoss);

  const key    = mode === "JAMMING" ? "JAMMING" : mode === "SPOOFING" ? "SPOOFING" : "NORMAL";
  const cfg    = EXPLAIN[key];
  const rows   = useMemo(() => cfg.reasons(snr, packetLoss), [key, snr, packetLoss]);

  return (
    <div className="glass rounded-2xl border shadow-xl shadow-black/40 p-5 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span className="w-1 h-6 rounded-full shrink-0" style={{ background: cfg.color, boxShadow: `0 0 8px ${cfg.color}60` }} />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{cfg.icon}</span>
            <h2 className="text-white font-bold text-sm tracking-tight">{cfg.title}</h2>
          </div>
          <p className="text-[9px] text-gray-500 mt-0.5 font-mono">EXPLAINABLE AI · RULE ENGINE + ISOLATION FOREST</p>
        </div>
      </div>

      {/* Reason rows */}
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const s = STATUS_CFG[r.status] ?? STATUS_CFG.info;
          return (
            <div key={i} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
              style={{ background: s.bg, border: `1px solid ${s.color}30` }}>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-gray-400 font-medium">{r.label}</span>
                <span className="text-[9px] text-gray-600">{r.note}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold tabular-nums" style={{ color: s.color }}>{r.value}</span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded border"
                  style={{ color: s.color, borderColor: `${s.color}40`, background: "rgba(0,0,0,0.3)" }}>
                  {s.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Suggested action */}
      <div className="rounded-xl px-3 py-2.5 border border-[#f59e0b]/30 bg-[#f59e0b]/8">
        <p className="text-[9px] text-gray-500 font-mono mb-1">⚡ SUGGESTED ACTION</p>
        <p className="text-xs text-yellow-300 font-medium leading-relaxed">{cfg.action}</p>
      </div>
    </div>
  );
}
