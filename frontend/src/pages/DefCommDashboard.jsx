import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ResponsiveContainer,
} from "recharts";

import StatusBadge         from "../components/StatusBadge";
import ChartCard           from "../components/ChartCard";
import AlertPanel          from "../components/AlertPanel";
import DetectionBanner     from "../components/DetectionBanner";
import ControlPanel        from "../components/ControlPanel.jsx";
import ConfidenceMeter     from "../components/ConfidenceMeter";
import LogsPanel           from "../components/LogsPanel";
import Sidebar             from "../components/Sidebar";
import AuthModal           from "../components/AuthModal";
import SystemStatusBar     from "../components/SystemStatusBar";
import CriticalAlertBanner from "../components/CriticalAlertBanner";
import ExplainPanel        from "../components/ExplainPanel";
import ModelStats          from "../components/ModelStats";
import Timeline            from "../components/Timeline";

import { useState }                            from "react";
import { useWebSocket }                        from "../hooks/useWebSocket";
import { useDetectionSocket }                  from "../hooks/useDetectionSocket";
import { useSiren }                            from "../hooks/useSiren";
import { DetectionProvider, useDetection }     from "../context/DetectionContext";
import useSimulationStore                      from "../store/useSimulationStore";
import { ToastProvider }                       from "../components/Toast";
import DatasetUploader                         from "../components/DatasetUploader";

import JammingPage  from "./JammingPage";
import SpoofingPage from "./SpoofingPage";
import VisualsPage  from "./VisualsPage";
import HistoryPage  from "./HistoryPage";
import ReportPage   from "./ReportPage";
import RulesPage    from "./RulesPage";

