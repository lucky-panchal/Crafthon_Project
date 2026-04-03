import { useState, useCallback } from "react";
import useAlertStore      from "../store/useAlertStore";
import useSignalStore     from "../store/useSignalStore";
import useSimulationStore from "../store/useSimulationStore";

const RISK_COLOR = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#22c55e" };

const RANGES = [
  { label: "Last 5 min",   value: 5  },
  { label: "Last 10 min",  value: 10 },
  { label: "Last 15 min",  value: 15 },
  { label: "Last 30 min",  value: 30 },
  { label: "Last 1 hr",    value: 60 },
  { label: "Full session", value: 0  },
];

function filterByRange(alerts, minutes) {
  if (!minutes) return alerts;
  const cutoff = Date.now() - minutes * 60 * 1000;
  return alerts.filter((a) => new Date(a.timestamp).getTime() >= cutoff);
}

// ── PDF via Python backend (reportlab) ────────────────────────────────────────
async function exportPDF({ rangeLabel, mode, totalAlerts, alerts, snr, packetLoss, packetRate }) {
  const res = await fetch("http://localhost:8000/report/pdf", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rangeLabel,
      mode,
      totalAlerts,
      alerts: alerts.map((a) => ({
        type:       a.type,
        risk:       a.risk,
        confidence: a.confidence,
        reason:     a.reason,
        timestamp:  a.timestamp,
        count:      a.count ?? 1,
      })),
      signal: { snr, packetLoss, packetRate },
    }),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `RAKSHA_Report_${rangeLabel.replace(/ /g, "_")}_${Date.now()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ReportPage({ onNavigate }) {
  const alerts      = useAlertStore((s) => s.alerts);
  const totalAlerts = useAlertStore((s) => s.totalAlerts);
  const snr         = useSignalStore((s) => s.snr);
  const packetLoss  = useSignalStore((s) => s.packetLoss);
  const packetRate  = useSignalStore((s) => s.packetRate);
  const mode        = useSimulationStore((s) => s.mode);

  const [rangeIdx,  setRangeIdx]  = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState("");

  const range          = RANGES[rangeIdx];
  const filteredAlerts = filterByRange(alerts, range.value);
  const highCount      = filteredAlerts.filter((a) => a.risk === "HIGH").length;
  const medCount       = filteredAlerts.filter((a) => a.risk === "MEDIUM").length;
  const threatTypes    = [...new Set(filteredAlerts.map((a) => a.type))];
  const now            = new Date().toLocaleString();

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportErr("");
    try {
      await exportPDF({ rangeLabel: range.label, mode, totalAlerts, alerts: filteredAlerts, snr, packetLoss, packetRate });
    } catch (err) {
      setExportErr(err.message ?? "Export failed");
      setTimeout(() => setExportErr(""), 4000);
    } finally {
      setExporting(false);
    }
  }, [range, filteredAlerts, snr, packetLoss, packetRate, mode, totalAlerts]);

  return (
    <div className="flex flex-col gap-5 max-w-4xl mx-auto py-6 px-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-8 rounded-full bg-cyan-500 shadow-[0_0_12px_#06b6d4]" />
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tight">Session Report</h1>
            <p className="text-slate-500 text-sm">Generated {now}</p>
          </div>
        </div>
        <button onClick={() => onNavigate("dashboard")} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1E2A3A] text-slate-400 hover:text-white hover:border-slate-500 text-sm transition-all">
          ← Dashboard
        </button>
      </div>

      {/* Range selector + Export */}
      <div className="glass rounded-2xl border border-[#1E2A3A] p-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-400 font-medium shrink-0">Report Range:</span>
        <div className="flex flex-wrap gap-2 flex-1">
          {RANGES.map((r, i) => (
            <button
              key={r.value}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                rangeIdx === i
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                  : "bg-transparent border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {exportErr && (
            <span className="text-[11px] text-red-400 border border-red-500/30 bg-red-500/10 px-2 py-1 rounded-lg">
              {exportErr}
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-sm font-semibold hover:bg-cyan-500/20 hover:border-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting
              ? <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              : <span>⬇</span>
            }
            {exporting ? "Generating…" : "Export PDF"}
          </button>
        </div>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total (session)",   value: totalAlerts,           color: "#ef4444" },
          { label: `In ${range.label}`, value: filteredAlerts.length, color: "#3b82f6" },
          { label: "HIGH Risk",         value: highCount,             color: "#ef4444" },
          { label: "MEDIUM Risk",       value: medCount,              color: "#f59e0b" },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass rounded-2xl border border-[#1E2A3A] p-4 flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</span>
            <span className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Signal snapshot */}
      <div className="glass rounded-2xl border border-[#1E2A3A] p-5 flex flex-col gap-3">
        <h3 className="text-white font-semibold text-sm">Current Signal Snapshot</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "SNR",         value: `${snr} dB`,        color: snr < 15 ? "#ef4444" : "#22c55e" },
            { label: "Packet Loss", value: `${packetLoss}%`,   color: packetLoss > 20 ? "#ef4444" : "#22c55e" },
            { label: "Packet Rate", value: `${packetRate} pps`,color: "#3b82f6" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</span>
              <span className="text-lg font-bold tabular-nums" style={{ color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Threat types */}
      {threatTypes.length > 0 && (
        <div className="glass rounded-2xl border border-[#1E2A3A] p-5 flex flex-col gap-3">
          <h3 className="text-white font-semibold text-sm">Detected Threat Types — {range.label}</h3>
          <div className="flex flex-wrap gap-2">
            {threatTypes.map((t) => (
              <span key={t} className="px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold">
                {t?.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Alert log */}
      <div className="glass rounded-2xl border border-[#1E2A3A] p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Alert Log — {range.label}</h3>
          <span className="text-[10px] text-slate-500">{filteredAlerts.length} alerts</span>
        </div>
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2">
            <span className="text-slate-500 text-sm">No alerts in this time range</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#1E2A3A transparent" }}>
            {filteredAlerts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#0d1220]/60 border border-[#1a2535]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: RISK_COLOR[a.risk] ?? "#94a3b8" }} />
                <span className="text-white text-xs font-semibold flex-1">{a.type?.replace(/_/g, " ")}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ color: RISK_COLOR[a.risk], borderColor: `${RISK_COLOR[a.risk]}40`, background: `${RISK_COLOR[a.risk]}15` }}>{a.risk}</span>
                <span className="text-[10px] text-slate-500 tabular-nums">{a.confidence}%</span>
                <span className="text-[10px] text-slate-600 tabular-nums">{new Date(a.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
