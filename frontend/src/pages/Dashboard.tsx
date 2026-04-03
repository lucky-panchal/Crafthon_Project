import { useSimulation } from "../hooks/useSimulation";
import TrafficChart from "../components/TrafficChart";
import ControlPanel from "../components/ControlPanel";
import RiskIndicator from "../components/RiskIndicator";
import AlertPanel from "../components/AlertPanel";

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg animate-pulse ${className}`}>
      <div className="h-4 bg-gray-700 rounded w-1/3 mb-4" />
      <div className="h-32 bg-gray-700/50 rounded" />
    </div>
  );
}

export default function Dashboard() {
  const { data, alerts, loading, error, injectAttack } = useSimulation();

  return (
    <div className="p-8 min-h-screen flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-blue-400 tracking-tight">Network Signal Monitor</h1>
        <span className={`text-xs px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
          error
            ? "text-red-400 bg-red-500/10 border-red-500/20"
            : loading
            ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
            : "text-green-400 bg-green-500/10 border-green-500/20"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${error ? "bg-red-400" : loading ? "bg-yellow-400 animate-pulse" : "bg-green-400 animate-pulse"}`} />
          {error ? "Disconnected" : loading ? "Connecting..." : "Live"}
        </span>
      </div>

      {error ? (
        <div className="flex items-center justify-center h-64 text-red-400 text-sm gap-2">
          <span>⚠️</span><span>Backend unreachable — {error}</span>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-12 gap-6">
          <SkeletonCard className="col-span-8" />
          <SkeletonCard className="col-span-4" />
          <SkeletonCard className="col-span-4" />
          <SkeletonCard className="col-span-8" />
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">

          {/* Traffic Chart */}
          <div className="col-span-8 bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg">
            <TrafficChart data={data} />
          </div>

          {/* Control Panel */}
          <div className="col-span-4 bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg">
            <ControlPanel onInject={injectAttack} />
          </div>

          {/* Risk Indicator */}
          <div className="col-span-4 bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg">
            <RiskIndicator risk={data?.risk ?? 0} attack={data?.attack ?? null} packetLoss={data?.packet_loss ?? 0} />
          </div>

          {/* Alert Panel */}
          <div className="col-span-8 bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg">
            <AlertPanel alerts={alerts} />
          </div>

        </div>
      )}
    </div>
  );
}
