const VARIANTS = {
  normal:   { dot: "bg-green-400",  pill: "bg-green-500/10 border-green-500/25 text-green-400",   label: "Normal",   blink: false },
  warning:  { dot: "bg-yellow-400", pill: "bg-yellow-500/10 border-yellow-500/25 text-yellow-400", label: "Warning",  blink: false },
  danger:   { dot: "bg-red-400",    pill: "bg-red-500/10 border-red-500/25 text-red-400",           label: "Danger",   blink: false },
  critical: { dot: "bg-red-500",    pill: "bg-red-600/15 border-red-500/40 text-red-400",           label: "Critical", blink: false },
  jamming:  { dot: "bg-red-500",    pill: "bg-red-600/20 border-red-500/50 text-red-300",           label: "Jamming",  blink: true  },
  spoofing: { dot: "bg-amber-400",  pill: "bg-amber-500/20 border-amber-500/50 text-amber-300",     label: "Spoofing", blink: true  },
};

/**
 * @param {{ status?: string, label?: string }} props
 */
export default function StatusBadge({ status = "normal", label }) {
  const v    = VARIANTS[status] ?? VARIANTS.normal;
  const text = label ?? v.label;

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border",
        "text-xs font-semibold tracking-wide",
        v.pill,
        v.blink ? "badge-blink" : "",
      ].join(" ")}
    >
      <span className={`w-2 h-2 rounded-full animate-pulse ${v.dot}`} />
      {text}
    </span>
  );
}
