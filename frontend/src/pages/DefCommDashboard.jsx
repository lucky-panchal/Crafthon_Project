import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ResponsiveContainer,
} from "recharts";

import StatusBadge      from "../components/StatusBadge";
import ChartCard        from "../components/ChartCard";
import AlertPanel       from "../components/AlertPanel";
import DetectionBanner  from "../components/DetectionBanner";
import ControlPanel     from "../components/ControlPanel.jsx";
import ConfidenceMeter  from "../components/ConfidenceMeter";
import LogsPanel        from "../components/LogsPanel";

import { useWebSocket }       from "../hooks/useWebSocket";
import { useDetectionSocket } from "../hooks/useDetectionSocket";
import { DetectionProvider, useDetection } from "../context/DetectionContext";
import useSimulationStore from "../store/useSimulationStore";
import { ToastProvider } from "../components/Toast";

// ── Mode-derived visual config ────────────────────────────────────────────────

function useModeVisuals(mode) {
  switch (mode) {
    case "JAMMING":  return {
      overlayClass:  "overlay-jamming",
      chartClass:    "chart-jamming",
      snrColor:      "#ef4444",
      badgeStatus:   "jamming",
      badgeLabel:    "JAMMING",
    };
    case "SPOOFING": return {
      overlayClass:  "overlay-spoofing",
      chartClass:    "chart-spoofing",
      snrColor:      "#f59e0b",
      badgeStatus:   "spoofing",
      badgeLabel:    "SPOOFING",
    };
    default: return {
      overlayClass:  "",
      chartClass:    "chart-normal",
      snrColor:      "#10b981",
      badgeStatus:   "normal",
      badgeLabel:    "Normal",
    };
  }
}

// ── Full-screen mode overlay ──────────────────────────────────────────────────

