import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string;
  note?: string;
  icon?: ReactNode;
  tone?: "slate" | "blue" | "emerald" | "amber";
  trend?: string;
  trendTone?: "neutral" | "positive" | "attention";
};

const toneClass = {
  slate: "border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.18),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]",
  blue: "border-blue-200 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.26),transparent_36%),linear-gradient(180deg,#eff6ff_0%,#f8fbff_100%)]",
  emerald:
    "border-emerald-200 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.24),transparent_36%),linear-gradient(180deg,#ecfdf5_0%,#f7fffb_100%)]",
  amber:
    "border-amber-200 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.22),transparent_36%),linear-gradient(180deg,#fffbeb_0%,#fffaf5_100%)]",
};

const iconClass = {
  slate: "bg-slate-900 text-white shadow-slate-900/15",
  blue: "bg-blue-600 text-white shadow-blue-500/20",
  emerald: "bg-emerald-600 text-white shadow-emerald-500/20",
  amber: "bg-amber-500 text-white shadow-amber-500/20",
};

const trendClass = {
  neutral: "bg-slate-100 text-slate-600",
  positive: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  attention: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

export function StatCard({
  label,
  value,
  note,
  icon,
  tone = "slate",
  trend,
  trendTone = "neutral",
}: StatCardProps) {
  return (
    <article className={`motion-display metric-card ${toneClass[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        {icon ? (
          <span
            className={`motion-display-icon metric-card__icon shadow-lg ${iconClass[tone]}`}
          >
            {icon}
          </span>
        ) : (
          <span />
        )}
        {trend ? (
          <span className={`metric-card__trend ${trendClass[trendTone]}`}>{trend}</span>
        ) : null}
      </div>

      <div className="mt-5">
        <p className="metric-card__label">{label}</p>
        <p className="metric-card__value">{value}</p>
        {note ? <p className="metric-card__note">{note}</p> : null}
      </div>
    </article>
  );
}
