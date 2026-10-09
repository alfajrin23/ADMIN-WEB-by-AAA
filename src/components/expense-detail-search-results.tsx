"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  deleteManyExpensesAction,
  deleteExpenseAction,
  updateExpenseAction,
  updateManyExpensesAction,
} from "@/app/actions/expense.action";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { CloseIcon, EditIcon, ExcelIcon, EyeIcon, SaveIcon, TrashIcon } from "@/components/icons";
import { EditExpenseModal } from "@/components/edit-expense-modal";
import {
  OptimisticMutationNotice,
  useOptimisticMutation,
} from "@/components/optimistic-mutation-notice";
import {
  getCostCategoryLabel,
  getCostCategoryStyle,
  SPECIALIST_COST_PRESETS,
} from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Project, ProjectExpenseSearchResult } from "@/lib/types";

type ExpenseCategoryOption = {
  value: string;
  label: string;
};

type ExpenseDetailSearchResultsProps = {
  results: ProjectExpenseSearchResult[];
  totalCount: number;
  totalProjects: number;
  totalAmount: number;
  page: number;
  pageSize: number;
  projects: Project[];
  filters: {
    query: string;
    refineQuery: string;
    from: string;
    to: string;
    year: string;
    client: string;
    projectId: string;
    category: string;
    date: string;
  };
  onFilterChange: (filters: Partial<ExpenseDetailSearchResultsProps["filters"]>) => void;
  onPageChange: (page: number) => void;
  projectSearchText?: string;
  canEdit?: boolean;
  canExport?: boolean;
  expenseCategories?: ExpenseCategoryOption[];
  bulkEditReturnTo?: string;
};

function getClientLabel(value: string | null | undefined) {
  return value?.trim() || "Tanpa Klien";
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

type ExpenseResultActionsProps = {
  item: ProjectExpenseSearchResult;
  canEdit: boolean;
  bulkEditReturnTo: string;
  projectSearchText?: string;
  onEdit: (expenseId: string) => void;
  onDeleteSubmit: (event: FormEvent<HTMLFormElement>, item: ProjectExpenseSearchResult) => void;
};

function ExpenseResultActions({
  item,
  canEdit,
  bulkEditReturnTo,
  projectSearchText,
  onEdit,
  onDeleteSubmit,
}: ExpenseResultActionsProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Link
        href={createRekapHref(item.projectId, projectSearchText)}
        className="button-secondary button-xs w-full justify-start"
      >
        <span className="btn-icon bg-blue-100 text-blue-700">
          <EyeIcon />
        </span>
        Lihat Rekap
      </Link>
      {canEdit ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onEdit(item.expenseId)}
            className="button-soft button-xs w-full justify-center"
          >
            <span className="btn-icon bg-emerald-100 text-emerald-700">
              <EditIcon />
            </span>
            Edit
          </button>
          <form onSubmit={(event) => onDeleteSubmit(event, item)} className="w-full">
            <input type="hidden" name="expense_id" value={item.expenseId} />
            <input type="hidden" name="return_to" value={bulkEditReturnTo} />
            <ConfirmActionButton
              className="button-danger button-xs w-full justify-center"
              modalTitle="Konfirmasi Hapus"
              modalDescription={`Yakin ingin menghapus rincian biaya "${item.description ?? item.category}" pada project "${item.projectName}"? Aksi ini tidak bisa dibatalkan.`}
              confirmLabel="Ya, Hapus"
            >
              <span className="btn-icon bg-rose-100 text-rose-600">
                <TrashIcon />
              </span>
              Hapus
            </ConfirmActionButton>
          </form>
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold text-slate-500">
          Viewer
        </p>
      )}
    </div>
  );
}

