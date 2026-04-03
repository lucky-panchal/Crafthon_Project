import useSignalStore from "../store/useSignalStore";
import useSimulationStore from "../store/useSimulationStore";

export default function SpoofingPage({ onNavigate }) {
  const packetRate = useSignalStore((s) => s.packetRate);
  const mode       = useSimulationStore((s) => s.mode);
  const isActive   = mode === "SPOOFING";

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto py-6 px-4">
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-8 rounded-full bg-amber-500 shadow-[0_0_12px_#f59e0b]" />
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Source Spoofing</h1>
          <p className="text-slate-500 text-sm">Identity forgery attack — fake source injection</p>
        </div>
        {isActive && (
          <span className="ml-auto px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-bold animate-pulse">
            ● ACTIVE NOW
          </span>
        )}
      </div>

      {/* Live metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass rounded-2xl border border-[#1E2A3A] p-5 flex flex-col gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-widest">Packet Rate</span>
          <span className="text-3xl font-bold tabular-nums text-amber-400">{packetRate} pps</span>
          <span className="text-xs text-slate-600">Spoofed packets inflate traffic volume</span>
        </div>
        <div className="glass rounded-2xl border border-[#1E2A3A] p-5 flex flex-col gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-widest">Spoofed Source ID</span>
          <span className="text-3xl font-bold tabular-nums text-red-400">999</span>
          <span className="text-xs text-slate-600">Known malicious identifier injected</span>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { title: "What is Source Spoofing?", body: "Source spoofing forges the origin address of packets, making malicious traffic appear to come from a trusted source. Source ID '999' is a known spoofed identifier in this system." },
          { title: "Detection Method",         body: "RAKSHA detects spoofing by identifying anomalous source IDs in the packet stream. The ML model cross-references known bad identifiers with 89% confidence." },
          { title: "Impact",                   body: "Spoofing can bypass authentication, enable man-in-the-middle attacks, and corrupt command-and-control channels in military communication systems." },
          { title: "Countermeasures",           body: "Cryptographic authentication, source verification, ingress filtering, and anomaly-based IDS are effective defences against source spoofing attacks." },
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
