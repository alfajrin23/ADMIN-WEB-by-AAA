"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createExpenseAction } from "@/app/actions/expense.action";
import { CheckIcon, EyeIcon, SaveIcon, SearchIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import {
  getKmpCianjurMaterialAmountOptions,
  KMP_CIANJUR_MATERIAL_CHECKLIST,
  type KmpMaterialChecklistRule,
} from "@/lib/kmp-materials";

type KmpMaterialMonitorProject = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  detectedMaterials: string[];
  missingMaterials: string[];
  detectedCount: number;
  missingCount: number;
  recapHref: string;
};

type KmpMaterialMonitorPanelProps = {
  checklistLabels: string[];
  totalProjects: number;
  completeProjectCount: number;
  incompleteProjectCount: number;
  projects: KmpMaterialMonitorProject[];
  canEdit: boolean;
  returnTo: string;
  today: string;
};

type StatusFilter = "all" | "incomplete" | "complete" | "most-detected";
type AmountMode = "none" | "system" | "manual";

type MaterialDraft = {
  selected: boolean;
  materialName: string;
  amountMode: AmountMode;
  systemAmount: string;
  manualAmount: string;
};

type MaterialSelectionRow = {
  projectId: string;
  projectName: string;
  materialKey: string;
  materialName: string;
  amountMode: AmountMode;
  systemAmount: string;
  manualAmount: string;
};

const materialRuleByLabel: ReadonlyMap<string, KmpMaterialChecklistRule> = new Map(
  KMP_CIANJUR_MATERIAL_CHECKLIST.map((item) => [item.label, item]),
);

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function normalizeDigits(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  return digits.replace(/^0+(?=\d)/, "") || "0";
}

function formatThousands(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function getMaterialDraftKey(projectId: string, label: string) {
  const ruleKey = materialRuleByLabel.get(label)?.key ?? normalizeText(label).replace(/[^a-z0-9]+/g, "_");
  return `${projectId}:${ruleKey}`;
}

function getDefaultSystemAmount(rule: KmpMaterialChecklistRule | undefined) {
  const amount = rule ? getKmpCianjurMaterialAmountOptions(rule)[0]?.amount : 0;
  return amount && amount > 0 ? String(amount) : "";
}

function createInitialMaterialDraft(label: string, rule: KmpMaterialChecklistRule | undefined): MaterialDraft {
  return {
    selected: false,
    materialName: label,
    amountMode: "none",
    systemAmount: getDefaultSystemAmount(rule),
    manualAmount: "",
  };
}

function resolveDraftAmount(draft: MaterialDraft, rule: KmpMaterialChecklistRule | undefined) {
  if (draft.amountMode === "manual") {
    return Number(normalizeDigits(draft.manualAmount)) || 0;
  }
  if (draft.amountMode === "system" && rule) {
    const options = getKmpCianjurMaterialAmountOptions(rule);
    const selectedAmount = Number(normalizeDigits(draft.systemAmount));
    return options.find((option) => option.amount === selectedAmount)?.amount ?? options[0]?.amount ?? 0;
  }
  return 0;
}

function KmpMaterialSubmitButton({
  canEdit,
  selectedCount,
}: {
  canEdit: boolean;
  selectedCount: number;
}) {
  const { pending } = useFormStatus();
  const isDisabled = !canEdit || selectedCount === 0 || pending;

  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={pending}
    >
      <span className="btn-icon bg-white/20 text-white">
        <SaveIcon />
      </span>
      {pending
        ? "Menyimpan..."
        : selectedCount > 0
          ? `Simpan Checklist (${selectedCount})`
          : "Pilih Material"}
    </button>
  );
}

