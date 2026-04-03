import { useEffect, useRef } from "react";
import {
  LineChart,
  Line,
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
}

const MAX_POINTS = 20;

export default function TrafficChart({ data }: Props) {
  const history = useRef<DataPoint[]>([]);

  useEffect(() => {
    if (!data) return;
    const point: DataPoint = {
      time: new Date().toLocaleTimeString(),
      packet_rate: data.packet_rate,
      snr: data.snr,
    };
    history.current = [...history.current.slice(-MAX_POINTS + 1), point];
  }, [data]);

  const chartData = history.current.length > 0
    ? history.current
    : [{ time: "--", packet_rate: 0, snr: 0 }];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg">Traffic & SNR</h2>
        {!data && (
          <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
            Waiting for data...
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#6B7280", fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} />
          <Tooltip
            contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "8px" }}
            labelStyle={{ color: "#9CA3AF" }}
          />
          <Legend wrapperStyle={{ color: "#9CA3AF", fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="packet_rate"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            name="Packet Rate"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="snr"
            stroke="#10B981"
            strokeWidth={2}
            dot={false}
            name="SNR (dB)"
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="flex gap-6 mt-3 text-sm text-gray-400">
        <span>
          Packet Rate:{" "}
          <span className="text-blue-400 font-medium">{data?.packet_rate ?? "--"}</span>
        </span>
        <span>
          SNR:{" "}
          <span className="text-emerald-400 font-medium">{data?.snr ?? "--"} dB</span>
        </span>
      </div>
    </div>
  );
}
