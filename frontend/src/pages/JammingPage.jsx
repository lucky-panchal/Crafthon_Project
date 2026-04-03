import useSignalStore from "../store/useSignalStore";
import useSimulationStore from "../store/useSimulationStore";

export default function JammingPage({ onNavigate }) {
  const snr        = useSignalStore((s) => s.snr);
  const packetLoss = useSignalStore((s) => s.packetLoss);
  const mode       = useSimulationStore((s) => s.mode);
  const isActive   = mode === "JAMMING";

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-8 rounded-full bg-red-500 shadow-[0_0_12px_#ef4444]" />
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">RF Jamming</h1>
          <p className="text-slate-500 text-sm">Radio Frequency interference attack — signal disruption</p>
        </div>
        {isActive && (
          <span className="ml-auto px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold animate-pulse">
            ● ACTIVE NOW
          </span>
        )}
      </div>

      {/* Live metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass rounded-2xl border border-[#1E2A3A] p-5 flex flex-col gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-widest">Live SNR</span>
          <span className="text-3xl font-bold tabular-nums" style={{ color: snr < 15 ? "#ef4444" : snr < 20 ? "#f59e0b" : "#22c55e" }}>
            {snr} dB
          </span>
          <span className="text-xs text-slate-600">Signal-to-noise ratio — drops during jamming</span>
        </div>
        <div className="glass rounded-2xl border border-[#1E2A3A] p-5 flex flex-col gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-widest">Packet Loss</span>
          <span className="text-3xl font-bold tabular-nums" style={{ color: packetLoss > 20 ? "#ef4444" : packetLoss > 10 ? "#f59e0b" : "#22c55e" }}>
            {packetLoss}%
          </span>
          <span className="text-xs text-slate-600">Spikes severely under jamming conditions</span>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { title: "What is RF Jamming?", body: "RF jamming is a deliberate attack that transmits radio signals on the same frequency as the target, overwhelming the receiver and causing communication failure." },
          { title: "Detection Method",   body: "RAKSHA detects jamming by monitoring SNR drops below 15 dB combined with packet loss spikes above 20%. The ML model flags this pattern with 92% confidence." },
          { title: "Impact",             body: "Jamming can disable GPS, radio comms, and drone control links. In military contexts it can neutralise entire communication networks." },
          { title: "Countermeasures",    body: "Frequency hopping, spread spectrum techniques, directional antennas, and signal amplification are common defences against RF jamming." },
        ].map(({ title, body }) => (
          <div key={title} className="glass rounded-2xl border border-[#1E2A3A] p-5 flex flex-col gap-3">
            <h3 className="text-white font-semibold text-sm">{title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => onNavigate("dashboard")}
        className="self-start flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1E2A3A] text-slate-400 hover:text-white hover:border-slate-500 text-sm transition-all"
      >
        ← Back to Dashboard
      </button>
    </div>
  );
}
