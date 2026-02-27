"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { updateManyExpensesAction } from "@/app/actions";
import { EditIcon, EyeIcon, SaveIcon } from "@/components/icons";
import { SPECIALIST_COST_PRESETS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ProjectExpenseSearchResult } from "@/lib/types";

type ExpenseCategoryOption = {
  value: string;
  label: string;
};

type ExpenseDetailSearchResultsProps = {
  results: ProjectExpenseSearchResult[];
  projectSearchText?: string;
  canEdit?: boolean;
  expenseCategories?: ExpenseCategoryOption[];
  bulkEditReturnTo?: string;
};

function normalizeFilterQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getDigits(value: string) {
  return value.replace(/\D/g, "");
}

function buildLocalSearchHaystack(item: ProjectExpenseSearchResult) {
  const absoluteAmount = Math.round(Math.abs(item.amount));
  const groupedAmount = absoluteAmount.toLocaleString("id-ID");
  return [
    item.projectName,
    item.requesterName ?? "",
    item.description ?? "",
    item.usageInfo ?? "",
    String(item.amount),
    String(absoluteAmount),
    groupedAmount,
    `rp ${groupedAmount}`,
    `rp${groupedAmount}`,
  ]
    .join(" ")
    .toLowerCase();
}

function createRekapHref(projectId: string, projectSearchText?: string) {
  const query = new URLSearchParams();
  query.set("project", projectId);
  query.set("view", "rekap");
  const trimmedSearchText = projectSearchText?.trim();
  if (trimmedSearchText) {
    query.set("q", trimmedSearchText);
  }
  return `/projects?${query.toString()}`;
}

