import { useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import type { SimulationData } from "../hooks/useSimulation";

interface Props {
  data: SimulationData | null;
}

interface DataPoint {
  time: string;
  packet_rate: number;
  snr: number;
  packet_loss: number;
}

const MAX_POINTS = 20;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="text-gray-400 text-xs mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="font-semibold" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function TrafficChart({ data }: Props) {
  const history = useRef<DataPoint[]>([]);

  useEffect(() => {
    if (!data) return;
    const point: DataPoint = {
      time: new Date().toLocaleTimeString(),
      packet_rate: data.packet_rate,
      snr: data.snr,
      packet_loss: parseFloat((data.packet_loss * 100).toFixed(2)),
    };
    history.current = [...history.current.slice(-MAX_POINTS + 1), point];
  }, [data]);

  const chartData = history.current.length > 0
    ? history.current
    : [{ time: "--", packet_rate: 0, snr: 0, packet_loss: 0 }];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_6px_#60a5fa]" />
          <h2 className="text-white font-semibold text-lg tracking-tight">Live Signal Monitor</h2>
        </div>
        {!data && (
          <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full border border-yellow-400/20">
            Waiting for data...
          </span>
        )}
      </div>

      {/* SVG gradient defs */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="gradPacketRate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="gradSNR" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="gradPacketLoss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.0} />
          </linearGradient>
          {/* Glow filters */}
          <filter id="glowBlue">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glowGreen">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
      </svg>

      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="fillPacketRate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="fillSNR" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="fillLoss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />

          <XAxis
            dataKey="time"
            tick={{ fill: "#4b5563", fontSize: 9 }}
            axisLine={{ stroke: "#1f2937" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#4b5563", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => <span style={{ color: "#9ca3af" }}>{value}</span>}
          />

          {/* Packet Rate — blue/purple RGB wave */}
          <Area
            type="monotone"
            dataKey="packet_rate"
            name="Packet Rate"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#fillPacketRate)"
            dot={false}
            isAnimationActive={false}
            style={{ filter: "drop-shadow(0 0 4px #3b82f6)" }}
          />

          {/* SNR — green/cyan RGB wave */}
          <Area
            type="monotone"
            dataKey="snr"
            name="SNR (dB)"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#fillSNR)"
            dot={false}
            isAnimationActive={false}
            style={{ filter: "drop-shadow(0 0 4px #10b981)" }}
          />

          {/* Packet Loss — amber wave */}
          <Area
            type="monotone"
            dataKey="packet_loss"
            name="Loss (%)"
            stroke="#f59e0b"
            strokeWidth={2}
            fill="url(#fillLoss)"
            dot={false}
            isAnimationActive={false}
            style={{ filter: "drop-shadow(0 0 4px #f59e0b)" }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Live stat pills */}
      <div className="flex gap-3 mt-4 flex-wrap">
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_#60a5fa]" />
          <span className="text-xs text-gray-400">Packet Rate</span>
          <span className="text-xs font-bold text-blue-400">{data?.packet_rate ?? "--"}</span>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          <span className="text-xs text-gray-400">SNR</span>
          <span className="text-xs font-bold text-emerald-400">{data?.snr ?? "--"} dB</span>
        </div>
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]" />
          <span className="text-xs text-gray-400">Packet Loss</span>
          <span className="text-xs font-bold text-amber-400">
            {data ? (data.packet_loss * 100).toFixed(2) : "--"}%
          </span>
        </div>
      </div>
    </div>
  );
}
