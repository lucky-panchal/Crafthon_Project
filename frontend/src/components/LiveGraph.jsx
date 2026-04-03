/**
 * src/components/LiveGraph.jsx
 *
 * Real-time communication graph — Packet Rate + SNR over a 20-point rolling window.
 *
 * Data flow
 * ─────────
 *   useWebSocket() → history[]  (already capped at 20 by the hook)
 *   useMemo maps raw points → chart-ready shape, recomputes only when history ref changes
 *
 * Props
 * ─────
 *   history    — raw array from useWebSocket()
 *   latest     — last point, for live stat pills
 *   snrColor   — hex, driven by attack mode (green / amber / red)
 *   chartClass — CSS class for mode-aware glow border
 */

import { useMemo } from "react";
import {
  AreaChart, Area,
  XAxis, YAxis,
  Tooltip, Legend,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_POINTS   = 20;
const SNR_WARN     = 20;   // below → warning color
const SNR_CRIT     = 15;   // below → critical color

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0B0F1A] border border-[#1E2A3A] rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[160px]">
      <p className="text-gray-500 mb-2 font-medium tabular-nums">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-gray-400">{p.name}</span>
          </div>
          <span className="font-bold tabular-nums" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Legend formatter ──────────────────────────────────────────────────────────

function legendFormatter(value) {
  return <span style={{ color: "#9ca3af", fontSize: 11 }}>{value}</span>;
}

// ── Live stat pill ────────────────────────────────────────────────────────────

function StatPill({ label, value, unit, color, bgColor, borderColor }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-1.5 border"
      style={{ background: bgColor, borderColor }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>
        {value ?? "--"}{unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveGraph({ history = [], latest = null, snrColor = "#10b981", chartClass = "chart-normal" }) {

  // Map raw WS points → chart shape, capped at MAX_POINTS
  // useMemo: only recomputes when history array reference changes (set by useWebSocket on each frame)
  const chartData = useMemo(() => {
    const slice = history.slice(-MAX_POINTS);
    if (slice.length === 0) return [{ time: "--", packetRate: 0, snr: 0 }];
    return slice.map((p) => ({
      time:       p.time       ?? "--",
      packetRate: p.packetRate ?? 0,
      snr:        p.snr        ?? 0,
    }));
  }, [history]);

  // SNR threshold reference line color
  const snrWarnColor = "#f59e0b";
  const snrCritColor = "#ef4444";

  // Live values for stat pills
  const livePacketRate = latest?.packetRate ?? null;
  const liveSNR        = latest?.snr        ?? null;
  const livePacketLoss = latest?.packetLoss ?? null;

  // Packet loss color
  const lossColor = livePacketLoss > 10 ? "#ef4444" : livePacketLoss > 3 ? "#f59e0b" : "#22c55e";

  return (
    <div className={`rounded-2xl border border-[#1E2A3A] bg-[#121826] shadow-xl shadow-black/40 p-5 flex flex-col gap-4 ${chartClass}`}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-6 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" />
          <div>
            <h2 className="text-white font-bold text-base tracking-tight leading-tight">
              Live Communication Monitoring
            </h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Packet Rate &amp; SNR · rolling {MAX_POINTS}-point window
            </p>
          </div>
        </div>

        {/* Live indicator */}
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          LIVE
        </span>
      </div>

      {/* ── SVG gradient defs (outside Recharts so they persist) ── */}
      <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true">
        <defs>
          <linearGradient id="lgPacketRate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}    />
          </linearGradient>
          <linearGradient id="lgSNR" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={snrColor} stopOpacity={0.4} />
            <stop offset="100%" stopColor={snrColor} stopOpacity={0}   />
          </linearGradient>
        </defs>
      </svg>

      {/* ── Chart ── */}
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>

          <defs>
            {/* Inline defs for Recharts fill refs */}
            <linearGradient id="fillPR" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}   />
            </linearGradient>
            <linearGradient id="fillSNR" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={snrColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={snrColor} stopOpacity={0}    />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" vertical={false} />

          <XAxis
            dataKey="time"
            tick={{ fill: "#4b5563", fontSize: 9 }}
            axisLine={{ stroke: "#1E2A3A" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#4b5563", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "#1E2A3A", strokeWidth: 1 }}
          />

          <Legend
            wrapperStyle={{ paddingTop: 10 }}
            formatter={legendFormatter}
          />

          {/* SNR threshold reference lines */}
          <ReferenceLine y={SNR_WARN} stroke={snrWarnColor} strokeDasharray="4 3" strokeOpacity={0.4} />
          <ReferenceLine y={SNR_CRIT} stroke={snrCritColor} strokeDasharray="4 3" strokeOpacity={0.4} />

          {/* Packet Rate */}
          <Area
            type="monotone"
            dataKey="packetRate"
            name="Packet Rate"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#fillPR)"
            dot={false}
            activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
            isAnimationActive={true}
            animationDuration={400}
            animationEasing="ease-out"
            style={{ filter: "drop-shadow(0 0 5px #3b82f6)" }}
          />

          {/* SNR — color follows attack mode */}
          <Area
            type="monotone"
            dataKey="snr"
            name="SNR (dB)"
            stroke={snrColor}
            strokeWidth={2.5}
            fill="url(#fillSNR)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={true}
            animationDuration={400}
            animationEasing="ease-out"
            style={{ filter: `drop-shadow(0 0 5px ${snrColor})` }}
          />

        </AreaChart>
      </ResponsiveContainer>

      {/* ── Live stat pills ── */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-[#1E2A3A]">
        <StatPill
          label="Packet Rate"
          value={livePacketRate}
          unit="pps"
          color="#3b82f6"
          bgColor="rgba(59,130,246,0.08)"
          borderColor="rgba(59,130,246,0.2)"
        />
        <StatPill
          label="SNR"
          value={liveSNR}
          unit="dB"
          color={snrColor}
          bgColor={`${snrColor}14`}
          borderColor={`${snrColor}33`}
        />
        {livePacketLoss !== null && (
          <StatPill
            label="Packet Loss"
            value={typeof livePacketLoss === "number" ? livePacketLoss.toFixed(1) : livePacketLoss}
            unit="%"
            color={lossColor}
            bgColor={`${lossColor}14`}
            borderColor={`${lossColor}33`}
          />
        )}
        <span className="ml-auto text-[10px] text-gray-600 self-center tabular-nums">
          {chartData.length} / {MAX_POINTS} pts
        </span>
      </div>
    </div>
  );
}
