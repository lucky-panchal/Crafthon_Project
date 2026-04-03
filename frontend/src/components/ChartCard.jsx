/**
 * @param {{ title: string, badge?: React.ReactNode, children: React.ReactNode, className?: string }} props
 */
export default function ChartCard({ title, badge, children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-[#2a3a1a]/50 shadow-xl shadow-black/40 p-6 flex flex-col gap-4 ${className}`}
      style={{ background: "rgba(10,18,12,0.55)", backdropFilter: "blur(12px)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
          <h2 className="text-white font-semibold text-base tracking-tight">{title}</h2>
        </div>
        {badge && <div>{badge}</div>}
      </div>
      {children}
    </div>
  );
}
