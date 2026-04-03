import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ResponsiveContainer,
} from "recharts";

import StatusBadge     from "../components/StatusBadge";
import ChartCard       from "../components/ChartCard";
import AlertPanel      from "../components/AlertPanel";
import DetectionBanner from "../components/DetectionBanner";
import ControlPanel    from "../components/ControlPanel.jsx";
import ConfidenceMeter from "../components/ConfidenceMeter";
import LogsPanel       from "../components/LogsPanel";

import { useWebSocket }       from "../hooks/useWebSocket";
import { useDetectionSocket } from "../hooks/useDetectionSocket";
import { DetectionProvider, useDetection } from "../context/DetectionContext";
import useSimulationStore from "../store/useSimulationStore";
import { ToastProvider }  from "../components/Toast";

// ── Mode visuals ──────────────────────────────────────────────────────────────
function useModeVisuals(mode) {
  switch (mode) {
    case "JAMMING":  return { overlayClass: "overlay-jamming",  chartClass: "chart-jamming",  snrColor: "#ef4444", badgeStatus: "jamming",  badgeLabel: "JAMMING"  };
    case "SPOOFING": return { overlayClass: "overlay-spoofing", chartClass: "chart-spoofing", snrColor: "#f59e0b", badgeStatus: "spoofing", badgeLabel: "SPOOFING" };
    default:         return { overlayClass: "",                 chartClass: "chart-normal",   snrColor: "#22c55e", badgeStatus: "normal",   badgeLabel: "Normal"   };
  }
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0D1220] border border-[#1a2535] rounded-xl px-4 py-3 shadow-2xl text-xs backdrop-blur-sm">
      <p className="text-slate-400 mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="font-bold tabular-nums" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub, icon, delay = "" }) {
  return (
    <div className={`card px-4 py-4 sm:px-5 sm:py-5 flex flex-col gap-2 fade-up ${delay} hover:scale-[1.02] transition-transform duration-200`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-widest font-medium">{label}</span>
        {icon && <span className="text-base opacity-60">{icon}</span>}
      </div>
      <span className="text-xl sm:text-2xl font-bold tabular-nums transition-all duration-500 leading-none" style={{ color }}>
        {value}
      </span>
      <span className="text-[10px] sm:text-xs text-slate-600">{sub}</span>
    </div>
  );
}

// ── Detection stat card ───────────────────────────────────────────────────────
function DetectionStatCard() {
  const { latestDetection, totalAlerts } = useDetection();
  const isAlert = latestDetection?.status === "ALERT";
  const risk    = latestDetection?.risk ?? "LOW";
  const color   = risk === "HIGH" ? "#ef4444" : risk === "MEDIUM" ? "#f59e0b" : "#22c55e";
  return (
    <StatCard
      label="Threat Status"
      value={isAlert ? (latestDetection?.type?.replace(/_/g, " ") ?? "ALERT") : "NORMAL"}
      color={color}
      sub={isAlert ? `${totalAlerts} alert${totalAlerts !== 1 ? "s" : ""} this session` : "no anomalies"}
      icon={isAlert ? "🚨" : "🛡️"}
      delay="stagger-4"
    />
  );
}

// ── Connection badge ──────────────────────────────────────────────────────────
function ConnBadge({ connStatus }) {
  const cfg = {
    connected:    { dot: "bg-green-400",               ring: "border-green-500/30",  bg: "bg-green-500/10",  text: "text-green-400",  label: "Live"         },
    connecting:   { dot: "bg-yellow-400 animate-ping", ring: "border-yellow-500/30", bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Connecting…"  },
    disconnected: { dot: "bg-slate-500",               ring: "border-slate-500/30",  bg: "bg-slate-500/10",  text: "text-slate-400",  label: "Disconnected" },
    error:        { dot: "bg-red-500",                 ring: "border-red-500/30",    bg: "bg-red-500/10",    text: "text-red-400",    label: "WS Error"     },
  }[connStatus] ?? {};
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${cfg.bg} ${cfg.ring} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      <span className="hidden sm:inline">{cfg.label}</span>
    </span>
  );
}

// ── Inner dashboard ───────────────────────────────────────────────────────────
function DashboardInner() {
  const { history, latest, status, connStatus, lastUpdated } = useWebSocket();
  useDetectionSocket();

  const mode = useSimulationStore((s) => s.mode);
  const { overlayClass, chartClass, snrColor, badgeStatus, badgeLabel } = useModeVisuals(mode);

  const packetRate = latest?.packetRate ?? null;
  const snr        = latest?.snr        ?? null;
  const snrColor_  = snr !== null && snr < 15 ? "#ef4444" : snr !== null && snr < 20 ? "#f59e0b" : "#22c55e";

  return (
    <div className="relative min-h-screen bg-[#080C14] text-white">

      {/* Mode overlay */}
      {overlayClass && <div className={`fixed inset-0 z-0 ${overlayClass}`} aria-hidden="true" />}

      {/* ── Header ── */}
      <header className="relative z-20 border-b border-[#1a2535] bg-[#0D1220]/95 backdrop-blur-md sticky top-0">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">

          {/* Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-[0_0_16px_#3b82f660] shrink-0">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 sm:w-5 sm:h-5 text-white" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white leading-tight">DefComm Shield</h1>
              <p className="text-[9px] sm:text-[10px] text-slate-500 leading-none hidden sm:block">Real-Time Threat Monitor</p>
            </div>
          </div>

          {/* Right badges */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="text-[10px] text-slate-500 hidden md:block tabular-nums">{lastUpdated}</span>
            <ConnBadge connStatus={connStatus} />
            <StatusBadge status={badgeStatus} label={badgeLabel} />
          </div>
        </div>
        <DetectionBanner />
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 max-w-screen-xl mx-auto px-4 sm:px-6 py-5 sm:py-8 flex flex-col gap-4 sm:gap-6">

        {/* Row 1 — stat cards (2 col mobile, 4 col desktop) */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Packet Rate" value={packetRate !== null ? `${packetRate}` : "--"} color="#3b82f6" sub="packets / sec" icon="📶" delay="stagger-1" />
          <StatCard label="Signal SNR"  value={snr !== null ? `${snr} dB` : "--"}            color={snrColor_} sub="signal-to-noise" icon="📡" delay="stagger-2" />
          <StatCard label="Data Points" value={history.length}                               color="#a855f7" sub="rolling window"  icon="📊" delay="stagger-3" />
          <DetectionStatCard />
        </div>

        {/* Row 2 — chart (2/3) + alerts (1/3) side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 fade-up stagger-2">
          <div className="lg:col-span-2">
          <ChartCard title="Signal Traffic Overview" badge={<StatusBadge status={badgeStatus} label="Live" />} className={chartClass}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={history} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradSNR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={snrColor} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={snrColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 9 }} axisLine={{ stroke: "#1a2535" }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#475569", fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ paddingTop: 12, fontSize: 11 }} formatter={(v) => <span style={{ color: "#94a3b8" }}>{v}</span>} />
                <Area type="monotone" dataKey="packetRate" name="Packet Rate" stroke="#3b82f6" strokeWidth={2} fill="url(#gradPR)" dot={false} activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }} isAnimationActive={false} style={{ filter: "drop-shadow(0 0 4px #3b82f6)" }} />
                <Area type="monotone" dataKey="snr" name="SNR (dB)" stroke={snrColor} strokeWidth={2} fill="url(#gradSNR)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} style={{ filter: `drop-shadow(0 0 5px ${snrColor})` }} />
              </AreaChart>
            </ResponsiveContainer>

            {/* Live stat pills below chart */}
            <div className="flex flex-wrap gap-2 sm:gap-3 pt-3 border-t border-[#1a2535]">
              {[
                { label: "Packet Rate", value: packetRate ?? "--", unit: "pps", color: "#3b82f6", bg: "bg-blue-500/10 border-blue-500/20" },
                { label: "SNR",         value: snr ?? "--",         unit: "dB",  color: snrColor_, bg: "bg-emerald-500/10 border-emerald-500/20" },
                { label: "Status",      value: status,              unit: "",    color: status === "critical" ? "#ef4444" : status === "warning" ? "#f59e0b" : "#22c55e", bg: "bg-slate-500/10 border-slate-500/20" },
              ].map(({ label, value, unit, color, bg }) => (
                <div key={label} className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 ${bg}`}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[10px] sm:text-xs text-slate-400">{label}</span>
                  <span className="text-[10px] sm:text-xs font-bold tabular-nums" style={{ color }}>{value}{unit ? ` ${unit}` : ""}</span>
                </div>
              ))}
            </div>
          </ChartCard>
          </div>

          {/* Alert panel — right column */}
          <div className="lg:col-span-1">
            <AlertPanel />
          </div>
        </div>

        {/* Row 3 — confidence + control side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 fade-up stagger-3">
          <ConfidenceMeter />
          <ControlPanel />
        </div>

        {/* Row 4 — logs full width */}
        <div className="fade-up stagger-4">
          <LogsPanel />
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] sm:text-xs text-slate-700 pb-4">
          DefComm Shield · Dual WebSocket · Isolation Forest + Rule Engine · v1.0
        </p>
      </main>
    </div>
  );
}

export default function DefCommDashboard() {
  return (
    <DetectionProvider>
      <ToastProvider>
        <DashboardInner />
      </ToastProvider>
    </DetectionProvider>
  );
}
