/**
 * src/components/SignalGraph.jsx
 *
 * Real-time line chart — SNR (dB) and Packet Loss (%) over 20 points.
 * Data source: useSignalHistory() from useSignalStore.
 *
 * Anomaly highlighting
 * ────────────────────
 *   SNR drop    → SNR < SNR_CRITICAL (15 dB)  → red dot on that point
 *   Loss spike  → Loss > LOSS_CRITICAL (25 %)  → red dot on that point
 *   Both use a custom dot renderer — normal points are invisible (dot={false}),
 *   anomaly points render as a filled red circle with a glow shadow.
 */

import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useSignalHistory } from "../store/useSignalStore";
import { SNR_CRITICAL, SNR_WARNING, LOSS_CRITICAL, LOSS_WARNING } from "../utils/signalUtils";

// ── Colors ────────────────────────────────────────────────────────────────────

const COLOR_SNR      = "#3b82f6";   // blue
const COLOR_LOSS     = "#f59e0b";   // amber
const COLOR_ANOMALY  = "#ef4444";   // red
const COLOR_GRID     = "#1E2A3A";
const COLOR_AXIS     = "#4b5563";

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-[#0B0F1A] border border-[#1E2A3A] rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[160px]">
      <p className="text-gray-500 mb-2 tabular-nums font-medium">{label}</p>
      {payload.map((p) => {
        const isAnomaly =
          (p.dataKey === "snr"        && p.value < SNR_CRITICAL)  ||
          (p.dataKey === "packetLoss" && p.value > LOSS_CRITICAL);
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="text-gray-400">{p.name}</span>
            </div>
            <span
              className="font-bold tabular-nums"
              style={{ color: isAnomaly ? COLOR_ANOMALY : p.color }}
            >
              {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
              {p.dataKey === "snr" ? " dB" : " %"}
              {isAnomaly && " ⚠"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Custom dot — only renders on anomaly points ───────────────────────────────

function AnomalyDot({ cx, cy, value, dataKey }) {
  const isAnomaly =
    (dataKey === "snr"        && value < SNR_CRITICAL)  ||
    (dataKey === "packetLoss" && value > LOSS_CRITICAL);

  if (!isAnomaly || cx == null || cy == null) return null;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={COLOR_ANOMALY}
      stroke="#0B0F1A"
      strokeWidth={1.5}
      style={{ filter: "drop-shadow(0 0 4px #ef4444)" }}
    />
  );
}

function PacketLossScatterPoint({ cx, cy, payload }) {
  const value = payload?.packetLoss;
  if (cx == null || cy == null || value == null) return null;

  const isAnomaly = value > LOSS_CRITICAL;
  const radius = isAnomaly ? 5 : 3.25;
  const fill = isAnomaly ? COLOR_ANOMALY : COLOR_LOSS;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={fill}
      stroke="#0B0F1A"
      strokeWidth={isAnomaly ? 1.5 : 1}
      style={{ filter: `drop-shadow(0 0 ${isAnomaly ? 4 : 2}px ${fill})` }}
    />
  );
}

// ── Legend formatter ──────────────────────────────────────────────────────────

function legendFormatter(value) {
  return <span style={{ color: "#9ca3af", fontSize: 11 }}>{value}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SignalGraph() {
  const rawHistory = useSignalHistory();

  // Ensure at least one point so the chart renders immediately
  const data = useMemo(() => {
    if (rawHistory.length === 0) {
      return [{ time: "--", snr: 28, packetLoss: 5 }];
    }
    return rawHistory;
  }, [rawHistory]);

  // Count anomaly points for the header badge
  const anomalyCount = useMemo(() =>
    data.filter((p) => p.snr < SNR_CRITICAL || p.packetLoss > LOSS_CRITICAL).length
  , [data]);

  return (
    <div className="rounded-2xl border border-[#1E2A3A] bg-[#121826] shadow-xl shadow-black/40 p-5 flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-6 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6] shrink-0" />
          <div>
            <h2 className="text-white font-bold text-base tracking-tight leading-tight">
              Signal Integrity Graph
            </h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              SNR &amp; Packet Loss · last {data.length} points
            </p>
          </div>
        </div>

        {/* Anomaly badge */}
        {anomalyCount > 0 && (
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-red-500/15 text-red-300 border-red-500/40 animate-pulse">
            {anomalyCount} anomal{anomalyCount === 1 ? "y" : "ies"}
          </span>
        )}
      </div>

      {/* ── Chart ── */}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>

          <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRID} vertical={false} />

          <XAxis
            dataKey="time"
            tick={{ fill: COLOR_AXIS, fontSize: 9 }}
            axisLine={{ stroke: COLOR_GRID }}
            tickLine={false}
            interval="preserveStartEnd"
          />

          {/* Left Y axis — SNR */}
          <YAxis
            yAxisId="snr"
            orientation="left"
            tick={{ fill: COLOR_AXIS, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            domain={[0, 40]}
            tickCount={5}
          />

          {/* Right Y axis — Packet Loss */}
          <YAxis
            yAxisId="loss"
            orientation="right"
            tick={{ fill: COLOR_AXIS, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            domain={[0, 50]}
            tickCount={5}
          />

          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: COLOR_GRID, strokeWidth: 1 }}
          />

          <Legend
            wrapperStyle={{ paddingTop: 10 }}
            formatter={legendFormatter}
          />

          {/* SNR threshold reference lines */}
          <ReferenceLine yAxisId="snr" y={SNR_WARNING}  stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.5} label={{ value: `${SNR_WARNING}`, fill: "#f59e0b", fontSize: 8, position: "insideTopLeft" }} />
          <ReferenceLine yAxisId="snr" y={SNR_CRITICAL} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.5} label={{ value: `${SNR_CRITICAL}`, fill: "#ef4444", fontSize: 8, position: "insideTopLeft" }} />

          {/* Loss threshold reference line */}
          <ReferenceLine yAxisId="loss" y={LOSS_CRITICAL} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.4} />

          {/* SNR line */}
          <Line
            yAxisId="snr"
            type="monotone"
            dataKey="snr"
            name="SNR (dB)"
            stroke={COLOR_SNR}
            strokeWidth={2.5}
            dot={(props) => <AnomalyDot {...props} dataKey="snr" />}
            activeDot={{ r: 4, fill: COLOR_SNR, strokeWidth: 0 }}
            isAnimationActive={true}
            animationDuration={400}
            animationEasing="ease-out"
            style={{ filter: `drop-shadow(0 0 4px ${COLOR_SNR})` }}
          />

          {/* Packet Loss scatter */}
          <Scatter
            yAxisId="loss"
            dataKey="packetLoss"
            name="Packet Loss (%)"
            fill={COLOR_LOSS}
            shape={<PacketLossScatterPoint />}
            legendType="circle"
            isAnimationActive={true}
            animationDuration={400}
            animationEasing="ease-out"
          />

        </ComposedChart>
      </ResponsiveContainer>

      {/* ── Legend annotations ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-[#1E2A3A] text-[10px] text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-3 border-t border-dashed border-amber-500/60" />
          SNR warning ({SNR_WARNING} dB)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 border-t border-dashed border-red-500/60" />
          SNR critical ({SNR_CRITICAL} dB)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Anomaly point
        </span>
        <span className="ml-auto tabular-nums">
          {data.length} / 20 pts
        </span>
      </div>
    </div>
  );
}
