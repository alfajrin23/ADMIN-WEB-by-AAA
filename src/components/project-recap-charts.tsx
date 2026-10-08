"use client";

import { useMemo } from "react";
import {
  Cell,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCostCategoryLabel, resolveSummaryCostCategory } from "@/lib/constants";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { ExpenseEntry } from "@/lib/types";

type ProjectRecapChartsProps = {
  expenses: ExpenseEntry[];
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string; color?: string; payload?: { label?: string } }>;
  label?: string;
};

const categoryColors = [
  "#4f46e5",
  "#0f766e",
  "#f59e0b",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#ea580c",
];

function ExpenseTooltip({ active, payload, label }: ChartTooltipProps) {
  const item = payload?.[0];
  if (!active || !item) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-slate-800">{label ?? item.payload?.label}</p>
      <p className="mt-1 text-xs font-bold text-indigo-700">{formatCurrency(Number(item.value ?? 0))}</p>
    </div>
  );
}

function getMonthIndex(expenseDate: string) {
  const match = /^(\d{4})-(\d{2})/.exec(expenseDate);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const latestAllowedYear = new Date().getFullYear() + 5;
  if (year < 1900 || year > latestAllowedYear || month < 1 || month > 12) {
    return null;
  }
  return year * 12 + month - 1;
}

function formatMonth(monthIndex: number) {
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  return new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(
    new Date(Date.UTC(year, month, 1)),
  );
}

export function ProjectRecapCharts({ expenses }: ProjectRecapChartsProps) {
  const monthlyTotals = useMemo(() => {
    const totals = new Map<number, number>();

    for (const expense of expenses) {
      const month = getMonthIndex(expense.expenseDate);
      if (month === null) {
        continue;
      }
      totals.set(month, (totals.get(month) ?? 0) + expense.amount);
    }

    return Array.from(totals, ([month, total]) => ({ month, label: formatMonth(month), total }))
      .sort((a, b) => a.month - b.month);
  }, [expenses]);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of expenses) {
      const category = resolveSummaryCostCategory({
        category: expense.category,
        description: expense.description,
        usageInfo: expense.usageInfo,
      });
      if (category) {
        totals.set(category, (totals.get(category) ?? 0) + expense.amount);
      }
    }

    return Array.from(totals, ([category, total]) => ({
      category,
      label: getCostCategoryLabel(category),
      total,
    }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const categoryGrandTotal = categoryTotals.reduce((total, item) => total + item.total, 0);

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-2" aria-label="Grafik pengeluaran project">
      <article className="soft-card min-w-0 p-4 sm:p-5">
        <div className="section-header">
          <div>
            <h3 className="section-title">Pengeluaran per Bulan</h3>
            <p className="section-description">Tren nominal biaya dari seluruh transaksi project.</p>
          </div>
          <span className="badge badge-primary">{monthlyTotals.length} bulan</span>
        </div>
        {monthlyTotals.length > 0 ? (
          <div className="mt-4 h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTotals} margin={{ top: 36, right: 76, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  minTickGap={18}
                />
                <YAxis
                  domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax * 1.2 : 1)]}
                  tickLine={false}
                  axisLine={false}
                  width={76}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(value) => formatCompactCurrency(Number(value))}
                />
                <Tooltip content={<ExpenseTooltip />} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Pengeluaran"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "#4f46e5", strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                >
                  <LabelList
                    dataKey="total"
                    position="top"
                    offset={8}
                    fill="#475569"
                    fontSize={10}
                  fontWeight={700}
                  stroke="#fff"
                  strokeWidth={4}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  zIndex={3000}
                    formatter={(value) => formatCurrency(Number(value)).replace(/\s+/g, "")}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty-state mt-4">Belum ada transaksi untuk ditampilkan.</div>
        )}
      </article>

      <article className="soft-card min-w-0 p-4 sm:p-5">
        <div className="section-header">
          <div>
            <h3 className="section-title">Pengeluaran per Kategori</h3>
            <p className="section-description">Proporsi pengeluaran untuk setiap kategori biaya.</p>
          </div>
          <span className="badge badge-success">{formatCompactCurrency(categoryGrandTotal)}</span>
        </div>
        {categoryTotals.length > 0 ? (
          <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.8fr)] sm:items-center">
            <div className="h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryTotals}
                    dataKey="total"
                    nameKey="label"
                    outerRadius="82%"
                    paddingAngle={1}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {categoryTotals.map((item, index) => (
                      <Cell key={item.category} fill={categoryColors[index % categoryColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ExpenseTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {categoryTotals.map((item, index) => {
                const percentage = categoryGrandTotal > 0 ? (item.total / categoryGrandTotal) * 100 : 0;
                return (
                  <li key={item.category} className="flex items-start justify-between gap-3 text-xs">
                    <span className="flex min-w-0 items-start gap-2 text-slate-600">
                      <span
                        className="mt-0.5 size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: categoryColors[index % categoryColors.length] }}
                      />
                      <span className="min-w-0">
                        <span className="block break-words font-medium text-slate-800">{item.label}</span>
                        <span className="text-[11px] text-slate-500">{percentage.toFixed(1)}%</span>
                      </span>
                    </span>
                    <strong className="shrink-0 text-right font-semibold text-slate-900">
                      {formatCurrency(item.total)}
                    </strong>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="empty-state mt-4">Belum ada pengeluaran berkategori.</div>
        )}
      </article>
    </section>
  );
}