// ── Mode visuals ──────────────────────────────────────────────────────────────
function useModeVisuals(mode) {
  switch (mode) {
    case "JAMMING":  return { overlayClass: "overlay-jamming",  chartClass: "chart-jamming",  snrColor: "#ef4444", badgeStatus: "jamming",  badgeLabel: "JAMMING",  isThreat: true  };
    case "SPOOFING": return { overlayClass: "overlay-spoofing", chartClass: "chart-spoofing", snrColor: "#f59e0b", badgeStatus: "spoofing", badgeLabel: "SPOOFING", isThreat: true  };
    default:         return { overlayClass: "",                 chartClass: "chart-normal",   snrColor: "#22c55e", badgeStatus: "normal",   badgeLabel: "Normal",   isThreat: false };
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

// ── Stat card — clickable ─────────────────────────────────────────────────────
function StatCard({ label, value, color, sub, icon, delay = "", onClick }) {
  return (
    <div
      onClick={onClick}
      className={`card px-4 py-4 sm:px-5 sm:py-5 flex flex-col gap-2 fade-up ${delay} transition-all duration-200 hover:scale-[1.02] ${onClick ? "cursor-pointer hover:border-slate-500 hover:shadow-lg" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-widest font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-base opacity-60">{icon}</span>}
          {onClick && <span className="text-[9px] text-slate-600">↗</span>}
        </div>
      </div>
      <span className="text-xl sm:text-2xl font-bold tabular-nums transition-all duration-500 leading-none" style={{ color }}>
        {value}
      </span>
      <span className="text-[10px] sm:text-xs text-slate-600">{sub}</span>
    </div>
  );
}

// ── Detection stat card ───────────────────────────────────────────────────────
function DetectionStatCard({ onNavigate }) {
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
      onClick={() => onNavigate("history")}
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
  const [authModal,  setAuthModal]  = useState(null);

  const mode = useSimulationStore((s) => s.mode);
  const { overlayClass, chartClass, snrColor, badgeStatus, badgeLabel, isThreat } = useModeVisuals(mode);

  const packetRate = latest?.packetRate ?? null;
  const snr        = latest?.snr        ?? null;
  const snrColor_  = snr !== null && snr < 15 ? "#ef4444" : snr !== null && snr < 20 ? "#f59e0b" : "#22c55e";

  const sirenBg     = isThreat ? "bg-[#0D0608]" : "bg-[#080C14]";
  const sirenHeader = isThreat ? "bg-[#1a0608]/95 border-red-900/60" : "bg-[#0D1220]/95 border-[#1a2535]";

  // ── Page router ───────────────────────────────────────────────────────────
  const pageContent = (() => {
    switch (activePage) {
      case "jamming":  return <JammingPage  onNavigate={setActivePage} />;
      case "spoofing": return <SpoofingPage onNavigate={setActivePage} />;
      case "visuals":  return <VisualsPage  onNavigate={setActivePage} />;
      case "history":  return <HistoryPage  onNavigate={setActivePage} />;
      case "report":   return <ReportPage   onNavigate={setActivePage} />;
      case "rules":    return <RulesPage    onNavigate={setActivePage} />;
      default:         return null;
    }
  })();

  return (
    <div className={`relative min-h-screen ${sirenBg} text-white transition-colors duration-700`}>

      {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />}

      <Sidebar activePage={activePage} onNavigate={setActivePage} onAuthOpen={setAuthModal} />

      <div style={{ marginLeft: "200px" }}>
        <SystemStatusBar />
        <CriticalAlertBanner />
      </div>

      {/* Camo bg layers */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" style={{ opacity: 0.55, backgroundImage: ["radial-gradient(ellipse 200px 140px at 8%  12%,  #3a4f1a 0%, transparent 65%)","radial-gradient(ellipse 160px 200px at 22% 45%,  #1e2d0e 0%, transparent 65%)","radial-gradient(ellipse 240px 120px at 40% 8%,   #2e4015 0%, transparent 65%)","radial-gradient(ellipse 140px 180px at 58% 52%,  #3a4f1a 0%, transparent 65%)","radial-gradient(ellipse 190px 110px at 73% 22%,  #1e2d0e 0%, transparent 65%)","radial-gradient(ellipse 170px 150px at 87% 68%,  #2e4015 0%, transparent 65%)","radial-gradient(ellipse 220px 160px at 12% 78%,  #3a4f1a 0%, transparent 65%)","radial-gradient(ellipse 130px 190px at 48% 88%,  #1e2d0e 0%, transparent 65%)"].join(","), backgroundSize: "800px 800px", backgroundRepeat: "repeat" }} />
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" style={{ opacity: 0.35, backgroundImage: ["radial-gradient(ellipse 80px 60px at 15% 30%, #0d1a06 0%, transparent 80%)","radial-gradient(ellipse 60px 90px at 38% 65%, #0d1a06 0%, transparent 80%)","radial-gradient(ellipse 100px 50px at 62% 35%, #0d1a06 0%, transparent 80%)","radial-gradient(ellipse 70px 80px at 82% 55%, #0d1a06 0%, transparent 80%)"].join(","), backgroundSize: "800px 800px", backgroundRepeat: "repeat" }} />
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" style={{ opacity: 0.22, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='70'%3E%3Cpath d='M20 0 L40 11 L40 35 L20 46 L0 35 L0 11 Z' fill='none' stroke='%23556b2f' stroke-width='0.8'/%3E%3C/svg%3E")`, backgroundSize: "40px 70px" }} />

      {isThreat && <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 30%, #ef444408 100%)", animation: "sirenPulse 1s ease-in-out infinite" }} aria-hidden="true" />}
      {overlayClass && <div className={`fixed inset-0 z-0 ${overlayClass}`} aria-hidden="true" />}

      {/* Header — glass */}
      <header
        className={`glass relative z-20 border-b backdrop-blur-xl sticky top-0 transition-colors duration-700 ${isThreat ? "border-red-900/40" : ""}`}
        style={{ marginLeft: "200px" }}
      >
        <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">

          {/* Left — brand */}
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

          {/* Center — Upload Dataset */}
          <div className="flex-1 flex justify-center">
            <DatasetUploader />
          </div>

          {/* Right — badges */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="text-[10px] text-slate-500 hidden md:block tabular-nums">{lastUpdated}</span>
            <ConnBadge connStatus={connStatus} />
            <StatusBadge status={badgeStatus} label={badgeLabel} />
          </div>
        </div>
        <DetectionBanner />
      </header>

      {/* Main */}
      <main className="relative z-10 px-2 sm:px-3 py-4 flex flex-col gap-3" style={{ marginLeft: "200px" }}>

        {/* ── Non-dashboard pages ── */}
        {pageContent ? pageContent : (
          <>
            {/* Row 1 — stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Packet Rate" value={packetRate !== null ? `${packetRate}` : "--"} color={isThreat ? "#ef4444" : "#3b82f6"} sub="packets / sec"   icon="📶" delay="stagger-1" onClick={() => setActivePage("visuals")} />
              <StatCard label="Signal SNR"  value={snr !== null ? `${snr} dB` : "--"}            color={snrColor_}                        sub="signal-to-noise" icon="📡" delay="stagger-2" onClick={() => setActivePage(mode === "JAMMING" ? "jamming" : "visuals")} />
              <StatCard label="Data Points" value={history.length}                               color={isThreat ? "#ef4444" : "#a855f7"} sub="rolling window"  icon="📊" delay="stagger-3" onClick={() => setActivePage("visuals")} />
              <DetectionStatCard onNavigate={setActivePage} />
            </div>

            {/* Row 2 — chart + alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 fade-up stagger-2">
              <div className="lg:col-span-2 cursor-pointer" onClick={() => setActivePage("visuals")}>
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
                  <div className="flex flex-wrap gap-2 sm:gap-3 pt-3 border-t border-[#1a2535]">
                    {[
                      { label: "Packet Rate", value: packetRate ?? "--", unit: "pps", color: "#3b82f6",  bg: "bg-blue-500/10 border-blue-500/20" },
                      { label: "SNR",         value: snr ?? "--",        unit: "dB",  color: snrColor_,  bg: "bg-emerald-500/10 border-emerald-500/20" },
                      { label: "Status",      value: status,             unit: "",    color: status === "critical" ? "#ef4444" : status === "warning" ? "#f59e0b" : "#22c55e", bg: "bg-slate-500/10 border-slate-500/20" },
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

              {/* Alert panel → history */}
              <div className="lg:col-span-1 cursor-pointer" onClick={() => setActivePage("history")}>
                <AlertPanel />
              </div>
            </div>

            {/* Row 3 — ExplainPanel + ModelStats → report */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 fade-up stagger-3">
              <div className="cursor-pointer" onClick={() => setActivePage("report")}><ExplainPanel /></div>
              <div className="cursor-pointer" onClick={() => setActivePage("report")}><ModelStats /></div>
            </div>

            {/* Row 4 — ConfidenceMeter + ControlPanel */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 fade-up stagger-3">
              <div className="cursor-pointer" onClick={() => setActivePage(mode === "JAMMING" ? "jamming" : mode === "SPOOFING" ? "spoofing" : "visuals")}>
                <ConfidenceMeter />
              </div>
              <ControlPanel />
            </div>

            {/* Row 5 — Timeline + LogsPanel → history */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 fade-up stagger-4">
              <div className="cursor-pointer" onClick={() => setActivePage("history")}><Timeline /></div>
              <div className="cursor-pointer" onClick={() => setActivePage("history")}><LogsPanel /></div>
            </div>

            <p className="text-center text-[10px] sm:text-xs text-slate-700 pb-4">
              RAKSHA · AI Threat Engine v1.0 · Real-Time Signal Defence System
            </p>
          </>
        )}
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
