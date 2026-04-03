import { useEffect, useState } from "react";
import useRiskStore from "../store/useRiskStore";
import useSimulationStore from "../store/useSimulationStore";

export default function CriticalAlertBanner() {
  const level = useRiskStore((s) => s.level);
  const mode  = useSimulationStore((s) => s.mode);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(level === "HIGH");
  }, [level]);

  if (!visible) return null;

  const isJamming  = mode === "JAMMING";
  const isSpoofing = mode === "SPOOFING";

  const msg = isJamming
    ? "🚨 RF JAMMING DETECTED — SIGNAL INTEGRITY COMPROMISED 🚨"
    : isSpoofing
    ? "🚨 SOURCE SPOOFING DETECTED — IDENTITY BREACH ACTIVE 🚨"
    : "🚨 CRITICAL THREAT DETECTED — IMMEDIATE ACTION REQUIRED 🚨";

  return (
    <div
      className="w-full text-white text-center py-2 text-xs font-bold tracking-widest z-50 relative"
      style={{
        background: "linear-gradient(90deg, #7f0000, #ef4444, #7f0000)",
        backgroundSize: "200% 100%",
        animation: "bannerScroll 2s linear infinite, shake 0.3s ease-in-out infinite",
        boxShadow: "0 0 20px #ef444460",
      }}
    >
      {msg}
    </div>
  );
}
