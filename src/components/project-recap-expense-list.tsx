"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { deleteExpenseAction } from "@/app/actions";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { EditIcon, TrashIcon } from "@/components/icons";
import {
  getCostCategoryLabel,
  getCostCategoryStyle,
  mergeExpenseCategoryOptions,
  resolveSummaryCostCategory,
} from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ExpenseEntry } from "@/lib/types";

type ExpenseCategoryOption = {
  value: string;
  label: string;
};

type ProjectRecapExpenseListProps = {
  projectId: string;
  expenses: ExpenseEntry[];
  expenseCategories: ExpenseCategoryOption[];
  canEdit?: boolean;
  searchText?: string;
};

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toCompactSearchToken(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function getDigits(value: string) {
  return value.replace(/\D/g, "");
}

function buildDateSearchTokens(value: string) {
  const dateOnly = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) {
    return [dateOnly].filter((item) => item.length > 0);
  }
  const [, year, month, day] = match;
  return [
    dateOnly,
    `${day}-${month}-${year}`,
    `${day}/${month}/${year}`,
    `${year}${month}${day}`,
    `${day}${month}${year}`,
    `${year}-${month}`,
  ];
}

function buildExpenseHaystack(item: ExpenseEntry) {
  const absoluteAmount = Math.round(Math.abs(item.amount));
  const groupedAmount = absoluteAmount.toLocaleString("id-ID");
  return [
    ...buildDateSearchTokens(item.expenseDate),
    `tanggal ${item.expenseDate.slice(0, 10)}`,
    item.requesterName ?? "",
    `pengaju ${item.requesterName ?? ""}`,
    item.description ?? "",
    item.usageInfo ?? "",
    item.recipientName ?? "",
    `vendor ${item.recipientName ?? ""}`,
    getCostCategoryLabel(item.category),
    item.category,
    String(item.amount),
    String(absoluteAmount),
    groupedAmount,
    `rp ${groupedAmount}`,
    `rp${groupedAmount}`,
  ]
    .join(" ")
    .toLowerCase();
}

function createProjectsHref(params: {
  projectId: string;
  searchText?: string;
  view: "rekap";
}) {
  const query = new URLSearchParams();
  query.set("project", params.projectId);
  query.set("view", params.view);
  const trimmedSearch = params.searchText?.trim();
  if (trimmedSearch) {
    query.set("q", trimmedSearch);
  }
  return `/projects?${query.toString()}`;
}

