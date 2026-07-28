"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type {
  ImportRowStatus,
  KmpMaterialImportMaster,
  KmpMaterialImportNewMaster,
  KmpMaterialImportPreview,
  KmpMaterialImportSplitPart,
  KmpMaterialImportTerm,
} from "@/lib/kmp-material-import/types";
import { normalizeImportText, normalizeMaterialKey } from "@/lib/kmp-material-import/validators";

type ReviewTab =
  | "all"
  | "ready"
  | "review"
  | "unmatched"
  | "unnamed"
  | "duplicates"
  | "ignored"
  | "error";

type ImportReviewStepProps = {
  preview: KmpMaterialImportPreview;
  expenseDate: string;
  bulkSelectedIds: Set<string>;
  ignoredReasons: Record<string, string>;
  splitByTermId: Record<string, KmpMaterialImportSplitPart[]>;
  rememberedMaterialTermIds: Set<string>;
  onExpenseDateChange: (value: string) => void;
  onBulkSelectionChange: (ids: Set<string>) => void;
  onUpdateTerm: (termId: string, patch: Partial<KmpMaterialImportTerm>) => void;
  onBulkUpdate: (termIds: string[], patch: Partial<KmpMaterialImportTerm>) => void;
  onIgnore: (termId: string, reason: string | null) => void;
  onSplitChange: (termId: string, split: KmpMaterialImportSplitPart[] | null) => void;
  onRememberMaterialChange: (termId: string, checked: boolean) => void;
  onAddNewMaster: (master: KmpMaterialImportNewMaster) => void;
  onBack: () => void;
  onNext: () => void;
};

const REVIEW_STATUSES = new Set<ImportRowStatus>([
  "needs_project_match",
  "ambiguous_project",
  "unmatched_project",
  "needs_material_mapping",
  "needs_material_name",
  "needs_split_review",
  "needs_review_partial_material",
  "baseline_mismatch",
  "formula_mismatch",
  "possible_duplicate",
]);

const ERROR_STATUSES = new Set<ImportRowStatus>([
  "error",
  "unsupported_formula",
  "formula_mismatch",
]);

