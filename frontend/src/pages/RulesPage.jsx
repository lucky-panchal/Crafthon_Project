export default function RulesPage({ onNavigate }) {
  const RULES = [
    { id: "R-01", name: "SNR Drop Alert",       condition: "SNR < 15 dB",              action: "Trigger JAMMING alert",        risk: "HIGH",   active: true  },
    { id: "R-02", name: "SNR Warning",           condition: "SNR < 20 dB",              action: "Trigger WARNING status",       risk: "MEDIUM", active: true  },
    { id: "R-03", name: "Packet Loss Spike",     condition: "Packet Loss > 20%",        action: "Trigger JAMMING alert",        risk: "HIGH",   active: true  },
    { id: "R-04", name: "Spoofed Source ID",     condition: "source_id == 999",         action: "Trigger SPOOFING alert",       risk: "HIGH",   active: true  },
    { id: "R-05", name: "High Packet Rate",      condition: "Packet Rate > 700 pps",    action: "Log traffic anomaly",          risk: "MEDIUM", active: true  },
    { id: "R-06", name: "Confidence Threshold",  condition: "ML confidence > 85%",      action: "Escalate to HIGH risk",        risk: "HIGH",   active: true  },
    { id: "R-07", name: "Escalation Rule",       condition: "Same type × 3 in session", action: "Boost confidence +10%, log",   risk: "HIGH",   active: true  },
  ];

  const RISK_COLOR = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#22c55e" };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto py-6 px-4">
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-8 rounded-full bg-green-500 shadow-[0_0_12px_#22c55e]" />
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Detection Rules</h1>
          <p className="text-slate-500 text-sm">Active rule engine — {RULES.filter(r => r.active).length} rules running</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {RULES.map((rule) => (
          <div key={rule.id} className="glass rounded-2xl border border-[#1E2A3A] px-5 py-4 flex items-center gap-4">
            <span className="text-[10px] font-mono text-slate-600 w-10 shrink-0">{rule.id}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-sm font-semibold">{rule.name}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                  style={{ color: RISK_COLOR[rule.risk], borderColor: `${RISK_COLOR[rule.risk]}40`, background: `${RISK_COLOR[rule.risk]}15` }}>
                  {rule.risk}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">IF {rule.condition}</span>
                <span className="text-[10px] text-slate-500">→</span>
                <span className="text-[10px] text-slate-400">{rule.action}</span>
              </div>
            </div>
            <span className={`w-2 h-2 rounded-full shrink-0 ${rule.active ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
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
