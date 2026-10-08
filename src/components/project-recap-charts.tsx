"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [fullscreenChart, setFullscreenChart] = useState<"monthly" | "category" | null>(null);
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

  useEffect(() => {
    if (!fullscreenChart) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreenChart(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [fullscreenChart]);

  const renderMonthlyChart = (expanded = false) => monthlyTotals.length > 0 ? (
    <div className={`mt-4 min-w-0 ${expanded ? "h-[calc(100vh-180px)] min-h-[360px]" : "h-72"}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={monthlyTotals} margin={{ top: expanded ? 52 : 36, right: expanded ? 110 : 76, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: expanded ? 14 : 10, fill: "#64748b" }}
            minTickGap={expanded ? 28 : 18}
          />
          <YAxis
            domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax * 1.2 : 1)]}
            tickLine={false}
            axisLine={false}
            width={expanded ? 100 : 76}
            tick={{ fontSize: expanded ? 13 : 10, fill: "#64748b" }}
            tickFormatter={(value) => formatCompactCurrency(Number(value))}
          />
          <Tooltip content={<ExpenseTooltip />} />
          <Line
            type="monotone"
            dataKey="total"
            name="Pengeluaran"
            stroke="#4f46e5"
            strokeWidth={expanded ? 4 : 3}
            isAnimationActive={false}
            dot={{ r: expanded ? 5 : 3, fill: "#4f46e5", strokeWidth: 0 }}
            activeDot={{ r: 7, strokeWidth: 0 }}
          >
            <LabelList
              dataKey="total"
              position="top"
              offset={10}
              fill="#334155"
              fontSize={expanded ? 14 : 10}
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
  ) : <div className="empty-state mt-4">Belum ada transaksi untuk ditampilkan.</div>;

  const renderCategoryChart = (expanded = false) => categoryTotals.length > 0 ? (
    <div className={`mt-3 grid min-w-0 gap-4 ${expanded ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] lg:items-center" : "sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.8fr)] sm:items-center"}`}>
      <div className={`min-w-0 ${expanded ? "h-[min(68vh,760px)] min-h-[360px]" : "h-64"}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categoryTotals}
              dataKey="total"
              nameKey="label"
              outerRadius={expanded ? "88%" : "82%"}
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
      <ul className={`space-y-3 overflow-y-auto pr-2 ${expanded ? "max-h-[min(68vh,760px)]" : "max-h-64 space-y-2 pr-1"}`}>
        {categoryTotals.map((item, index) => {
          const percentage = categoryGrandTotal > 0 ? (item.total / categoryGrandTotal) * 100 : 0;
          return (
            <li key={item.category} className={`flex items-start justify-between gap-3 text-xs ${expanded ? "text-sm sm:text-base" : ""}`}>
              <span className="flex min-w-0 items-start gap-2 text-slate-600">
                <span
                  className={`mt-0.5 shrink-0 rounded-full ${expanded ? "size-3" : "size-2.5"}`}
                  style={{ backgroundColor: categoryColors[index % categoryColors.length] }}
                />
                <span className="min-w-0">
                  <span className="block break-words font-medium text-slate-800">{item.label}</span>
                  <span className="text-[11px] text-slate-500">{percentage.toFixed(1)}%</span>
                </span>
              </span>
              <strong className="shrink-0 text-right font-semibold text-slate-900">{formatCurrency(item.total)}</strong>
            </li>
          );
        })}
      </ul>
    </div>
  ) : <div className="empty-state mt-4">Belum ada pengeluaran berkategori.</div>;

  const expandButton = (chart: "monthly" | "category", label: string) => (
    <button
      type="button"
      onClick={() => setFullscreenChart(chart)}
      className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      aria-label={`Tampilkan grafik ${label} dalam layar penuh`}
      title="Buka layar penuh"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 fill-none stroke-current" strokeWidth="1.7">
        <path d="M7 3H3v4M13 3h4v4M17 13v4h-4M3 13v4h4M3 7l5-5M12 2l5 5M17 13l-5 5M8 18l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hidden sm:inline">Layar penuh</span>
    </button>
  );

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-2" aria-label="Grafik pengeluaran project">
      <article className="soft-card min-w-0 p-4 sm:p-5">
        <div className="section-header">
          <div>
            <h3 className="section-title">Pengeluaran per Bulan</h3>
            <p className="section-description">Tren nominal biaya dari seluruh transaksi project.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-primary">{monthlyTotals.length} bulan</span>
            {expandButton("monthly", "pengeluaran per bulan")}
          </div>
        </div>
        {renderMonthlyChart()}
      </article>

      <article className="soft-card min-w-0 p-4 sm:p-5">
        <div className="section-header">
          <div>
            <h3 className="section-title">Pengeluaran per Kategori</h3>
            <p className="section-description">Proporsi pengeluaran untuk setiap kategori biaya.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-success">{formatCompactCurrency(categoryGrandTotal)}</span>
            {expandButton("category", "pengeluaran per kategori")}
          </div>
        </div>
        {renderCategoryChart()}
      </article>

      {fullscreenChart && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFullscreenChart(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-chart-fullscreen-title"
            className="h-full w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="project-chart-fullscreen-title" className="text-lg font-bold text-slate-900 sm:text-2xl">
                  {fullscreenChart === "monthly" ? "Pengeluaran per Bulan" : "Pengeluaran per Kategori"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {fullscreenChart === "monthly"
                    ? "Tren nominal biaya dari seluruh transaksi project."
                    : "Proporsi dan nominal pengeluaran untuk setiap kategori biaya."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFullscreenChart(null)}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Tutup tampilan layar penuh"
              >
                <span aria-hidden="true">×</span> Tutup
              </button>
            </div>
            {fullscreenChart === "monthly" ? (
              <div className="mt-2">{renderMonthlyChart(true)}</div>
            ) : (
              <div className="mt-2">{renderCategoryChart(true)}</div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
