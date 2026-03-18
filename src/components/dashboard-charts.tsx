"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

type DashboardChartsProps = {
  projectStatusTotals: DashboardData["projectStatusTotals"];
  budgetCategoryTotals: DashboardData["categoryTotals"];
  budgetScopeLabel: string;
};

const projectStatusColors = ["#10b981", "#2563eb", "#f59e0b"];
const categoryBarColors = ["#2563eb", "#0f766e", "#f59e0b", "#7c3aed", "#db2777", "#0891b2"];

const compactCurrencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompactCurrency(value: number) {
  return compactCurrencyFormatter.format(value).replace("Rp", "Rp ");
}

function TooltipCard({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/96 px-3 py-2 shadow-xl backdrop-blur">
      {label ? <p className="text-xs font-semibold text-slate-900">{label}</p> : null}
      <div className="mt-1 space-y-1.5">
        {payload.map((entry) => (
          <div key={`${entry.name}-${entry.color}`} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color ?? "#94a3b8" }}
              />
              <span>{entry.name}</span>
            </div>
            <span className="text-xs font-semibold text-slate-900">
              {formatter ? formatter(Number(entry.value ?? 0)) : String(entry.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardCharts({
  projectStatusTotals,
  budgetCategoryTotals,
  budgetScopeLabel,
}: DashboardChartsProps) {
  const totalProjects = projectStatusTotals.reduce((sum, item) => sum + item.total, 0);
  const budgetRows = budgetCategoryTotals
    .filter((item) => item.total > 0)
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const budgetTotal = budgetCategoryTotals.reduce((sum, item) => sum + item.total, 0);
  const largestCategory = budgetRows[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
      <section className="soft-card p-4 md:p-5">
        <div className="section-header">
          <div>
            <h3 className="section-title">Project Progress</h3>
            <p className="section-description">
              Distribusi status proyek disederhanakan ke satu visual utama dan ringkasan status singkat.
            </p>
          </div>
          <span className="badge badge-primary">{totalProjects.toLocaleString("id-ID")} project</span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="relative h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={projectStatusTotals}
                  dataKey="total"
                  nameKey="label"
                  innerRadius={56}
                  outerRadius={82}
                  paddingAngle={4}
                  strokeWidth={0}
                >
                  {projectStatusTotals.map((entry, index) => (
                    <Cell
                      key={entry.status}
                      fill={projectStatusColors[index % projectStatusColors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<TooltipCard formatter={(value) => `${value.toLocaleString("id-ID")} proyek`} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Total</p>
              <p className="mt-1 text-3xl font-extrabold tracking-[-0.05em] text-slate-950">
                {totalProjects.toLocaleString("id-ID")}
              </p>
            </div>
          </div>

          <div className="grid gap-2.5 self-center">
            {projectStatusTotals.map((item, index) => {
              const percentage = totalProjects ? Math.round((item.total / totalProjects) * 100) : 0;
              return (
                <article key={item.status} className="soft-card-muted p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: projectStatusColors[index % projectStatusColors.length] }}
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="text-[11px] text-slate-500">{percentage}% dari total project</p>
                      </div>
                    </div>
                    <p className="text-base font-bold text-slate-950">{item.total.toLocaleString("id-ID")}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="soft-card p-4 md:p-5">
        <div className="section-header">
          <div>
            <h3 className="section-title">Budget Usage</h3>
            <p className="section-description">
              Breakdown biaya ditampilkan per kategori dengan scope {budgetScopeLabel}.
            </p>
          </div>
          <span className="badge badge-success">{formatCompactCurrency(budgetTotal)}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="badge badge-neutral">{budgetScopeLabel}</span>
          {largestCategory ? (
            <span className="badge badge-primary">{largestCategory.label} tertinggi</span>
          ) : null}
        </div>

        {budgetRows.length > 0 ? (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetRows} layout="vertical" margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(value) => formatCompactCurrency(Number(value))}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  width={118}
                  fontSize={11}
                />
                <Tooltip content={<TooltipCard formatter={(value) => formatCurrency(value)} />} />
                <Bar dataKey="total" radius={[8, 8, 8, 8]}>
                  {budgetRows.map((entry, index) => (
                    <Cell
                      key={entry.category}
                      fill={categoryBarColors[index % categoryBarColors.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty-state mt-4">Belum ada pengeluaran pada scope yang dipilih.</div>
        )}
      </section>
    </div>
  );
}