export function ExpenseDetailSearchResults({
  results,
  totalCount,
  totalProjects,
  totalAmount,
  page,
  pageSize,
  projects,
  filters,
  onFilterChange,
  onPageChange,
  projectSearchText,
  canEdit = false,
  canExport = false,
  expenseCategories = [],
  bulkEditReturnTo = "/projects",
}: ExpenseDetailSearchResultsProps) {
  const [filterInputValue, setFilterInputValue] = useState(filters.refineQuery);
  const filterDebounceRef = useRef<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isBulkEditorOpen, setIsBulkEditorOpen] = useState(false);
  const [applyCategory, setApplyCategory] = useState(false);
  const [applyExpenseDate, setApplyExpenseDate] = useState(false);
  const [applyExpenseMonth, setApplyExpenseMonth] = useState(false);
  const [applyExpenseYear, setApplyExpenseYear] = useState(false);
  const [applyRequesterName, setApplyRequesterName] = useState(false);
  const [applyDescription, setApplyDescription] = useState(false);
  const [applyUsageInfo, setApplyUsageInfo] = useState(false);
  const [applyRecipientName, setApplyRecipientName] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [visibleResults, setVisibleResults] = useState(results);
  const { notice, runOptimisticMutation } = useOptimisticMutation();
  const currentYear = useMemo(() => String(new Date().getFullYear()), []);
  const currentMonth = useMemo(() => new Date().getMonth() + 1, []);
  const currentDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.id, label: project.name }))
      .sort((a, b) => a.label.localeCompare(b.label, "id-ID")),
    [projects],
  );
  const clientOptions = useMemo(
    () => Array.from(new Set(projects.map((project) => getClientLabel(project.clientName))))
      .map((label) => ({ value: label.toLowerCase(), label }))
      .sort((a, b) => a.label.localeCompare(b.label, "id-ID")),
    [projects],
  );
  const editingExpense = useMemo(
    () => visibleResults.find((item) => item.expenseId === editingExpenseId) ?? null,
    [editingExpenseId, visibleResults],
  );
  const categoryOptions = useMemo(() => {
    const categoryMap = new Map<string, string>();
    for (const item of expenseCategories) {
      categoryMap.set(item.value, item.label);
    }
    return Array.from(categoryMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "id-ID"));
  }, [expenseCategories]);

  const filteredResults = visibleResults;
  const filteredExpenseIds = useMemo(
    () => Array.from(new Set(filteredResults.map((item) => item.expenseId))),
    [filteredResults],
  );
  const isBulkActionDisabled = filteredExpenseIds.length === 0;
  const hasLocalFilters = Boolean(
    filters.refineQuery || filters.client || filters.projectId || filters.category || filters.date,
  );

  const handleExportExcel = async () => {
    if (filteredResults.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        query: filters.query,
        refineQuery: filters.refineQuery,
        from: filters.from,
        to: filters.to,
        year: filters.year,
        client: filters.client,
        projectId: filters.projectId,
        category: filters.category,
        date: filters.date,
      });
      const response = await fetch(`/api/expense-details/export?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Gagal mengambil seluruh hasil pencarian.");
      }
      const exportData = (await response.json()) as {
        results: ProjectExpenseSearchResult[];
        totalCount: number;
        totalAmount: number;
      };
      const XLSX = await import("xlsx/xlsx.mjs");
      const headers = [
        "Tanggal",
        "Klien",
        "Project",
        "Nama Pengaju",
        "Kategori",
        "Keterangan",
        "Info Penggunaan",
        "Vendor",
        "Nominal",
      ];
      const rows: Array<Array<string | number>> = [
        ["HASIL CARI RINCIAN BIAYA"],
        [`Diekspor ${new Date().toLocaleString("id-ID")}`],
        [],
        headers,
        ...exportData.results.map((item) => [
          item.expenseDate,
          getClientLabel(item.clientName),
          item.projectName,
          item.requesterName ?? "",
          getCostCategoryLabel(item.category),
          item.description ?? "",
          item.usageInfo ?? "",
          item.recipientName ?? "",
          item.amount,
        ]),
        [],
        ["TOTAL DATA", exportData.totalCount],
        ["TOTAL NOMINAL", "", "", "", "", "", "", "", exportData.totalAmount],
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 14 },
        { wch: 24 },
        { wch: 32 },
        { wch: 24 },
        { wch: 20 },
        { wch: 42 },
        { wch: 34 },
        { wch: 24 },
        { wch: 18 },
      ];
      worksheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Cari Rincian");
      XLSX.writeFile(workbook, `cari-rincian-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      window.alert("Export Excel gagal. Silakan coba lagi.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteSubmit = (
    event: FormEvent<HTMLFormElement>,
    item: ProjectExpenseSearchResult,
  ) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    void runOptimisticMutation({
      action: deleteExpenseAction,
      formData,
      pendingMessage: "Menghapus data biaya...",
      optimisticUpdate: () => {
        setVisibleResults((previous) =>
          previous.filter((result) => result.expenseId !== item.expenseId),
        );
      },
      rollback: () => {
        setVisibleResults((previous) =>
          previous.some((result) => result.expenseId === item.expenseId)
            ? previous
            : [...previous, item],
        );
      },
    });
  };

  const handleDeleteManySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const deletedIds = new Set(filteredExpenseIds);
    const snapshot = visibleResults.filter((item) => deletedIds.has(item.expenseId));
    void runOptimisticMutation({
      action: deleteManyExpensesAction,
      formData,
      pendingMessage: `Menghapus ${deletedIds.size} data biaya...`,
      optimisticUpdate: () => {
        setVisibleResults((previous) =>
          previous.filter((item) => !deletedIds.has(item.expenseId)),
        );
      },
      rollback: () => {
        setVisibleResults((previous) => {
          const existingIds = new Set(previous.map((item) => item.expenseId));
          return [...previous, ...snapshot.filter((item) => !existingIds.has(item.expenseId))];
        });
      },
    });
  };

  const handleUpdateManySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const updatedIds = new Set(filteredExpenseIds);
    const snapshot = visibleResults;
    const has = (key: string) => formData.get(key) === "1";
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const nextCategory = text("category_custom") || text("category");
    const nextDate = text("expense_date");
    const nextMonth = text("expense_month").padStart(2, "0");
    const nextYear = text("expense_year").padStart(4, "0");

    void runOptimisticMutation({
      action: updateManyExpensesAction,
      formData,
      pendingMessage: `Memperbarui ${updatedIds.size} data biaya...`,
      optimisticUpdate: () => {
        setVisibleResults((previous) =>
          previous.map((item) => {
            if (!updatedIds.has(item.expenseId)) {
              return item;
            }
            let expenseDate = item.expenseDate;
            if (has("apply_expense_year") || has("apply_expense_month")) {
              const [year, month, day] = item.expenseDate.split("-");
              expenseDate = `${has("apply_expense_year") ? nextYear : year}-${
                has("apply_expense_month") ? nextMonth : month
              }-${day}`;
            } else if (has("apply_expense_date") && nextDate) {
              expenseDate = nextDate;
            }
            return {
              ...item,
              ...(has("apply_category") && nextCategory ? { category: nextCategory } : {}),
              ...(has("apply_requester_name") ? { requesterName: text("requester_name") || null } : {}),
              ...(has("apply_description") ? { description: text("description") || null } : {}),
              ...(has("apply_usage_info") ? { usageInfo: text("usage_info") || null } : {}),
              ...(has("apply_recipient_name") ? { recipientName: text("recipient_name") || null } : {}),
              expenseDate,
            };
          }),
        );
        setIsBulkEditorOpen(false);
      },
      rollback: () => {
        setVisibleResults(snapshot);
      },
    });
  };

  const handleOptimisticExpenseSave = (
    formData: FormData,
    nextValue: ProjectExpenseSearchResult,
  ) => {
    const snapshot = visibleResults;
    setEditingExpenseId(null);
    void runOptimisticMutation({
      action: updateExpenseAction,
      formData,
      pendingMessage: "Memperbarui data biaya...",
      optimisticUpdate: () => {
        setVisibleResults((previous) =>
          previous.map((item) =>
            item.expenseId === nextValue.expenseId
              ? { ...nextValue, clientName: nextValue.clientName ?? item.clientName }
              : item,
          ),
        );
      },
      rollback: () => {
        setVisibleResults(snapshot);
      },
    });
  };

  return (
    <div className="space-y-2">
      <OptimisticMutationNotice notice={notice} />
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className="block text-xs font-semibold text-slate-600">Filter hasil pencarian</label>
          {canExport ? (
            <button
              type="button"
              data-ui-button="true"
              onClick={handleExportExcel}
              disabled={isExporting || filteredResults.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="btn-icon bg-emerald-100 text-emerald-700">
                <ExcelIcon />
              </span>
              {isExporting ? "Menyiapkan Excel..." : "Export Semua Hasil"}
            </button>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={filterInputValue}
            maxLength={120}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              setFilterInputValue(nextValue);
              if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
              filterDebounceRef.current = window.setTimeout(
                () => onFilterChange({ refineQuery: nextValue }),
                500,
              );
            }}
            placeholder="Persempit hasil: nominal, tanggal, project, pengaju, keterangan, kategori, atau vendor"
            autoComplete="off"
          />
          {hasLocalFilters ? (
            <button
              type="button"
              onClick={() => {
                setFilterInputValue("");
                onFilterChange({ refineQuery: "", client: "", projectId: "", category: "", date: "" });
              }}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Reset Filter
            </button>
          ) : null}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <select value={filters.client} onChange={(event) => onFilterChange({ client: event.currentTarget.value })}>
            <option value="">Semua klien</option>
            {clientOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={filters.projectId} onChange={(event) => onFilterChange({ projectId: event.currentTarget.value })}>
            <option value="">Semua project</option>
            {projectOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={filters.category} onChange={(event) => onFilterChange({ category: event.currentTarget.value })}>
            <option value="">Semua kategori</option>
            {categoryOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.date}
            onChange={(event) => onFilterChange({ date: event.currentTarget.value })}
            autoComplete="off"
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Menampilkan {filteredResults.length} baris pada halaman {page}.
        </p>
      </div>

      {canEdit ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-emerald-700">Aksi massal berdasarkan hasil filter</p>
              <p className="text-[11px] text-emerald-700/90">
                Edit All dan Delete All akan diterapkan ke {filteredExpenseIds.length} rincian yang sedang tampil.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-ui-button="true"
                disabled={isBulkActionDisabled}
                onClick={() => setIsBulkEditorOpen(true)}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Buka Edit All
              </button>
              <form onSubmit={handleDeleteManySubmit}>
                <input type="hidden" name="return_to" value={bulkEditReturnTo} />
                {filteredExpenseIds.map((expenseId) => (
                  <input
                    key={`bulk-delete-expense-${expenseId}`}
                    type="hidden"
                    name="expense_id"
                    value={expenseId}
                  />
                ))}
                <ConfirmActionButton
                  disabled={isBulkActionDisabled}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  modalTitle="Konfirmasi Delete All"
                  modalDescription={`Yakin ingin menghapus ${filteredExpenseIds.length} rincian biaya yang sedang tampil?`}
                  confirmLabel="Ya, Delete All"
                >
                  <span className="btn-icon bg-rose-100 text-rose-700">
                    <TrashIcon />
                  </span>
                  Delete All
                </ConfirmActionButton>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit All Modal */}
      {isBulkEditorOpen ? (
        <div className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setIsBulkEditorOpen(false)}
            aria-label="Tutup modal edit all"
            className="absolute inset-0 bg-slate-950/45"
          />
          <section className="modal-card panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit All - {filteredExpenseIds.length} Rincian</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Centang field yang ingin diubah. Field yang tidak dicentang tidak akan diubah.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkEditorOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                <span className="btn-icon bg-slate-100 text-slate-600">
                  <CloseIcon />
                </span>
                Tutup
              </button>
            </div>

            <form onSubmit={handleUpdateManySubmit} className="mt-4 space-y-3">
              <input type="hidden" name="return_to" value={bulkEditReturnTo} />
              {filteredExpenseIds.map((expenseId) => (
                <input key={`bulk-expense-${expenseId}`} type="hidden" name="expense_id" value={expenseId} />
              ))}

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
                  defaultValue={currentDate}
                  disabled={!applyExpenseDate}
                  required={applyExpenseDate}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name="apply_expense_month"
                    value="1"
                    checked={applyExpenseMonth}
                    onChange={(event) => setApplyExpenseMonth(event.currentTarget.checked)}
                  />
                  Ubah bulan saja
                </label>
                <select
                  name="expense_month"
                  defaultValue={currentMonth}
                  disabled={!applyExpenseMonth}
                  required={applyExpenseMonth}
                >
                  <option value="1">Januari</option>
                  <option value="2">Februari</option>
                  <option value="3">Maret</option>
                  <option value="4">April</option>
                  <option value="5">Mei</option>
                  <option value="6">Juni</option>
                  <option value="7">Juli</option>
                  <option value="8">Agustus</option>
                  <option value="9">September</option>
                  <option value="10">Oktober</option>
                  <option value="11">November</option>
                  <option value="12">Desember</option>
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name="apply_expense_year"
                    value="1"
                    checked={applyExpenseYear}
                    onChange={(event) => setApplyExpenseYear(event.currentTarget.checked)}
                  />
                  Ubah tahun saja
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  name="expense_year"
                  min={1900}
                  max={9999}
                  step={1}
                  defaultValue={currentYear}
                  placeholder="Contoh: 2026"
                  disabled={!applyExpenseYear}
                  required={applyExpenseYear}
                />
              </div>

              {applyExpenseDate && (applyExpenseYear || applyExpenseMonth) ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                  Jika opsi Ubah tanggal dicentang bersamaan dengan Ubah bulan/tahun, maka
                  {' '}&quot;Ubah tanggal&quot; yang akan digunakan.
                </div>
              ) : null}

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
          </section>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Total Hasil
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{totalCount.toLocaleString("id-ID")} data</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Project Terlibat
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{totalProjects.toLocaleString("id-ID")} project</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Total Nominal
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(totalAmount)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        <p>
          Ditampilkan {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} dari {totalCount.toLocaleString("id-ID")} data. Ringkasan dihitung dari seluruh hasil pencarian.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="button-secondary button-xs disabled:opacity-50">Sebelumnya</button>
          <span>Halaman {page} dari {Math.max(1, Math.ceil(totalCount / pageSize))}</span>
          <button type="button" disabled={page >= Math.ceil(totalCount / pageSize)} onClick={() => onPageChange(page + 1)} className="button-secondary button-xs disabled:opacity-50">Berikutnya</button>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        {filteredResults.map((item) => (
          <article
            key={item.expenseId}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-200 hover:border-indigo-100 hover:bg-indigo-50/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  {formatDate(item.expenseDate)}
                </p>
                <p className="mt-1.5 break-words text-sm font-semibold text-slate-900">
                  {item.projectName}
                </p>
                <p className="mt-1 break-words text-[11px] text-slate-500">
                  Pengaju: {item.requesterName ?? "-"}
                </p>
              </div>
              <p
                className={`shrink-0 text-right text-sm font-semibold ${
                  item.amount < 0 ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {formatCurrency(item.amount)}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getCostCategoryStyle(item.category)}`}
              >
                {getCostCategoryLabel(item.category)}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                Vendor: {item.recipientName ?? "-"}
              </span>
            </div>

            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
              <p className="break-words text-sm text-slate-700">{item.description ?? "-"}</p>
              <p className="mt-1 break-words text-[11px] text-slate-500">
                {item.usageInfo ?? "Tanpa info penggunaan"}
              </p>
            </div>

            <div className="mt-4">
              <ExpenseResultActions
                item={item}
                canEdit={canEdit}
                bulkEditReturnTo={bulkEditReturnTo}
                projectSearchText={projectSearchText}
                onEdit={setEditingExpenseId}
                onDeleteSubmit={handleDeleteSubmit}
              />
            </div>
          </article>
        ))}
        {filteredResults.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
            Tidak ada data yang cocok dengan filter hasil.
          </p>
        ) : null}
      </div>

      <div className="table-card hidden lg:block">
        <div className="data-table-shell">
          <table className="data-table data-table--sticky data-table--compact min-w-[1180px] table-fixed text-[12px] leading-5">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="w-[120px]">Tanggal</th>
                <th className="w-[220px]">Project</th>
                <th className="w-[170px]">Nama Pengaju</th>
                <th className="w-[360px]">Keterangan</th>
                <th className="w-[140px] text-right">Nominal</th>
                <th className="w-[190px]">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((item) => (
                <tr key={item.expenseId} className="group transition-colors duration-200 hover:bg-indigo-50/50">
                  <td className="align-top whitespace-nowrap text-[11px] group-hover:text-indigo-900">
                    {formatDate(item.expenseDate)}
                  </td>
                  <td className="align-top">
                    <p className="break-words font-semibold text-slate-900">{item.projectName}</p>
                    <p className="mt-1 break-words text-[11px] text-slate-500">
                      Vendor: {item.recipientName ?? "-"}
                    </p>
                  </td>
                  <td className="align-top break-words">{item.requesterName ?? "-"}</td>
                  <td className="align-top">
                    <p className="break-words text-slate-800">{item.description ?? "-"}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${getCostCategoryStyle(item.category)}`}
                      >
                        {getCostCategoryLabel(item.category)}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-[11px] text-slate-500">
                      {item.usageInfo ?? "Tanpa info penggunaan"}
                    </p>
                  </td>
                  <td
                    className={`align-top text-right text-[11px] font-semibold ${
                      item.amount < 0 ? "text-rose-700" : "text-emerald-700"
                    }`}
                  >
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="align-top">
                    <ExpenseResultActions
                      item={item}
                      canEdit={canEdit}
                      bulkEditReturnTo={bulkEditReturnTo}
                      projectSearchText={projectSearchText}
                      onEdit={setEditingExpenseId}
                      onDeleteSubmit={handleDeleteSubmit}
                    />
                  </td>
                </tr>
              ))}
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Tidak ada data yang cocok dengan filter hasil.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        <p>
          Ditampilkan {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} dari {totalCount.toLocaleString("id-ID")} data. Ringkasan dihitung dari seluruh hasil pencarian.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="button-secondary button-xs disabled:opacity-50">Sebelumnya</button>
          <span>Halaman {page} dari {Math.max(1, Math.ceil(totalCount / pageSize))}</span>
          <button type="button" disabled={page >= Math.ceil(totalCount / pageSize)} onClick={() => onPageChange(page + 1)} className="button-secondary button-xs disabled:opacity-50">Berikutnya</button>
        </div>
      </div>

      {editingExpenseId ? (
        <EditExpenseModal
          expenseId={editingExpenseId}
          initialExpense={editingExpense}
          initialProjects={projectOptions.map((project) => ({ id: project.value, name: project.label }))}
          initialExpenseCategories={categoryOptions}
          onClose={() => setEditingExpenseId(null)}
          onOptimisticSave={handleOptimisticExpenseSave}
        />
      ) : null}
    </div>
  );
}
