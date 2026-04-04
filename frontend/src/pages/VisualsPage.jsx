import { AreaChart, Area, LineChart, Line, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import useSignalStore from "../store/useSignalStore";
import useSimulationStore from "../store/useSimulationStore";

const TIP_STYLE = { background: "#0D1220", border: "1px solid #1a2535", borderRadius: 8, fontSize: 11 };

function PacketLossDot({ cx, cy, payload }) {
  const value = payload?.packetLoss;
  if (cx == null || cy == null || value == null) return null;

  const isCritical = value > 20;
  const fill = "#f59e0b";

  return (
    <circle
      cx={cx}
      cy={cy}
      r={isCritical ? 5 : 3.5}
      fill={fill}
      stroke="#0D1220"
      strokeWidth={1.2}
      style={{ filter: `drop-shadow(0 0 ${isCritical ? 5 : 3}px ${fill})` }}
    />
  );
}

export default function VisualsPage() {
  const history    = useSignalStore((s) => s.history);
  const snr        = useSignalStore((s) => s.snr);
  const packetLoss = useSignalStore((s) => s.packetLoss);
  const packetRate = useSignalStore((s) => s.packetRate);
  const mode       = useSimulationStore((s) => s.mode);

  const snrColor  = mode === "JAMMING" ? "#ef4444" : mode === "SPOOFING" ? "#f59e0b" : "#22c55e";
  const snrColor_ = snr < 15 ? "#ef4444" : snr < 20 ? "#f59e0b" : "#22c55e";
  const lossColor = packetLoss > 20 ? "#ef4444" : packetLoss > 10 ? "#f59e0b" : "#22c55e";

  return (
    <div className="grid grid-cols-2 gap-2 p-2" style={{ height: "calc(100vh - 110px)" }}>

      {/* SNR Area */}
      <div className="glass rounded-2xl border border-[#1E2A3A] p-3 flex flex-col gap-1 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <span className="text-white font-semibold text-xs">Signal-to-Noise Ratio</span>
          <span className="text-xs font-bold tabular-nums" style={{ color: snrColor_ }}>{snr} dB</span>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="vgSNR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={snrColor} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={snrColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 8 }} axisLine={{ stroke: "#1a2535" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#475569", fontSize: 8 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TIP_STYLE} />
              <Area type="monotone" dataKey="snr" name="SNR (dB)" stroke={snrColor} strokeWidth={2} fill="url(#vgSNR)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Packet Loss Scatter */}
      <div className="glass rounded-2xl border border-[#1E2A3A] p-3 flex flex-col gap-1 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <span className="text-white font-semibold text-xs">Packet Loss</span>
          <span className="text-xs font-bold tabular-nums" style={{ color: lossColor }}>{packetLoss}%</span>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart data={history} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 8 }} axisLine={{ stroke: "#1a2535" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#475569", fontSize: 8 }} axisLine={false} tickLine={false} domain={[0, 50]} />
              <Tooltip contentStyle={TIP_STYLE} />
              <Scatter dataKey="packetLoss" name="Packet Loss %" fill="#f59e0b" shape={<PacketLossDot />} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Packet Rate Bar */}
      <div className="glass rounded-2xl border border-[#1E2A3A] p-3 flex flex-col gap-1 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <span className="text-white font-semibold text-xs">Packet Rate</span>
          <span className="text-xs font-bold tabular-nums text-blue-400">{packetRate} pps</span>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 8 }} axisLine={{ stroke: "#1a2535" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#475569", fontSize: 8 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TIP_STYLE} />
              <Bar dataKey="packetRate" name="Packet Rate" fill="#3b82f6" opacity={0.7} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SNR Trend Line */}
      <div className="glass rounded-2xl border border-[#1E2A3A] p-3 flex flex-col gap-1 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <span className="text-white font-semibold text-xs">SNR Trend</span>
          <div className="flex items-center gap-2 text-[9px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-red-500 inline-block" />&lt;15 critical</span>
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-amber-500 inline-block" />&lt;20 warning</span>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 8 }} axisLine={{ stroke: "#1a2535" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#475569", fontSize: 8 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TIP_STYLE} />
              <Line type="monotone" dataKey="snr" name="SNR (dB)" stroke={snrColor} strokeWidth={2} dot={false} isAnimationActive={false} style={{ filter: `drop-shadow(0 0 4px ${snrColor})` }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