function statusClass(status: ImportRowStatus, ignored: boolean) {
  if (ignored) {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }
  if (status === "ready") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "already_exists") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }
  if (status === "will_update") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (ERROR_STATUSES.has(status)) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function parseRupiahInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function ImportReviewStep({
  preview,
  expenseDate,
  bulkSelectedIds,
  ignoredReasons,
  splitByTermId,
  rememberedMaterialTermIds,
  onExpenseDateChange,
  onBulkSelectionChange,
  onUpdateTerm,
  onBulkUpdate,
  onIgnore,
  onSplitChange,
  onRememberMaterialChange,
  onAddNewMaster,
  onBack,
  onNext,
}: ImportReviewStepProps) {
  const [tab, setTab] = useState<ReviewTab>("all");
  const [sheetFilter, setSheetFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [amountFilter, setAmountFilter] = useState("");
  const [query, setQuery] = useState("");
  const [checkedOnly, setCheckedOnly] = useState(false);
  const [bulkMaterialKey, setBulkMaterialKey] = useState("");
  const [bulkSubmissionName, setBulkSubmissionName] = useState("");
  const [bulkIgnoreReason, setBulkIgnoreReason] = useState("");
  const [showNewMaster, setShowNewMaster] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newSubmissionName, setNewSubmissionName] = useState("");
  const [newStandardAmount, setNewStandardAmount] = useState("");
  const [newMinimumAmount, setNewMinimumAmount] = useState("");
  const [newChecklistType, setNewChecklistType] = useState<"none" | "system" | "manual">("system");
  const [newChecklistStatus, setNewChecklistStatus] = useState<"auto" | "pending" | "fulfilled">("auto");
  const [newAlias, setNewAlias] = useState("");
  const [newMasterError, setNewMasterError] = useState("");

  const allRows = useMemo(
    () =>
      preview.projects.flatMap((project) =>
        project.terms.map((term) => ({ project, term })),
      ),
    [preview.projects],
  );
  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeImportText(query);
    const normalizedAmount = amountFilter.replace(/[^\d]/g, "");
    return allRows.filter(({ project, term }) => {
      const ignored = Object.hasOwn(ignoredReasons, term.id);
      if (tab === "ready" && term.status !== "ready" && term.status !== "will_update") {
        return false;
      }
      if (tab === "review" && !REVIEW_STATUSES.has(term.status)) {
        return false;
      }
      if (
        tab === "unmatched" &&
        term.status !== "needs_project_match" &&
        term.status !== "ambiguous_project" &&
        term.status !== "unmatched_project"
      ) {
        return false;
      }
      if (tab === "unnamed" && term.status !== "needs_material_name") {
        return false;
      }
      if (
        tab === "duplicates" &&
        term.status !== "already_exists" &&
        term.status !== "will_update" &&
        term.status !== "possible_duplicate"
      ) {
        return false;
      }
      if (tab === "ignored" && !ignored) {
        return false;
      }
      if (tab === "error" && !ERROR_STATUSES.has(term.status)) {
        return false;
      }
      if (sheetFilter && project.sourceSheet !== sheetFilter) {
        return false;
      }
      if (districtFilter && project.district !== districtFilter) {
        return false;
      }
      if (statusFilter && term.status !== statusFilter) {
        return false;
      }
      if (sourceFilter && term.sourceType !== sourceFilter) {
        return false;
      }
      if (normalizedAmount && String(term.amount) !== normalizedAmount) {
        return false;
      }
      if (checkedOnly && !term.approved) {
        return false;
      }
      if (normalizedQuery) {
        const haystack = normalizeImportText(
          [
            project.excelProjectName,
            project.district,
            term.sourceLabel,
            term.materialName,
            term.submissionName,
            term.sourceReference,
            term.status,
          ].join(" "),
        );
        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }
      return true;
    });
  }, [
    allRows,
    amountFilter,
    checkedOnly,
    districtFilter,
    ignoredReasons,
    query,
    sheetFilter,
    sourceFilter,
    statusFilter,
    tab,
  ]);

  const selectedRows = allRows.filter(({ term }) => bulkSelectedIds.has(term.id));
  const sheetOptions = Array.from(new Set(preview.projects.map((project) => project.sourceSheet)));
  const districtOptions = Array.from(new Set(preview.projects.map((project) => project.district))).sort(
    (left, right) => left.localeCompare(right, "id-ID"),
  );
  const statusOptions = Array.from(new Set(allRows.map(({ term }) => term.status))).sort();

  const toggleAllVisible = (checked: boolean) => {
    const next = new Set(bulkSelectedIds);
    for (const { term } of filteredRows) {
      if (checked) {
        next.add(term.id);
      } else {
        next.delete(term.id);
      }
    }
    onBulkSelectionChange(next);
  };

  const applyBulkMaterial = () => {
    const master = preview.materials.find((item) => item.materialKey === bulkMaterialKey);
    if (!master || selectedRows.length === 0) {
      return;
    }
    for (const { term } of selectedRows) {
      onSplitChange(term.id, null);
    }
    onBulkUpdate(
      selectedRows.map(({ term }) => term.id),
      {
        materialKey: master.materialKey,
        materialName: master.materialName,
        submissionName: master.submissionName,
        confidence: "Manual",
        status: "ready",
      },
    );
  };

  const selectSame = (kind: "amount" | "label") => {
    const anchor = selectedRows[0]?.term;
    if (!anchor) {
      return;
    }
    const next = new Set(bulkSelectedIds);
    for (const { term } of allRows) {
      if (
        (kind === "amount" && term.amount === anchor.amount) ||
        (kind === "label" &&
          normalizeImportText(term.sourceLabel) === normalizeImportText(anchor.sourceLabel))
      ) {
        next.add(term.id);
      }
    }
    onBulkSelectionChange(next);
  };

  const addNewMaster = () => {
    const materialName = newMaterialName.trim();
    const materialKey = normalizeMaterialKey(materialName);
    if (!materialName || !materialKey) {
      setNewMasterError("Nama material wajib diisi.");
      return;
    }
    if (preview.materials.some((master) => master.materialKey === materialKey)) {
      setNewMasterError("Material dengan key tersebut sudah ada.");
      return;
    }
    onAddNewMaster({
      clientKey: "kmp cianjur",
      materialKey,
      materialName,
      submissionName: newSubmissionName.trim() || null,
      standardAmount: parseRupiahInput(newStandardAmount),
      minimumAmount: parseRupiahInput(newMinimumAmount),
      checklistType: newChecklistType,
      checklistStatus: newChecklistStatus,
      aliases: newAlias.trim() ? [newAlias.trim()] : [],
    });
    setBulkMaterialKey(materialKey);
    setNewMasterError("");
    setNewMaterialName("");
    setNewSubmissionName("");
    setNewStandardAmount("");
    setNewMinimumAmount("");
    setNewAlias("");
    setShowNewMaster(false);
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 rounded-xl border border-blue-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">
              Tanggal biaya
            </label>
            <input
              type="date"
              value={expenseDate}
              onChange={(event) => onExpenseDateChange(event.currentTarget.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">
              Master untuk {selectedRows.length} baris terpilih
            </label>
            <select
              value={bulkMaterialKey}
              onChange={(event) => setBulkMaterialKey(event.currentTarget.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            >
              <option value="">Pilih master material...</option>
              {preview.materials.map((master) => (
                <option key={master.materialKey} value={master.materialKey}>
                  {master.materialName}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!bulkMaterialKey || selectedRows.length === 0}
            onClick={applyBulkMaterial}
            className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Terapkan master
          </button>
          <button
            type="button"
            onClick={() => setShowNewMaster((value) => !value)}
            className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700"
          >
            Buat Master Material Baru
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input
            value={bulkSubmissionName}
            onChange={(event) => setBulkSubmissionName(event.currentTarget.value)}
            placeholder="Nama pengajuan untuk baris terpilih"
            className="min-w-60 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={!bulkSubmissionName.trim() || selectedRows.length === 0}
            onClick={() =>
              onBulkUpdate(
                selectedRows.map(({ term }) => term.id),
                { submissionName: bulkSubmissionName.trim() },
              )
            }
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
          >
            Terapkan pengajuan
          </button>
          <input
            value={bulkIgnoreReason}
            onChange={(event) => setBulkIgnoreReason(event.currentTarget.value)}
            placeholder="Alasan abaikan massal"
            className="min-w-52 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={!bulkIgnoreReason.trim() || selectedRows.length === 0}
            onClick={() =>
              selectedRows.forEach(({ term }) =>
                onIgnore(term.id, bulkIgnoreReason.trim()),
              )
            }
            className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Abaikan terpilih
          </button>
          <button
            type="button"
            disabled={selectedRows.length === 0}
            onClick={() => selectedRows.forEach(({ term }) => onIgnore(term.id, null))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"
          >
            Batalkan abaikan
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const ids = allRows
                .filter(
                  ({ term }) =>
                    term.projectId &&
                    term.materialKey &&
                    (term.status === "ready" || term.status === "will_update"),
                )
                .map(({ term }) => term.id);
              onBulkSelectionChange(new Set(ids));
              onBulkUpdate(ids, { approved: true });
            }}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700"
          >
            Pilih semua baris siap
          </button>
          <button
            type="button"
            onClick={() => {
              onBulkSelectionChange(new Set());
              onBulkUpdate(allRows.map(({ term }) => term.id), { approved: false });
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600"
          >
            Batalkan semua pilihan
          </button>
          <button
            type="button"
            disabled={selectedRows.length === 0}
            onClick={() => selectSame("amount")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
          >
            Pilih nominal sama
          </button>
          <button
            type="button"
            disabled={selectedRows.length === 0}
            onClick={() => selectSame("label")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
          >
            Pilih source label sama
          </button>
          <button
            type="button"
            disabled={selectedRows.length === 0}
            onClick={() => {
              const anchor = selectedRows[0]?.term;
              if (!anchor?.projectId || !anchor.materialKey) {
                return;
              }
              onBulkSelectionChange(
                new Set(
                  allRows
                    .filter(
                      ({ term }) =>
                        term.projectId === anchor.projectId &&
                        term.materialKey === anchor.materialKey,
                    )
                    .map(({ term }) => term.id),
                ),
              );
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
          >
            Gabungkan material sama
          </button>
        </div>
      </div>

      {showNewMaster ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <h4 className="text-sm font-black text-violet-950">Master material baru</h4>
          <p className="mt-1 text-xs text-violet-700">
            Draft ini baru dibuat di database setelah konfirmasi final.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <input
              value={newMaterialName}
              onChange={(event) => setNewMaterialName(event.currentTarget.value)}
              placeholder="Nama material"
            />
            <input
              value={newSubmissionName}
              onChange={(event) => setNewSubmissionName(event.currentTarget.value)}
              placeholder="Nama pengajuan default"
            />
            <input
              inputMode="numeric"
              value={newStandardAmount}
              onChange={(event) => setNewStandardAmount(event.currentTarget.value)}
              placeholder="Standard amount"
            />
            <input
              inputMode="numeric"
              value={newMinimumAmount}
              onChange={(event) => setNewMinimumAmount(event.currentTarget.value)}
              placeholder="Nominal minimal"
            />
            <select
              value={newChecklistType}
              onChange={(event) =>
                setNewChecklistType(event.currentTarget.value as "none" | "system" | "manual")
              }
            >
              <option value="system">Checklist sistem</option>
              <option value="manual">Checklist manual</option>
              <option value="none">Tanpa nominal</option>
            </select>
            <select
              value={newChecklistStatus}
              onChange={(event) =>
                setNewChecklistStatus(
                  event.currentTarget.value as "auto" | "pending" | "fulfilled",
                )
              }
            >
              <option value="auto">Status otomatis</option>
              <option value="pending">Pending</option>
              <option value="fulfilled">Fulfilled</option>
            </select>
            <input
              value={newAlias}
              onChange={(event) => setNewAlias(event.currentTarget.value)}
              placeholder="Alias Excel"
            />
            <button
              type="button"
              onClick={addNewMaster}
              className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white"
            >
              Tambahkan ke Draft
            </button>
          </div>
          {newMasterError ? (
            <p className="mt-2 text-xs font-semibold text-red-700">{newMasterError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {[
          ["all", "Semua"],
          ["ready", "Siap Disimpan"],
          ["review", "Perlu Review"],
          ["unmatched", "Proyek Tidak Cocok"],
          ["unnamed", "Material Tanpa Nama"],
          ["duplicates", "Duplikat"],
          ["ignored", "Diabaikan"],
          ["error", "Error"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value as ReviewTab)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              tab === value
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Cari proyek/material"
          className="xl:col-span-2"
        />
        <select value={sheetFilter} onChange={(event) => setSheetFilter(event.currentTarget.value)}>
          <option value="">Semua sheet</option>
          {sheetOptions.map((sheet) => <option key={sheet}>{sheet}</option>)}
        </select>
        <select value={districtFilter} onChange={(event) => setDistrictFilter(event.currentTarget.value)}>
          <option value="">Semua kecamatan</option>
          {districtOptions.map((district) => <option key={district}>{district}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value)}>
          <option value="">Semua status</option>
          {statusOptions.map((status) => <option key={status}>{status}</option>)}
        </select>
        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.currentTarget.value)}>
          <option value="">Semua sumber</option>
          <option value="sheet_reference">Referensi sheet</option>
          <option value="local_reference">Referensi lokal</option>
          <option value="literal">Literal</option>
        </select>
        <input
          inputMode="numeric"
          value={amountFilter}
          onChange={(event) => setAmountFilter(event.currentTarget.value)}
          placeholder="Nominal exact"
        />
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={checkedOnly}
            onChange={(event) => setCheckedOnly(event.currentTarget.checked)}
          />
          Dicentang
        </label>
      </div>

      <div className="max-h-[58vh] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[2100px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
            <tr>
              <th className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={
                    filteredRows.length > 0 &&
                    filteredRows.every(({ term }) => bulkSelectedIds.has(term.id))
                  }
                  onChange={(event) => toggleAllVisible(event.currentTarget.checked)}
                />
              </th>
              <th className="px-2 py-2">Setujui</th>
              <th className="px-3 py-2">Proyek</th>
              <th className="px-3 py-2">Term / sumber</th>
              <th className="px-3 py-2">Label Excel</th>
              <th className="min-w-64 px-3 py-2">Master material</th>
              <th className="min-w-52 px-3 py-2">Nama pengajuan</th>
              <th className="px-3 py-2 text-right">Nominal</th>
              <th className="px-3 py-2">Kemunculan</th>
              <th className="min-w-64 px-3 py-2">Existing expense</th>
              <th className="px-3 py-2">Aksi</th>
              <th className="min-w-52 px-3 py-2">Status / catatan</th>
              <th className="min-w-56 px-3 py-2">Abaikan / mapping</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredRows.map(({ project, term }) => {
              const ignored = Object.hasOwn(ignoredReasons, term.id);
              const split = splitByTermId[term.id];
              const canApprove =
                Boolean(term.projectId) &&
                Boolean(term.materialKey || split?.length) &&
                term.amount > 0 &&
                term.status !== "error" &&
                term.status !== "unsupported_formula";
              return (
                <tr key={term.id} className="align-top hover:bg-slate-50">
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={bulkSelectedIds.has(term.id)}
                      onChange={(event) => {
                        const next = new Set(bulkSelectedIds);
                        if (event.currentTarget.checked) {
                          next.add(term.id);
                        } else {
                          next.delete(term.id);
                        }
                        onBulkSelectionChange(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      disabled={!canApprove || ignored}
                      checked={term.approved && !ignored}
                      onChange={(event) =>
                        onUpdateTerm(term.id, { approved: event.currentTarget.checked })
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-bold text-slate-900">{project.excelProjectName}</p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {project.district} · {term.projectName ?? "belum cocok"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-800">
                      #{term.termIndex} · {term.sourceReference ?? "literal"}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">{term.formulaCell}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-800">{term.sourceLabel ?? "-"}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{term.sourceType}</p>
                    {term.suggestedSplit ? (
                      <button
                        type="button"
                        onClick={() => onSplitChange(term.id, term.suggestedSplit)}
                        className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700"
                      >
                        Pecah Zincromate + Thiner
                      </button>
                    ) : null}
                    {split ? (
                      <div className="mt-2 rounded-lg bg-violet-50 p-2 text-[10px] text-violet-700">
                        {split.map((part) => (
                          <p key={part.materialKey}>
                            {part.materialName}: {formatCurrency(part.amount)}
                          </p>
                        ))}
                        <button
                          type="button"
                          onClick={() => onSplitChange(term.id, null)}
                          className="mt-1 font-bold underline"
                        >
                          Batalkan split
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={split ? "" : term.materialKey ?? ""}
                      disabled={ignored}
                      onChange={(event) => {
                        const master = preview.materials.find(
                          (item) => item.materialKey === event.currentTarget.value,
                        );
                        onSplitChange(term.id, null);
                        onUpdateTerm(term.id, {
                          materialKey: master?.materialKey ?? null,
                          materialName: master?.materialName ?? null,
                          submissionName: master?.submissionName ?? term.submissionName,
                          confidence: master ? "Manual" : "Unresolved",
                          status: master ? "ready" : term.sourceLabel ? "needs_material_mapping" : "needs_material_name",
                          approved: false,
                        });
                      }}
                      className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                    >
                      <option value="">Pilih material...</option>
                      {preview.materials.map((master: KmpMaterialImportMaster) => (
                        <option key={master.materialKey} value={master.materialKey}>
                          {master.materialName}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {term.materialName ?? "Belum dipilih"} · {term.confidence}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      value={term.submissionName ?? ""}
                      disabled={ignored}
                      onChange={(event) =>
                        onUpdateTerm(term.id, { submissionName: event.currentTarget.value })
                      }
                      placeholder="Nama pengajuan"
                      className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                    />
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900">
                    {formatCurrency(term.amount)}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-700">
                    {term.occurrenceCount}
                  </td>
                  <td className="px-3 py-3">
                    {term.existingExpenses.length === 0 ? (
                      <span className="text-slate-400">Tidak ada</span>
                    ) : (
                      term.existingExpenses.slice(0, 3).map((expense) => (
                        <p key={expense.id} className="mb-1 text-[10px] text-slate-600">
                          {expense.description || expense.id} · {formatCurrency(expense.amount)}
                          {" "}({expense.matchKind})
                        </p>
                      ))
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={term.action}
                      disabled={ignored}
                      onChange={(event) =>
                        onUpdateTerm(term.id, {
                          action: event.currentTarget.value as KmpMaterialImportTerm["action"],
                        })
                      }
                      className="rounded-lg border border-slate-200 px-2 py-2 text-xs"
                    >
                      <option value="insert_new">Insert</option>
                      <option value="update_existing">Update</option>
                      <option value="skip_existing">Skip</option>
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(term.status, ignored)}`}>
                      {ignored ? "ignored" : term.status}
                    </span>
                    {term.warnings.slice(0, 3).map((warning) => (
                      <p key={warning} className="mt-2 text-[10px] leading-4 text-amber-700">
                        {warning}
                      </p>
                    ))}
                  </td>
                  <td className="px-3 py-3">
                    <input
                      value={ignoredReasons[term.id] ?? ""}
                      onChange={(event) => onIgnore(term.id, event.currentTarget.value)}
                      placeholder="Alasan abaikan"
                      className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ignored ? (
                        <button
                          type="button"
                          onClick={() => onIgnore(term.id, null)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600"
                        >
                          Batalkan abaikan
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!ignoredReasons[term.id]?.trim()}
                          onClick={() => onIgnore(term.id, ignoredReasons[term.id])}
                          className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 disabled:opacity-50"
                        >
                          Abaikan
                        </button>
                      )}
                      <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          disabled={!term.sourceLabel || (!term.materialKey && !split)}
                          checked={rememberedMaterialTermIds.has(term.id)}
                          onChange={(event) =>
                            onRememberMaterialChange(term.id, event.currentTarget.checked)
                          }
                        />
                        Ingat mapping
                      </label>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredRows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          Tidak ada komponen yang cocok dengan filter.
        </p>
      ) : null}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <p className="text-sm font-semibold text-slate-700">
          {allRows.filter(({ term }) => term.approved).length} row disetujui ·{" "}
          {Object.keys(ignoredReasons).filter((id) => ignoredReasons[id]?.trim()).length} diabaikan
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600"
          >
            Kembali
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
          >
            Review Konfirmasi
          </button>
        </div>
      </div>
    </div>
  );
}
