import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ResponsiveContainer,
} from "recharts";

import StatusBadge        from "../components/StatusBadge";
import ChartCard          from "../components/ChartCard";
import AlertPanel         from "../components/AlertPanel";
import DetectionBanner    from "../components/DetectionBanner";
import ControlPanel       from "../components/ControlPanel.jsx";
import ConfidenceMeter    from "../components/ConfidenceMeter";
import LogsPanel          from "../components/LogsPanel";
import Sidebar            from "../components/Sidebar";
import AuthModal          from "../components/AuthModal";
import SystemStatusBar    from "../components/SystemStatusBar";
import CriticalAlertBanner from "../components/CriticalAlertBanner";
import ExplainPanel       from "../components/ExplainPanel";
import ModelStats         from "../components/ModelStats";
import Timeline           from "../components/Timeline";

import { useState } from "react";
import { useWebSocket }        from "../hooks/useWebSocket";
import { useDetectionSocket }  from "../hooks/useDetectionSocket";
import { useSiren }            from "../hooks/useSiren";
import { DetectionProvider, useDetection } from "../context/DetectionContext";
import useSimulationStore from "../store/useSimulationStore";
import { ToastProvider }  from "../components/Toast";

// ── Mode visuals ──────────────────────────────────────────────────────────────
function useModeVisuals(mode) {
  switch (mode) {
    case "JAMMING":  return { overlayClass: "overlay-jamming",  chartClass: "chart-jamming",  snrColor: "#ef4444", badgeStatus: "jamming",  badgeLabel: "JAMMING",  isThreat: true,  threatColor: "#ef4444" };
    case "SPOOFING": return { overlayClass: "overlay-spoofing", chartClass: "chart-spoofing", snrColor: "#f59e0b", badgeStatus: "spoofing", badgeLabel: "SPOOFING", isThreat: true,  threatColor: "#ef4444" };
    default:         return { overlayClass: "",                 chartClass: "chart-normal",   snrColor: "#22c55e", badgeStatus: "normal",   badgeLabel: "Normal",   isThreat: false, threatColor: null        };
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
  useSiren();

  const [activePage, setActivePage] = useState("dashboard");
  const [authModal,  setAuthModal]  = useState(null); // "login" | "signup" | null

  const mode = useSimulationStore((s) => s.mode);
  const { overlayClass, chartClass, snrColor, badgeStatus, badgeLabel, isThreat } = useModeVisuals(mode);

  const packetRate = latest?.packetRate ?? null;
  const snr        = latest?.snr        ?? null;
  const snrColor_  = snr !== null && snr < 15 ? "#ef4444" : snr !== null && snr < 20 ? "#f59e0b" : "#22c55e";

  const sirenBg    = isThreat ? "bg-[#0D0608]" : "bg-[#080C14]";
  const sirenBorder = isThreat ? "border-red-900/60" : "border-[#1a2535]";
  const sirenHeader = isThreat ? "bg-[#1a0608]/95 border-red-900/60" : "bg-[#0D1220]/95 border-[#1a2535]";

  return (
    <div className={`relative min-h-screen ${sirenBg} text-white transition-colors duration-700`}>

      {/* Auth modal */}
      {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />}

      {/* Sidebar */}
      <Sidebar activePage={activePage} onNavigate={setActivePage} onAuthOpen={setAuthModal} />

      {/* System status bar + critical banner - full width above sidebar */}
      <div style={{ marginLeft: "200px" }}>
        <SystemStatusBar />
        <CriticalAlertBanner />
      </div>

      {/* ── Military camo layer 1 - large blobs ── */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" style={{
        opacity: 0.55,
        backgroundImage: [
          "radial-gradient(ellipse 200px 140px at 8%  12%,  #3a4f1a 0%, transparent 65%)",
          "radial-gradient(ellipse 160px 200px at 22% 45%,  #1e2d0e 0%, transparent 65%)",
          "radial-gradient(ellipse 240px 120px at 40% 8%,   #2e4015 0%, transparent 65%)",
          "radial-gradient(ellipse 140px 180px at 58% 52%,  #3a4f1a 0%, transparent 65%)",
          "radial-gradient(ellipse 190px 110px at 73% 22%,  #1e2d0e 0%, transparent 65%)",
          "radial-gradient(ellipse 170px 150px at 87% 68%,  #2e4015 0%, transparent 65%)",
          "radial-gradient(ellipse 220px 160px at 12% 78%,  #3a4f1a 0%, transparent 65%)",
          "radial-gradient(ellipse 130px 190px at 48% 88%,  #1e2d0e 0%, transparent 65%)",
          "radial-gradient(ellipse 180px 120px at 32% 58%,  #445c22 0%, transparent 65%)",
          "radial-gradient(ellipse 150px 140px at 68% 88%,  #2e4015 0%, transparent 65%)",
          "radial-gradient(ellipse 100px 80px  at 5%  48%,  #1e2d0e 0%, transparent 65%)",
          "radial-gradient(ellipse 90px  120px at 18% 92%,  #3a4f1a 0%, transparent 65%)",
          "radial-gradient(ellipse 120px 90px  at 53% 28%,  #445c22 0%, transparent 65%)",
          "radial-gradient(ellipse 80px  130px at 78% 8%,   #1e2d0e 0%, transparent 65%)",
          "radial-gradient(ellipse 110px 80px  at 92% 42%,  #3a4f1a 0%, transparent 65%)",
          "radial-gradient(ellipse 160px 100px at 62% 18%,  #2e4015 0%, transparent 65%)",
          "radial-gradient(ellipse 90px  150px at 35% 82%,  #445c22 0%, transparent 65%)",
          "radial-gradient(ellipse 140px 90px  at 82% 35%,  #1e2d0e 0%, transparent 65%)",
        ].join(","),
        backgroundSize: "800px 800px",
        backgroundRepeat: "repeat",
      }} />
      {/* ── Military camo layer 2 - dark patches ── */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" style={{
        opacity: 0.35,
        backgroundImage: [
          "radial-gradient(ellipse 80px 60px  at 15% 30%,  #0d1a06 0%, transparent 80%)",
          "radial-gradient(ellipse 60px 90px  at 38% 65%,  #0d1a06 0%, transparent 80%)",
          "radial-gradient(ellipse 100px 50px at 62% 35%,  #0d1a06 0%, transparent 80%)",
          "radial-gradient(ellipse 70px 80px  at 82% 55%,  #0d1a06 0%, transparent 80%)",
          "radial-gradient(ellipse 90px 60px  at 28% 80%,  #0d1a06 0%, transparent 80%)",
          "radial-gradient(ellipse 55px 75px  at 72% 78%,  #0d1a06 0%, transparent 80%)",
          "radial-gradient(ellipse 75px 55px  at 48% 18%,  #0d1a06 0%, transparent 80%)",
          "radial-gradient(ellipse 65px 85px  at 92% 22%,  #0d1a06 0%, transparent 80%)",
        ].join(","),
        backgroundSize: "800px 800px",
        backgroundRepeat: "repeat",
      }} />
      {/* ── Tactical hex grid ── */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" style={{
        opacity: 0.22,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='70'%3E%3Cpath d='M20 0 L40 11 L40 35 L20 46 L0 35 L0 11 Z' fill='none' stroke='%23556b2f' stroke-width='0.8'/%3E%3Cpath d='M20 46 L40 35 L40 58 L20 70 L0 58 L0 35 Z' fill='none' stroke='%23556b2f' stroke-width='0.8'/%3E%3C/svg%3E")`,
        backgroundSize: "40px 70px",
      }} />

      {/* Siren pulse overlay when threat active */}
      {isThreat && (
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, transparent 30%, #ef444408 100%)",
            animation: "sirenPulse 1s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
      )}

      {/* Mode overlay */}
      {overlayClass && <div className={`fixed inset-0 z-0 ${overlayClass}`} aria-hidden="true" />}

      {/* ── Header ── */}
      <header className={`relative z-20 border-b ${sirenHeader} backdrop-blur-md sticky top-0 transition-colors duration-700`} style={{ marginLeft: "200px" }}>
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">

          {/* Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-700 ${isThreat ? "bg-red-600 shadow-[0_0_20px_#ef444480]" : "bg-blue-600 shadow-[0_0_16px_#3b82f660]"}`}>
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 sm:w-5 sm:h-5 text-white" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white leading-tight">RAKSHA</h1>
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
      <main className="relative z-10 px-2 sm:px-3 py-4 flex flex-col gap-3" style={{ marginLeft: "200px" }}>

        {/* Row 1 — stat cards (2 col mobile, 4 col desktop) */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Packet Rate" value={packetRate !== null ? `${packetRate}` : "--"} color={isThreat ? "#ef4444" : "#3b82f6"} sub="packets / sec" icon="📶" delay="stagger-1" />
          <StatCard label="Signal SNR"  value={snr !== null ? `${snr} dB` : "--"}            color={snrColor_} sub="signal-to-noise" icon="📡" delay="stagger-2" />
          <StatCard label="Data Points" value={history.length}                               color={isThreat ? "#ef4444" : "#a855f7"} sub="rolling window"  icon="📊" delay="stagger-3" />
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

        {/* Row 3 - Explainable AI + Model Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 fade-up stagger-3">
          <ExplainPanel />
          <ModelStats />
        </div>

        {/* Row 4 — confidence + control side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 fade-up stagger-3">
          <ConfidenceMeter />
          <ControlPanel />
        </div>

        {/* Row 5 — Timeline + Detection Log */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 fade-up stagger-4">
          <Timeline />
          <LogsPanel />
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] sm:text-xs text-slate-700 pb-4">
          RAKSHA · AI Threat Engine v1.0 · Real-Time Signal Defence System
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
