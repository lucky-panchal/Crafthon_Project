import type { Alert } from "../hooks/useSimulation";

interface Props {
  alerts: Alert[];
}

const SEVERITY_STYLES: Record<string, string> = {
  jamming: "border-red-500 bg-red-900/30 text-red-300",
  spoofing: "border-yellow-500 bg-yellow-900/30 text-yellow-300",
  default: "border-gray-600 bg-gray-800/50 text-gray-300",
};

function getSeverityStyle(message: string): string {
  if (message.toLowerCase().includes("jamming")) return SEVERITY_STYLES.jamming;
  if (message.toLowerCase().includes("spoofing")) return SEVERITY_STYLES.spoofing;
  return SEVERITY_STYLES.default;
}

export default function AlertPanel({ alerts }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-lg">Alerts</h2>
        <span className={`text-xs px-2 py-1 rounded font-medium ${
          alerts.length > 0 ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
        }`}>
          {alerts.length > 0 ? `${alerts.length} Active` : "All Clear"}
        </span>
      </div>

      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm gap-2">
            <span className="text-2xl">✅</span>
            <span>No alerts detected</span>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`border rounded-lg px-3 py-2 text-sm ${getSeverityStyle(alert.message)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{alert.message}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{alert.time}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