export function ProjectRecapExpenseList({
  projectId,
  expenses,
  expenseCategories,
  canEdit = false,
  searchText,
}: ProjectRecapExpenseListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const sortedExpenses = useMemo(
    () =>
      expenses.slice().sort((a, b) => {
        if (a.expenseDate !== b.expenseDate) {
          return a.expenseDate.localeCompare(b.expenseDate);
        }
        return (a.requesterName ?? "").localeCompare(b.requesterName ?? "", "id-ID");
      }),
    [expenses],
  );

  const categoryOptions = useMemo(
    () => mergeExpenseCategoryOptions(expenseCategories, sortedExpenses.map((item) => item.category)),
    [expenseCategories, sortedExpenses],
  );

  const filteredExpenses = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery);
    const queryDigits = getDigits(normalizedQuery);
    const queryTerms = normalizedQuery.split(" ").filter((item) => item.length > 0);
    const compactQuery = toCompactSearchToken(normalizedQuery);

    return sortedExpenses.filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = buildExpenseHaystack(item);
      if (haystack.includes(normalizedQuery)) {
        return true;
      }
      if (queryTerms.length > 1 && queryTerms.every((term) => haystack.includes(term))) {
        return true;
      }
      if (compactQuery && toCompactSearchToken(haystack).includes(compactQuery)) {
        return true;
      }
      if (!queryDigits) {
        return false;
      }
      const amountDigits = getDigits(String(Math.round(Math.abs(item.amount))));
      return amountDigits.includes(queryDigits);
    });
  }, [categoryFilter, searchQuery, sortedExpenses]);

  const filteredCategoryTotals = useMemo(() => {
    const totalsByCategory = new Map<string, number>();
    for (const expense of filteredExpenses) {
      const category = resolveSummaryCostCategory({
        category: expense.category,
        description: expense.description,
        usageInfo: expense.usageInfo,
      });
      if (!category) {
        continue;
      }
      totalsByCategory.set(category, (totalsByCategory.get(category) ?? 0) + expense.amount);
    }

    return mergeExpenseCategoryOptions(
      expenseCategories,
      filteredExpenses.map((item) =>
        resolveSummaryCostCategory({
          category: item.category,
          description: item.description,
          usageInfo: item.usageInfo,
        }),
      ),
    )
      .map((item) => ({
        category: item.value,
        label: item.label,
        total: totalsByCategory.get(item.value) ?? 0,
      }))
      .filter((item) => item.total !== 0);
  }, [expenseCategories, filteredExpenses]);

  const hasLocalFilters = Boolean(searchQuery.trim() || categoryFilter);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px_auto]">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Cari data rekap</label>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="Cari tanggal, nama pengaju, rincian, vendor, atau nominal"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Filter kategori</label>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.currentTarget.value)}
            >
              <option value="">Semua kategori</option>
              {categoryOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          {hasLocalFilters ? (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setCategoryFilter("");
                }}
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Reset Filter
              </button>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Menampilkan {filteredExpenses.length} dari {sortedExpenses.length} transaksi biaya project.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filteredCategoryTotals.map((item) => (
          <div key={item.category} className="soft-card-muted p-3">
            <p className="text-xs font-medium text-slate-500">
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getCostCategoryStyle(item.category)}`}
              >
                {item.label}
              </span>
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(item.total)}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 xl:hidden">
        {filteredExpenses.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  {formatDate(item.expenseDate)}
                </p>
                <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                  {item.requesterName ?? "-"}
                </p>
              </div>
              <p
                className={`shrink-0 text-right text-sm font-semibold ${
                  item.amount < 0 ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {item.amount < 0 ? "-" : "+"}
                {formatCurrency(Math.abs(item.amount))}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getCostCategoryStyle(item.category)}`}
              >
                {getCostCategoryLabel(item.category)}
              </span>
              {item.specialistType ? (
                <span className="rounded-full bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-700">
                  Spesialis: {item.specialistType}
                </span>
              ) : null}
            </div>

            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Rincian
                </dt>
                <dd className="mt-1 break-words text-sm text-slate-700">{item.description ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Vendor
                </dt>
                <dd className="mt-1 break-words text-sm text-slate-700">{item.recipientName ?? "-"}</dd>
              </div>
            </dl>

            <p className="mt-3 break-words rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              {item.usageInfo ?? "-"} | {item.quantity} {item.unitLabel ?? "unit"} @{" "}
              {formatCurrency(item.unitPrice)}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {canEdit ? (
                <>
                  <Link
                    href={`/projects/expenses/edit?id=${item.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <span className="btn-icon bg-emerald-100 text-emerald-700">
                      <EditIcon />
                    </span>
                    Edit
                  </Link>
                  <form action={deleteExpenseAction}>
                    <input type="hidden" name="expense_id" value={item.id} />
                    <input
                      type="hidden"
                      name="return_to"
                      value={createProjectsHref({
                        projectId,
                        searchText,
                        view: "rekap",
                      })}
                    />
                    <ConfirmActionButton
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                      modalDescription="Yakin ingin menghapus data biaya ini?"
                    >
                      <span className="btn-icon bg-rose-100 text-rose-700">
                        <TrashIcon />
                      </span>
                      Hapus
                    </ConfirmActionButton>
                  </form>
                </>
              ) : (
                <span className="text-xs font-medium text-slate-500">Viewer</span>
              )}
            </div>
          </article>
        ))}
        {filteredExpenses.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
            Tidak ada transaksi biaya yang cocok dengan filter rekap.
          </p>
        ) : null}
      </div>

      <div className="table-card hidden xl:block">
        <div className="data-table-shell">
          <table className="data-table data-table--sticky data-table--compact min-w-[980px] table-fixed text-[12px] leading-5">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="w-[11%]">Tanggal</th>
                <th className="w-[15%]">Nama Pengaju</th>
                <th className="w-[15%]">Kategori</th>
                <th className="w-[29%]">Rincian</th>
                <th className="w-[12%]">Vendor</th>
                <th className="w-[10%] text-right">Nominal</th>
                <th className="w-[8%] text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((item) => (
                <tr key={item.id}>
                  <td className="align-top text-[11px] whitespace-nowrap">{formatDate(item.expenseDate)}</td>
                  <td className="align-top break-words">{item.requesterName ?? "-"}</td>
                  <td className="align-top">
                    <span
                      className={`inline-flex max-w-full rounded-full px-2 py-1 text-[10px] font-semibold ${getCostCategoryStyle(item.category)}`}
                    >
                      {getCostCategoryLabel(item.category)}
                    </span>
                    {item.specialistType ? (
                      <p className="mt-1 break-words text-[10px] font-medium text-cyan-700">
                        Spesialis: {item.specialistType}
                      </p>
                    ) : null}
                  </td>
                  <td className="align-top">
                    <p className="break-words">{item.description ?? "-"}</p>
                    <p className="mt-1 break-words text-[10px] text-slate-500">
                      {item.usageInfo ?? "-"} | {item.quantity} {item.unitLabel ?? "unit"} @{" "}
                      {formatCurrency(item.unitPrice)}
                    </p>
                  </td>
                  <td className="align-top break-words">{item.recipientName ?? "-"}</td>
                  <td
                    className={`text-right text-[11px] font-semibold ${
                      item.amount < 0 ? "text-rose-700" : "text-emerald-700"
                    }`}
                  >
                    {item.amount < 0 ? "-" : "+"}
                    {formatCurrency(Math.abs(item.amount))}
                  </td>
                  <td className="align-top">
                    <div className="flex flex-col items-end gap-1.5">
                      {canEdit ? (
                        <>
                          <Link
                            href={`/projects/expenses/edit?id=${item.id}`}
                            className="button-soft button-xs"
                          >
                            <span className="btn-icon bg-emerald-100 text-emerald-700">
                              <EditIcon />
                            </span>
                            Edit
                          </Link>
                          <form action={deleteExpenseAction}>
                            <input type="hidden" name="expense_id" value={item.id} />
                            <input
                              type="hidden"
                              name="return_to"
                              value={createProjectsHref({
                                projectId,
                                searchText,
                                view: "rekap",
                              })}
                            />
                            <ConfirmActionButton
                              className="button-danger button-xs"
                              modalDescription="Yakin ingin menghapus data biaya ini?"
                            >
                              <span className="btn-icon bg-rose-100 text-rose-700">
                                <TrashIcon />
                              </span>
                              Hapus
                            </ConfirmActionButton>
                          </form>
                        </>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">Viewer</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Tidak ada transaksi biaya yang cocok dengan filter rekap.
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
