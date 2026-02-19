import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string;
  note?: string;
  icon?: ReactNode;
  tone?: "slate" | "blue" | "emerald" | "amber";
};

const toneClass = {
  slate: "border-slate-200 bg-gradient-to-br from-slate-50 to-white",
  blue: "border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50",
  emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50",
  amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50",
};

export function StatCard({
  label,
  value,
  note,
  icon,
  tone = "slate",
}: StatCardProps) {
  return (
    <article className={`motion-display panel border p-5 ${toneClass[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {icon ? (
          <span className="motion-display-icon rounded-lg bg-white/90 p-2 text-slate-700 shadow-sm">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {note ? <p className="mt-2 text-xs text-slate-500">{note}</p> : null}
    </article>
  );
}
