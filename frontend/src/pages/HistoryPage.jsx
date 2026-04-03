import useAlertStore from "../store/useAlertStore";

const RISK_COLOR = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#22c55e" };

export default function HistoryPage({ onNavigate }) {
  const alerts     = useAlertStore((s) => s.alerts);
  const logs       = useAlertStore((s) => s.logs);
  const clearAlerts = useAlertStore((s) => s.clearAlerts);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto py-6 px-4">
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-8 rounded-full bg-blue-500 shadow-[0_0_12px_#3b82f6]" />
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Alert History</h1>
          <p className="text-slate-500 text-sm">All detection events this session</p>
        </div>
        {alerts.length > 0 && (
          <button
            onClick={clearAlerts}
            className="ml-auto text-xs text-slate-500 hover:text-red-400 border border-slate-700 hover:border-red-500/40 px-3 py-1.5 rounded-lg transition-all"
          >
            Clear All
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="glass rounded-2xl border border-[#1E2A3A] p-12 flex flex-col items-center gap-3">
          <span className="text-4xl">🛡️</span>
          <span className="text-slate-500 text-sm">No alerts recorded this session</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((a) => (
            <div key={a.id} className="glass rounded-2xl border border-[#1E2A3A] px-5 py-4 flex items-start gap-4">
              <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: RISK_COLOR[a.risk] ?? "#94a3b8" }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white text-sm font-semibold">{a.type?.replace(/_/g, " ")}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ color: RISK_COLOR[a.risk], borderColor: `${RISK_COLOR[a.risk]}40`, background: `${RISK_COLOR[a.risk]}15` }}>
                    {a.risk}
                  </span>
                  {a.count > 1 && (
                    <span className="text-[10px] text-slate-500 border border-slate-700 px-2 py-0.5 rounded-full">×{a.count}</span>
                  )}
                </div>
                <p className="text-slate-400 text-xs mt-1">{a.reason}</p>
                <p className="text-slate-600 text-[10px] mt-1">{new Date(a.timestamp).toLocaleTimeString()} · Confidence {a.confidence}%</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => onNavigate("dashboard")}
        className="self-start flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1E2A3A] text-slate-400 hover:text-white hover:border-slate-500 text-sm transition-all"
      >
        ← Back to Dashboard
      </button>
    </div>
  );
}
