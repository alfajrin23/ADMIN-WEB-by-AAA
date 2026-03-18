"use client";

import { useMemo, useState } from "react";
import { PROJECT_STATUS_STYLE } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

type ProjectExpenseTotalRow = DashboardData["projectExpenseTotals"][number];
type SortOption =
  | "date_desc"
  | "date_asc"
  | "name_asc"
  | "name_desc"
  | "amount_desc"
  | "amount_asc";

type ProjectExpenseTotalsTableProps = {
  rows: ProjectExpenseTotalRow[];
};

export function ProjectExpenseTotalsTable({ rows }: ProjectExpenseTotalsTableProps) {
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");

  const sortedRows = useMemo(() => {
    return rows.slice().sort((a, b) => {
      if (sortBy === "date_desc") {
        if (a.latestExpenseDate !== b.latestExpenseDate) {
          return b.latestExpenseDate.localeCompare(a.latestExpenseDate);
        }
        return b.totalExpense - a.totalExpense;
      }

      if (sortBy === "date_asc") {
        if (a.latestExpenseDate !== b.latestExpenseDate) {
          return a.latestExpenseDate.localeCompare(b.latestExpenseDate);
        }
        return a.totalExpense - b.totalExpense;
      }

      if (sortBy === "name_asc") {
        return a.projectName.localeCompare(b.projectName);
      }

      if (sortBy === "name_desc") {
        return b.projectName.localeCompare(a.projectName);
      }

      if (sortBy === "amount_asc") {
        if (a.totalExpense !== b.totalExpense) {
          return a.totalExpense - b.totalExpense;
        }
        return a.projectName.localeCompare(b.projectName);
      }

      if (a.totalExpense !== b.totalExpense) {
        return b.totalExpense - a.totalExpense;
      }
      return a.projectName.localeCompare(b.projectName);
    });
  }, [rows, sortBy]);

  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
        <div className="table-caption">
          {sortedRows.length} proyek dengan transaksi biaya tercatat.
        </div>
        <div>
          <label htmlFor="project-total-sort" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Urutkan
          </label>
          <select
            id="project-total-sort"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortOption)}
            className="w-full"
          >
            <option value="date_desc">Tanggal terbaru</option>
            <option value="date_asc">Tanggal terlama</option>
            <option value="name_asc">Abjad A-Z</option>
            <option value="name_desc">Abjad Z-A</option>
            <option value="amount_desc">Biaya terbesar</option>
            <option value="amount_asc">Biaya terkecil</option>
          </select>
        </div>
      </div>

      <div className="table-card">
        <div className="data-table-shell">
          <table className="data-table data-table--sticky data-table--compact">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="w-[40%]">Project</th>
              <th className="w-[18%] text-right">Transaksi</th>
              <th className="w-[22%] text-right">Tanggal Terakhir</th>
              <th className="w-[20%] text-right">Total Pengeluaran</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((item) => (
              <tr key={item.projectId || item.projectName}>
                <td className="align-top">
                  <p className="break-words font-semibold text-slate-900">{item.projectName}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${PROJECT_STATUS_STYLE[item.projectStatus]}`}
                  >
                    {item.projectStatus}
                  </span>
                </td>
                <td className="text-right">{item.transactionCount}</td>
                <td className="text-right text-slate-700">
                  {item.latestExpenseDate ? formatDate(item.latestExpenseDate) : "-"}
                </td>
                <td className="text-right font-semibold text-slate-900">
                  {formatCurrency(item.totalExpense)}
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Belum ada data pengeluaran project.
                </td>
              </tr>
            ) : null}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