function ModeOverlay({ overlayClass }) {
  if (!overlayClass) return null;
  return (
    <div
      className={`fixed inset-0 z-0 ${overlayClass}`}
      aria-hidden="true"
    />
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0B0F1A] border border-[#1E2A3A] rounded-xl px-4 py-3 shadow-2xl text-xs">
      <p className="text-gray-400 mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="font-bold" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub, animate }) {
  return (
    <div className={`rounded-2xl border border-[#1E2A3A] bg-[#121826] px-5 py-4 flex flex-col gap-1 ${animate ? "fade-in" : ""}`}>
      <span className="text-xs text-gray-500 uppercase tracking-widest">{label}</span>
      <span className="text-2xl font-bold tabular-nums transition-all duration-500" style={{ color }}>
        {value}
      </span>
      <span className="text-[11px] text-gray-600">{sub}</span>
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
      animate={isAlert}
    />
  );
}

// ── Connection badge ──────────────────────────────────────────────────────────
function ConnBadge({ connStatus }) {
  const cfg = {
    connected:    { dot: "bg-green-400",               ring: "border-green-500/30",  bg: "bg-green-500/10",  text: "text-green-400",  label: "Connected"   },
    connecting:   { dot: "bg-yellow-400 animate-ping", ring: "border-yellow-500/30", bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Connecting…" },
    disconnected: { dot: "bg-gray-400",                ring: "border-gray-500/30",   bg: "bg-gray-500/10",   text: "text-gray-400",   label: "Disconnected"},
    error:        { dot: "bg-red-500",                 ring: "border-red-500/30",    bg: "bg-red-500/10",    text: "text-red-400",    label: "WS Error"    },
  }[connStatus] ?? {};
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${cfg.bg} ${cfg.ring} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Live stats panel ──────────────────────────────────────────────────────────
function LiveStatsPanel({ packetRate, snr, lastUpdated, status }) {
  const snrColor = status === "critical" ? "#ef4444" : status === "warning" ? "#f59e0b" : "#10b981";
  return (
    <div className="rounded-2xl border border-[#1E2A3A] bg-[#121826] px-6 py-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
          <h2 className="text-white font-semibold text-base tracking-tight">Live Signal Stats</h2>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Packet Rate</span>
          <span className="text-xl font-bold text-blue-400 tabular-nums transition-all duration-300">{packetRate ?? "--"}</span>
          <span className="text-[10px] text-gray-600">pps</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">SNR</span>
          <span className="text-xl font-bold tabular-nums transition-all duration-300" style={{ color: snrColor }}>{snr ?? "--"}</span>
          <span className="text-[10px] text-gray-600">dB</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Last Updated</span>
          <span className="text-sm font-medium text-gray-300 tabular-nums">{lastUpdated}</span>
          <span className="text-[10px] text-gray-600">local time</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 pt-1 border-t border-[#1E2A3A]">
        {[
          { label: "Normal",   range: "SNR ≥ 20",  color: "#10b981" },
          { label: "Warning",  range: "SNR 15–19", color: "#f59e0b" },
          { label: "Critical", range: "SNR < 15",  color: "#ef4444" },
        ].map(({ label, range, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span style={{ color }}>{label}</span>
            <span>({range})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inner dashboard ───────────────────────────────────────────────────────────
function DashboardInner() {
  const { history, latest, status, connStatus, lastUpdated } = useWebSocket();
  useDetectionSocket();

  // Simulation mode from Zustand — drives all visual feedback
  const mode = useSimulationStore((s) => s.mode);
  const { overlayClass, chartClass, snrColor, badgeStatus, badgeLabel } = useModeVisuals(mode);

  const packetRate = latest?.packetRate ?? null;
  const snr        = latest?.snr        ?? null;

  return (
    // relative so the fixed overlay sits behind content but inside the tree
    <div className="relative min-h-screen bg-[#0B0F1A] text-white">

      {/* ── Full-screen mode overlay (z-0, pointer-events-none) ── */}
      <ModeOverlay overlayClass={overlayClass} />

      {/* ── Sticky header (z-20 sits above overlay) ── */}
      <header className="relative z-20 border-b border-[#1E2A3A] bg-[#0D1220]/90 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-[0_0_12px_#3b82f6]">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">DefComm Shield</h1>
              <p className="text-[10px] text-gray-500 leading-none">Real-Time Communication Monitor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:block">Updated: {lastUpdated}</span>
            <ConnBadge connStatus={connStatus} />
            {/* Mode-aware status badge — blinks on JAMMING / SPOOFING */}
            <StatusBadge status={badgeStatus} label={badgeLabel} />
          </div>
        </div>
        <DetectionBanner />
      </header>

      {/* ── Main content (z-10 sits above overlay) ── */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Row 1 — stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Packet Rate"
            value={packetRate !== null ? `${packetRate} pps` : "--"}
            color="#3b82f6"
            sub="packets / sec"
          />
          <StatCard
            label="Signal (SNR)"
            value={snr !== null ? `${snr} dB` : "--"}
            color={snr !== null && snr < 15 ? "#ef4444" : snr !== null && snr < 20 ? "#f59e0b" : "#10b981"}
            sub="signal-to-noise"
          />
          <StatCard label="Data Points" value={history.length} color="#8b5cf6" sub="rolling window" />
          <DetectionStatCard />
        </div>

        {/* Row 2 — chart (2/3) + alert panel (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {/* ChartCard gets mode-specific glow border via chartClass */}
            <ChartCard
              title="Signal Traffic Overview"
              badge={<StatusBadge status={badgeStatus} label="Live" />}
              className={chartClass}
            >
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={history} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={{ stroke: "#1E2A3A" }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 12, fontSize: 11 }} formatter={(v) => <span style={{ color: "#9ca3af" }}>{v}</span>} />

                  {/* Packet Rate — blue always */}
                  <Line
                    type="monotone" dataKey="packetRate" name="Packet Rate"
                    stroke="#3b82f6" strokeWidth={2.5} dot={false}
                    activeDot={{ r: 5, fill: "#3b82f6", strokeWidth: 0 }}
                    isAnimationActive animationDuration={400} animationEasing="ease-out"
                    style={{ filter: "drop-shadow(0 0 4px #3b82f6)" }}
                  />

                  {/* SNR — color driven by mode: red=jamming, amber=spoofing, green=normal */}
                  <Line
                    type="monotone" dataKey="snr" name="SNR (dB)"
                    stroke={snrColor} strokeWidth={2.5} dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    isAnimationActive animationDuration={400} animationEasing="ease-out"
                    style={{ filter: `drop-shadow(0 0 6px ${snrColor})` }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <div className="lg:col-span-1">
            <AlertPanel />
          </div>
        </div>

        {/* Row 3 — confidence meter + control panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ConfidenceMeter />
          <ControlPanel />
        </div>

        {/* Row 4 — logs */}
        <LogsPanel />

        {/* Row 5 — live stats */}
        <LiveStatsPanel packetRate={packetRate} snr={snr} lastUpdated={lastUpdated} status={status} />

        <p className="text-center text-xs text-gray-600 pb-4">
          DefComm Shield · Dual WebSocket · Rule Engine + Isolation Forest · localhost:8000
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