export function KmpMaterialMonitorPanel({
  checklistLabels,
  totalProjects,
  completeProjectCount,
  incompleteProjectCount,
  projects,
  canEdit,
  returnTo,
  today,
}: KmpMaterialMonitorPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("incomplete");
  const [expenseDate, setExpenseDate] = useState(today);
  const [materialDrafts, setMaterialDrafts] = useState<Record<string, MaterialDraft>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 1000);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const getMaterialDraft = (projectId: string, label: string) => {
    const rule = materialRuleByLabel.get(label);
    const key = getMaterialDraftKey(projectId, label);
    return materialDrafts[key] ?? createInitialMaterialDraft(label, rule);
  };

  const updateMaterialDraft = (
    projectId: string,
    label: string,
    updater: (draft: MaterialDraft) => MaterialDraft,
  ) => {
    setMaterialDrafts((previous) => {
      const rule = materialRuleByLabel.get(label);
      const key = getMaterialDraftKey(projectId, label);
      const current = previous[key] ?? createInitialMaterialDraft(label, rule);
      return {
        ...previous,
        [key]: updater(current),
      };
    });
  };

  const selectProjectMissingMaterials = (project: KmpMaterialMonitorProject) => {
    setMaterialDrafts((previous) => {
      const next = { ...previous };
      for (const label of project.missingMaterials) {
        const rule = materialRuleByLabel.get(label);
        const key = getMaterialDraftKey(project.projectId, label);
        const current = next[key] ?? createInitialMaterialDraft(label, rule);
        next[key] = { ...current, selected: true };
      }
      return next;
    });
  };

  const filteredProjects = useMemo(() => {
    const normalizedQuery = normalizeText(debouncedSearchQuery);

    return projects
      .filter((project) => {
        if (statusFilter === "complete" && project.missingCount > 0) {
          return false;
        }
        if (statusFilter === "incomplete" && project.missingCount === 0) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }

        const haystack = normalizeText(
          [
            project.projectName,
            project.clientName,
            project.missingMaterials.join(" "),
            project.detectedMaterials.join(" "),
          ].join(" "),
        );
        return haystack.includes(normalizedQuery);
      })
      .slice()
      .sort((a, b) => {
        if (statusFilter === "most-detected") {
          if (b.detectedCount !== a.detectedCount) {
            return b.detectedCount - a.detectedCount;
          }
          if (a.missingCount !== b.missingCount) {
            return a.missingCount - b.missingCount;
          }
          return a.projectName.localeCompare(b.projectName, "id-ID");
        }
        if (b.missingCount !== a.missingCount) {
          return b.missingCount - a.missingCount;
        }
        if (a.missingCount === 0 && b.missingCount === 0 && b.detectedCount !== a.detectedCount) {
          return b.detectedCount - a.detectedCount;
        }
        return a.projectName.localeCompare(b.projectName, "id-ID");
      });
  }, [debouncedSearchQuery, projects, statusFilter]);

  const selectedMaterialRows = useMemo<MaterialSelectionRow[]>(() => {
    const rows: MaterialSelectionRow[] = [];

    for (const project of projects) {
      for (const label of project.missingMaterials) {
        const rule = materialRuleByLabel.get(label);
        if (!rule) {
          continue;
        }

        const draft = materialDrafts[getMaterialDraftKey(project.projectId, label)] ??
          createInitialMaterialDraft(label, rule);
        if (!draft.selected) {
          continue;
        }

        rows.push({
          projectId: project.projectId,
          projectName: project.projectName,
          materialKey: rule.key,
          materialName: draft.materialName.trim() || rule.label,
          amountMode: draft.amountMode,
          systemAmount: draft.systemAmount,
          manualAmount: draft.manualAmount,
        });
      }
    }

    return rows;
  }, [materialDrafts, projects]);

  const selectedMaterialPayload = useMemo(
    () => JSON.stringify(selectedMaterialRows),
    [selectedMaterialRows],
  );
  const selectedTotalAmount = useMemo(() => {
    return selectedMaterialRows.reduce((total, row) => {
      const rule = KMP_CIANJUR_MATERIAL_CHECKLIST.find((item) => item.key === row.materialKey);
      const draft: MaterialDraft = {
        selected: true,
        materialName: row.materialName,
        amountMode: row.amountMode,
        systemAmount: row.systemAmount,
        manualAmount: row.manualAmount,
      };
      return total + resolveDraftAmount(draft, rule);
    }, 0);
  }, [selectedMaterialRows]);

  return (
    <div className="mt-4 space-y-4">
      <div className="overflow-hidden rounded-[1.6rem] border border-amber-200 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_30%),linear-gradient(135deg,rgba(255,251,235,0.98)_0%,rgba(255,247,237,0.96)_52%,rgba(255,255,255,0.98)_100%)] p-4 shadow-[0_24px_60px_rgba(180,83,9,0.09)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-amber-500"></span>
              Monitoring Seluruh Project KMP
            </span>
            <h3 className="mt-3 text-xl font-black tracking-normal text-slate-950">
              Prioritaskan project yang masih belum punya input kategori material
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Centang material yang belum terdeteksi, sesuaikan nama material bila perlu,
              lalu simpan dengan nominal kosong, nominal sistem, atau nominal manual.
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Checklist Aktif
            </p>
            <p className="mt-1 text-2xl font-black tracking-normal text-slate-950">
              {checklistLabels.length}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">item material prioritas</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white/82 px-4 py-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Total Project
            </p>
            <p className="mt-1 text-2xl font-black tracking-normal text-slate-950">{totalProjects}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
              Perlu Dicek
            </p>
            <p className="mt-1 text-2xl font-black tracking-normal text-amber-950">
              {incompleteProjectCount}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/92 px-4 py-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Sudah Lengkap
            </p>
            <p className="mt-1 text-2xl font-black tracking-normal text-emerald-950">
              {completeProjectCount}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Cari project / material</span>
            <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <span className="inline-flex items-center px-3 text-slate-400">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Cari nama project, material belum ada, atau material yang sudah terdeteksi"
                autoComplete="off"
                className="!border-0 !shadow-none focus:!border-0 focus:!shadow-none"
              />
            </div>
          </label>

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Filter status</span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "incomplete", label: "Perlu Dicek" },
                { key: "most-detected", label: "Terdeteksi Terbanyak" },
                { key: "all", label: "Semua" },
                { key: "complete", label: "Lengkap" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  data-ui-button="true"
                  onClick={() => setStatusFilter(item.key as StatusFilter)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                    statusFilter === item.key
                      ? item.key === "complete"
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : item.key === "most-detected"
                          ? "border-blue-700 bg-blue-700 text-white"
                          : item.key === "all"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-amber-700 bg-amber-700 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <p>
            Menampilkan {filteredProjects.length} dari {projects.length} project KMP Cianjur.
          </p>
          <div className="flex flex-wrap gap-2">
            {checklistLabels.slice(0, 5).map((label) => (
              <span
                key={label}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600"
              >
                {label}
              </span>
            ))}
            {checklistLabels.length > 5 ? (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-500">
                +{checklistLabels.length - 5} lainnya
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <form action={createExpenseAction} className="space-y-3">
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="error_return_to" value={returnTo} />
        <input type="hidden" name="expense_input_mode" value="kmp_material_check" />
        <input type="hidden" name="kmp_material_rows_json" value={selectedMaterialPayload} />

        <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <label>
              <span className="mb-1 block text-xs font-semibold text-blue-900">Tanggal input</span>
              <input
                type="date"
                name="expense_date"
                value={expenseDate}
                disabled={!canEdit}
                onChange={(event) => setExpenseDate(event.currentTarget.value)}
              />
            </label>
            <div className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                {selectedMaterialRows.length} material dipilih
              </p>
              <p>Total nominal: {formatCurrency(selectedTotalAmount)}</p>
            </div>
            <KmpMaterialSubmitButton canEdit={canEdit} selectedCount={selectedMaterialRows.length} />
          </div>
          {!canEdit ? (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              Role viewer hanya bisa melihat monitoring material.
            </p>
          ) : null}
        </div>

        {filteredProjects.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            Tidak ada project yang cocok dengan filter monitoring saat ini.
          </p>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {filteredProjects.map((project, index) => {
              const checklistProgress = checklistLabels.length > 0
                ? Math.round((project.detectedCount / checklistLabels.length) * 100)
                : 0;
              const projectSelectedCount = project.missingMaterials.filter(
                (label) => getMaterialDraft(project.projectId, label).selected,
              ).length;

              return (
                <article
                  key={project.projectId}
                  className={`group relative overflow-hidden rounded-[1.45rem] border p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                    project.missingCount === 0
                      ? "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.92)_0%,rgba(255,255,255,0.98)_100%)]"
                      : "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,rgba(255,255,255,0.98)_100%)]"
                  }`}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.48)_42%,transparent_68%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>

                  <div className="relative flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-[11px] font-bold text-white">
                          {index + 1}
                        </span>
                        <p className="text-sm font-black tracking-normal text-slate-950">
                          {project.projectName}
                        </p>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        {project.clientName ?? "Tanpa klien"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          project.missingCount === 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {project.missingCount === 0 ? "Lengkap" : `${project.missingCount} belum ada`}
                      </span>
                      <Link
                        href={project.recapHref}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-100"
                      >
                        <span className="btn-icon bg-slate-100 text-slate-700">
                          <EyeIcon />
                        </span>
                        Buka Rekap
                      </Link>
                    </div>
                  </div>

                  <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/80 bg-white/75 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Terdeteksi
                      </p>
                      <p className="mt-1 text-lg font-black tracking-normal text-slate-950">
                        {project.detectedCount}/{checklistLabels.length}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/75 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Progress
                      </p>
                      <p className="mt-1 text-lg font-black tracking-normal text-slate-950">
                        {checklistProgress}%
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/75 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Dipilih
                      </p>
                      <p className="mt-1 text-lg font-black tracking-normal text-slate-950">
                        {projectSelectedCount}/{project.missingCount}
                      </p>
                    </div>
                  </div>

                  <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-white/70">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        project.missingCount === 0
                          ? "bg-[linear-gradient(90deg,#10b981_0%,#059669_100%)]"
                          : "bg-[linear-gradient(90deg,#f59e0b_0%,#f97316_100%)]"
                      }`}
                      style={{ width: `${Math.max(checklistProgress, project.detectedCount > 0 ? 12 : 4)}%` }}
                    />
                  </div>

                  {project.missingMaterials.length === 0 ? (
                    <div className="relative mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">
                      <span className="inline-flex items-center gap-2">
                        <span className="btn-icon bg-emerald-100 text-emerald-700">
                          <CheckIcon />
                        </span>
                        Semua material checklist sudah pernah terdeteksi di project ini.
                      </span>
                    </div>
                  ) : (
                    <div className="relative mt-4 grid gap-3 lg:grid-cols-[1.25fr_minmax(0,1fr)]">
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-amber-900">
                            Material yang belum terdeteksi
                          </p>
                          <button
                            type="button"
                            data-ui-button="true"
                            disabled={!canEdit}
                            onClick={() => selectProjectMissingMaterials(project)}
                            className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Checklist Semua
                          </button>
                        </div>
                        <div className="mt-3 space-y-2">
                          {project.missingMaterials.map((label) => {
                            const rule = materialRuleByLabel.get(label);
                            const draft = getMaterialDraft(project.projectId, label);
                            const amountOptions = rule ? getKmpCianjurMaterialAmountOptions(rule) : [];
                            const isDisabled = !canEdit || !rule;

                            return (
                              <div
                                key={`${project.projectId}-missing-${label}`}
                                className={`rounded-xl border bg-white p-2 ${
                                  draft.selected ? "border-blue-300 shadow-sm" : "border-amber-200"
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={draft.selected}
                                    disabled={isDisabled}
                                    onChange={(event) =>
                                      updateMaterialDraft(project.projectId, label, (current) => ({
                                        ...current,
                                        selected: event.currentTarget.checked,
                                      }))
                                    }
                                    className="mt-2 h-4 w-4"
                                    aria-label={`Pilih ${label}`}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <input
                                      type="text"
                                      value={draft.materialName}
                                      disabled={isDisabled || !draft.selected}
                                      onChange={(event) =>
                                        updateMaterialDraft(project.projectId, label, (current) => ({
                                          ...current,
                                          materialName: event.currentTarget.value,
                                          selected: true,
                                        }))
                                      }
                                      className="!h-9 !rounded-lg text-xs font-semibold"
                                      aria-label={`Nama material ${label}`}
                                    />
                                    <span className="mt-2 flex flex-wrap gap-1.5">
                                      {[
                                        { key: "none", label: "Tanpa nominal" },
                                        { key: "system", label: "Sistem" },
                                        { key: "manual", label: "Manual" },
                                      ].map((item) => {
                                        const disabled = isDisabled ||
                                          (item.key === "system" && amountOptions.length === 0);
                                        return (
                                          <button
                                            key={item.key}
                                            type="button"
                                            data-ui-button="true"
                                            disabled={disabled}
                                            onClick={() =>
                                              updateMaterialDraft(project.projectId, label, (current) => ({
                                                ...current,
                                                selected: true,
                                                amountMode: item.key as AmountMode,
                                              }))
                                            }
                                            className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${
                                              draft.amountMode === item.key
                                                ? "border-blue-700 bg-blue-700 text-white"
                                                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                                            } disabled:cursor-not-allowed disabled:opacity-50`}
                                          >
                                            {item.label}
                                          </button>
                                        );
                                      })}
                                    </span>
                                    {draft.amountMode === "system" && amountOptions.length > 0 ? (
                                      amountOptions.length === 1 ? (
                                        <span className="mt-2 block text-[11px] font-semibold text-emerald-700">
                                          Nominal sistem: {formatCurrency(amountOptions[0].amount)}
                                        </span>
                                      ) : (
                                        <select
                                          value={draft.systemAmount || String(amountOptions[0].amount)}
                                          disabled={isDisabled || !draft.selected}
                                          onChange={(event) =>
                                            updateMaterialDraft(project.projectId, label, (current) => ({
                                              ...current,
                                              selected: true,
                                              amountMode: "system",
                                              systemAmount: event.currentTarget.value,
                                            }))
                                          }
                                          className="mt-2 !h-9 text-xs"
                                          aria-label={`Nominal sistem ${label}`}
                                        >
                                          {amountOptions.map((option) => (
                                            <option key={`${option.label}-${option.amount}`} value={option.amount}>
                                              {option.label} - {formatCurrency(option.amount)}
                                            </option>
                                          ))}
                                        </select>
                                      )
                                    ) : null}
                                    {draft.amountMode === "manual" ? (
                                      <span className="mt-2 flex overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-blue-700">
                                        <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-600">
                                          Rp
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          value={draft.manualAmount ? formatThousands(draft.manualAmount) : ""}
                                          disabled={isDisabled || !draft.selected}
                                          onChange={(event) =>
                                            updateMaterialDraft(project.projectId, label, (current) => ({
                                              ...current,
                                              selected: true,
                                              amountMode: "manual",
                                              manualAmount: normalizeDigits(event.currentTarget.value),
                                            }))
                                          }
                                          placeholder="Masukkan nominal"
                                          className="!h-9 !rounded-none !border-0 text-xs !shadow-none focus:!border-0"
                                          aria-label={`Nominal manual ${label}`}
                                        />
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white/78 p-3">
                        <p className="text-xs font-semibold text-slate-700">Sudah terdeteksi</p>
                        {project.detectedMaterials.length === 0 ? (
                          <p className="mt-2 text-[11px] text-slate-500">
                            Belum ada material checklist yang cocok pada histori biaya project ini.
                          </p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {project.detectedMaterials.slice(0, 6).map((label) => (
                              <span
                                key={`${project.projectId}-detected-${label}`}
                                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700"
                              >
                                {label}
                              </span>
                            ))}
                            {project.detectedMaterials.length > 6 ? (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                +{project.detectedMaterials.length - 6} lainnya
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </form>
    </div>
  );
}