export function ExpenseDetailSearchResults({
  results,
  projectSearchText,
  canEdit = false,
  expenseCategories = [],
  bulkEditReturnTo = "/projects",
}: ExpenseDetailSearchResultsProps) {
  const [filterQuery, setFilterQuery] = useState("");
  const [isBulkEditorOpen, setIsBulkEditorOpen] = useState(false);
  const [applyCategory, setApplyCategory] = useState(false);
  const [applyExpenseDate, setApplyExpenseDate] = useState(false);
  const [applyRequesterName, setApplyRequesterName] = useState(false);
  const [applyDescription, setApplyDescription] = useState(false);
  const [applyUsageInfo, setApplyUsageInfo] = useState(false);
  const [applyRecipientName, setApplyRecipientName] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const filteredResults = useMemo(() => {
    const normalizedFilterQuery = normalizeFilterQuery(filterQuery);
    if (!normalizedFilterQuery) {
      return results;
    }

    const queryDigits = getDigits(normalizedFilterQuery);
    return results.filter((item) => {
      if (buildLocalSearchHaystack(item).includes(normalizedFilterQuery)) {
        return true;
      }
      if (!queryDigits) {
        return false;
      }
      const amountDigits = getDigits(String(Math.round(Math.abs(item.amount))));
      return amountDigits.includes(queryDigits);
    });
  }, [filterQuery, results]);
  const filteredExpenseIds = useMemo(
    () => Array.from(new Set(filteredResults.map((item) => item.expenseId))),
    [filteredResults],
  );
  const isBulkActionDisabled = filteredExpenseIds.length === 0;

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <label className="mb-1 block text-xs font-semibold text-slate-600">Filter hasil pencarian</label>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.currentTarget.value)}
            placeholder="Contoh: 1.500.000, semen, baut 8 mm"
            autoComplete="off"
          />
          {filterQuery ? (
            <button
              type="button"
              onClick={() => setFilterQuery("")}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Reset Filter
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Menampilkan {filteredResults.length} dari {results.length} data.
        </p>
      </div>

      {canEdit ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-emerald-700">Edit All berdasarkan hasil filter</p>
              <p className="text-[11px] text-emerald-700/90">
                Update massal akan diterapkan ke {filteredExpenseIds.length} rincian yang sedang tampil.
              </p>
            </div>
            <button
              type="button"
              data-ui-button="true"
              disabled={isBulkActionDisabled}
              onClick={() => setIsBulkEditorOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBulkEditorOpen ? "Tutup Edit All" : "Buka Edit All"}
            </button>
          </div>

          {isBulkEditorOpen ? (
            <form action={updateManyExpensesAction} className="mt-3 space-y-3">
              <input type="hidden" name="return_to" value={bulkEditReturnTo} />
              {filteredExpenseIds.map((expenseId) => (
                <input key={`bulk-expense-${expenseId}`} type="hidden" name="expense_id" value={expenseId} />
              ))}

              <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[11px] text-emerald-700">
                Centang field yang ingin diubah. Field yang tidak dicentang tidak akan diubah.
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name="apply_category"
                    value="1"
                    checked={applyCategory}
                    onChange={(event) => setApplyCategory(event.currentTarget.checked)}
                  />
                  Ubah kategori
                </label>
                <select
                  name="category"
                  defaultValue={expenseCategories[0]?.value ?? ""}
                  disabled={!applyCategory}
                  required={applyCategory}
                >
                  {expenseCategories.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="category_custom"
                  placeholder="Kategori baru (opsional)"
                  disabled={!applyCategory}
                />
                <select name="specialist_type" defaultValue="" disabled={!applyCategory}>
                  <option value="">Spesialis preset (opsional)</option>
                  {SPECIALIST_COST_PRESETS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <input
                name="specialist_type_custom"
                placeholder="Spesialis custom (opsional)"
                disabled={!applyCategory}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name="apply_expense_date"
                    value="1"
                    checked={applyExpenseDate}
                    onChange={(event) => setApplyExpenseDate(event.currentTarget.checked)}
                  />
                  Ubah tanggal
                </label>
                <input
                  type="date"
                  name="expense_date"
                  defaultValue={today}
                  disabled={!applyExpenseDate}
                  required={applyExpenseDate}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name="apply_requester_name"
                    value="1"
                    checked={applyRequesterName}
                    onChange={(event) => setApplyRequesterName(event.currentTarget.checked)}
                  />
                  Ubah nama pengaju
                </label>
                <input
                  name="requester_name"
                  placeholder="Nama pengaju baru"
                  disabled={!applyRequesterName}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name="apply_description"
                    value="1"
                    checked={applyDescription}
                    onChange={(event) => setApplyDescription(event.currentTarget.checked)}
                  />
                  Ubah keterangan
                </label>
                <input name="description" placeholder="Keterangan baru" disabled={!applyDescription} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name="apply_usage_info"
                    value="1"
                    checked={applyUsageInfo}
                    onChange={(event) => setApplyUsageInfo(event.currentTarget.checked)}
                  />
                  Ubah info penggunaan
                </label>
                <input
                  name="usage_info"
                  placeholder="Info penggunaan baru"
                  disabled={!applyUsageInfo}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name="apply_recipient_name"
                    value="1"
                    checked={applyRecipientName}
                    onChange={(event) => setApplyRecipientName(event.currentTarget.checked)}
                  />
                  Ubah penerima/vendor
                </label>
                <input
                  name="recipient_name"
                  placeholder="Penerima/vendor baru"
                  disabled={!applyRecipientName}
                />
              </div>

              <button
                type="submit"
                data-ui-button="true"
                disabled={isBulkActionDisabled}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="btn-icon icon-float-soft bg-white/20 text-white">
                  <SaveIcon />
                </span>
                Simpan Edit All
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-500">
              <th className="w-[120px] border border-slate-200 px-3 py-2 font-medium">Tanggal</th>
              <th className="w-[180px] border border-slate-200 px-3 py-2 font-medium">Project</th>
              <th className="w-[160px] border border-slate-200 px-3 py-2 font-medium">Nama Pengaju</th>
              <th className="border border-slate-200 px-3 py-2 font-medium">Keterangan</th>
              <th className="w-[140px] border border-slate-200 px-3 py-2 text-right font-medium">Nominal</th>
              <th className="w-[180px] border border-slate-200 px-3 py-2 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.map((item) => (
              <tr key={item.expenseId}>
                <td className="border border-slate-200 px-3 py-2 align-top">{formatDate(item.expenseDate)}</td>
                <td className="border border-slate-200 px-3 py-2 align-top font-medium text-slate-900">
                  {item.projectName}
                </td>
                <td className="border border-slate-200 px-3 py-2 align-top">{item.requesterName ?? "-"}</td>
                <td className="border border-slate-200 px-3 py-2 align-top">
                  <p>{item.description ?? "-"}</p>
                  <p className="text-xs text-slate-500">{item.usageInfo ?? "-"}</p>
                </td>
                <td
                  className={`border border-slate-200 px-3 py-2 text-right font-semibold ${
                    item.amount < 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {formatCurrency(item.amount)}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-right align-top">
                  <div className="flex items-center justify-end gap-2">
                    {canEdit ? (
                      <Link
                        href={`/projects/expenses/edit?id=${item.expenseId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
                      >
                        <span className="btn-icon bg-emerald-100 text-emerald-700">
                          <EditIcon />
                        </span>
                        Edit
                      </Link>
                    ) : null}
                    <Link
                      href={createRekapHref(item.projectId, projectSearchText)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                    >
                      <span className="btn-icon bg-blue-100 text-blue-700">
                        <EyeIcon />
                      </span>
                      Lihat Rekap
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {filteredResults.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-slate-200 px-3 py-4 text-center text-slate-500">
                  Tidak ada data yang cocok dengan filter hasil.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
