import useAlertStore from "../store/useAlertStore";
import useConnectionStore from "../store/useConnectionStore";
import useRiskStore from "../store/useRiskStore";

export default function SystemStatusBar() {
  const totalAlerts = useAlertStore((s) => s.totalAlerts);
  const status      = useConnectionStore((s) => s.status);
  const { level }   = useRiskStore((s) => ({ level: s.level }));

  const isHigh = level === "HIGH";
  const conn   = status === "connected";

  return (
    <div
      className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] font-mono font-semibold z-40 relative"
      style={{
        background: isHigh
          ? "rgba(120,0,0,0.85)"
          : "rgba(5,12,8,0.92)",
        backdropFilter: "blur(8px)",
        borderBottom: isHigh
          ? "1px solid rgba(239,68,68,0.5)"
          : "1px solid rgba(74,94,42,0.3)",
        transition: "background 0.5s ease",
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-4">
        <span className={conn ? "text-green-400" : "text-red-400"}>
          {conn ? "🟢 CONNECTED" : "🔴 DISCONNECTED"}
        </span>
        <span className="text-[#556b2f]">RAKSHA DEFENCE CORE</span>
      </div>

      {/* Center */}
      <span className={`tracking-widest ${isHigh ? "text-red-400 animate-pulse" : "text-green-400"}`}>
        {isHigh ? "🔴 ACTIVE THREAT DETECTED" : "🟢 ALL SYSTEMS NORMAL"}
      </span>

      {/* Right */}
      <div className="flex items-center gap-4">
        <span className="text-gray-500">{totalAlerts} THREAT{totalAlerts !== 1 ? "S" : ""} LOGGED</span>
        <span className="text-[#3b82f6] border border-[#3b82f6]/30 px-2 py-0.5 rounded">
          EDGE READY · &lt;1s LATENCY
        </span>
      </div>
    </div>
  );
}
