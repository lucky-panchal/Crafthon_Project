import { useEffect, useRef } from "react";

interface Props {
  risk: number;
  attack: string | null;
  packetLoss: number;
}

function getRiskLevel(risk: number): { circle: string; label: string; text: string } {
  if (risk >= 70) return { circle: "bg-red-500 shadow-red-500/50", label: "High", text: "text-red-400" };
  if (risk >= 40) return { circle: "bg-yellow-400 shadow-yellow-400/50", label: "Medium", text: "text-yellow-400" };
  return { circle: "bg-green-400 shadow-green-400/50", label: "Low", text: "text-green-400" };
}

export default function RiskIndicator({ risk, attack, packetLoss }: Props) {
  const { circle, label, text } = getRiskLevel(risk);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    barRef.current?.style.setProperty("--risk-width", `${risk}%`);
  }, [risk]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-white font-semibold text-lg">Risk Indicator</h2>

      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-full shadow-lg ${circle} transition-colors duration-500`} />
        <div>
          <div className={`text-3xl font-bold ${text}`}>{risk}%</div>
          <div className={`text-sm font-medium ${text}`}>{label} Risk</div>
        </div>
      </div>

      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          ref={barRef}
          className={`risk-bar h-2 rounded-full transition-all duration-500 ${circle.split(" ")[0]}`}
        />
      </div>

      <div className="flex flex-col gap-1 text-sm text-gray-400">
        <div>
          Attack:{" "}
          <span className={attack ? "text-red-400 font-semibold" : "text-green-400"}>
            {attack ?? "None"}
          </span>
        </div>
        <div>
          Packet Loss: <span className="text-white">{(packetLoss * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
