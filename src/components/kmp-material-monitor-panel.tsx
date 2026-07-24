"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal, useFormStatus } from "react-dom";
import {
  bulkInsertKmpProjectMaterialAction,
  createExpenseAction,
  deleteKmpProjectMaterialAction,
  syncKmpMaterialProjectStatusesAction,
  upsertKmpProjectMaterialAction,
} from "@/app/actions/expense.action";
import { CheckIcon, CloseIcon, EditIcon, EyeIcon, PlusIcon, SaveIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { OptimisticExpenseCreateForm } from "@/components/optimistic-create-forms";
import {
  OptimisticMutationNotice,
  useOptimisticMutation,
} from "@/components/optimistic-mutation-notice";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  getKmpCianjurMaterialAmountOptions,
  KMP_CIANJUR_MATERIAL_CHECKLIST,
  type KmpMaterialChecklistRule,
} from "@/lib/kmp-materials";
import { OPTIMISTIC_UI_FIELD } from "@/lib/optimistic-ui";

type KmpMaterialMonitorProject = {
  projectId: string;
  projectName: string;
  projectCode: string | null;
  projectStatus: "aktif" | "selesai" | "tertunda";
  clientName: string | null;
  projectExpenseTotal: number;
  detectedMaterials: string[];
  detectedMaterialDetails: Array<{
    materialKey: string;
    materialLabel: string;
    expenses: Array<{
      id: string;
      expenseDate: string;
      requesterName: string | null;
      description: string | null;
      usageInfo: string | null;
      amount: number;
    }>;
    configId: string | null;
    materialName: string;
    submissionName: string | null;
    standardAmount: number;
    minimumAmount: number;
    detectedAmount: number;
    checklistType: AmountMode;
    checklistStatus: "auto" | "pending" | "fulfilled";
    isCustom: boolean;
    isFulfilled: boolean;
  }>;
  missingMaterialDetails: Array<{
    configId: string | null;
    materialKey: string;
    materialLabel: string;
    materialName: string;
    submissionName: string | null;
    standardAmount: number;
    minimumAmount: number;
    detectedAmount: number;
    checklistType: AmountMode;
    checklistStatus: "auto" | "pending" | "fulfilled";
    isCustom: boolean;
    isFulfilled: boolean;
    expenses: Array<{
      id: string;
      expenseDate: string;
      requesterName: string | null;
      description: string | null;
      usageInfo: string | null;
      amount: number;
    }>;
  }>;
  completedMissingMaterialDetails: Array<{
    configId: string | null;
    materialKey: string;
    materialLabel: string;
    materialName: string;
    submissionName: string | null;
    standardAmount: number;
    minimumAmount: number;
    detectedAmount: number;
    checklistType: AmountMode;
    checklistStatus: "auto" | "pending" | "fulfilled";
    isCustom: boolean;
    isFulfilled: boolean;
    expenses: Array<{
      id: string;
      expenseDate: string;
      requesterName: string | null;
      description: string | null;
      usageInfo: string | null;
      amount: number;
    }>;
  }>;
  missingMaterials: string[];
  detectedCount: number;
  missingCount: number;
  totalChecklistCount: number;
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
  onDataChanged?: () => void | Promise<void>;
};

type StatusFilter = "all" | "incomplete" | "complete" | "most-detected";
type AmountMode = "none" | "system" | "manual";
type ChecklistStatus = "auto" | "pending" | "fulfilled";
type MasterMaterialDetailMode = "missing" | "detected";

type MaterialDraft = {
  selected: boolean;
  materialName: string;
  submissionName: string;
  amountMode: AmountMode;
  systemAmount: string;
  manualAmount: string;
};

type MaterialSelectionRow = {
  projectId: string;
  projectName: string;
  materialKey: string;
  materialName: string;
  submissionName: string;
  amountMode: AmountMode;
  systemAmount: string;
  manualAmount: string;
};

type MaterialEditorState = {
  clientKey: string;
  clientName: string;
  configId: string;
  materialKey: string;
  materialName: string;
  submissionName: string;
  standardAmountRaw: string;
  nominalMinimalRaw: string;
  checklistType: AmountMode;
  checklistStatus: ChecklistStatus;
};

type MasterMaterialRow = {
  detail: KmpMaterialDetail;
  projectCount: number;
  missingCount: number;
  detectedCount: number;
};

type MasterMaterialProjectRow = {
  project: KmpMaterialMonitorProject;
  detail: KmpMaterialDetail;
};

const KMP_CIANJUR_CLIENT_KEY = "kmp cianjur";
const KMP_CIANJUR_CLIENT_NAME = "KMP Cianjur";
const PROJECT_RENDER_BATCH_SIZE = 24;
const MASTER_MATERIAL_DETAIL_PAGE_SIZE = 12;
const BULK_SUBMISSION_NAME_MAX_LENGTH = 160;

const materialRuleByLabel: ReadonlyMap<string, KmpMaterialChecklistRule> = new Map(
  KMP_CIANJUR_MATERIAL_CHECKLIST.map((item) => [item.label, item]),
);
const materialRuleByKey: ReadonlyMap<string, KmpMaterialChecklistRule> = new Map(
  KMP_CIANJUR_MATERIAL_CHECKLIST.map((item) => [item.key, item]),
);

type KmpMaterialDetail =
  | KmpMaterialMonitorProject["missingMaterialDetails"][number]
  | KmpMaterialMonitorProject["detectedMaterialDetails"][number]
  | KmpMaterialMonitorProject["completedMissingMaterialDetails"][number];

function createMaterialRuleFromDetail(detail: KmpMaterialDetail): KmpMaterialChecklistRule {
  const staticRule = materialRuleByKey.get(detail.materialKey) ?? materialRuleByLabel.get(detail.materialLabel);
  if (staticRule) {
    return staticRule;
  }

  return {
    key: detail.materialKey,
    label: detail.materialLabel,
    keywords: [detail.materialName, detail.materialLabel].filter(Boolean),
    amountTargets: detail.standardAmount > 0 ? [detail.standardAmount] : undefined,
    amountOptions: detail.standardAmount > 0
      ? [{ label: "Standard", amount: detail.standardAmount }]
      : undefined,
  };
}

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

function getProjectLocationLabel(project: KmpMaterialMonitorProject) {
  return project.projectCode?.trim() || project.projectName;
}

function getSelectableMaterialDetails(project: KmpMaterialMonitorProject) {
  const detailByKey = new Map<string, KmpMaterialDetail>();
  for (const detail of project.missingMaterialDetails) {
    detailByKey.set(detail.materialKey, detail);
  }
  for (const detail of project.completedMissingMaterialDetails) {
    detailByKey.set(detail.materialKey, detail);
  }
  return Array.from(detailByKey.values());
}

function getSelectionAmount(row: Pick<MaterialSelectionRow, "amountMode" | "systemAmount" | "manualAmount">) {
  if (row.amountMode === "manual") {
    return Number(normalizeDigits(row.manualAmount)) || 0;
  }
  if (row.amountMode === "system") {
    return Number(normalizeDigits(row.systemAmount)) || 0;
  }
  return 0;
}

function getMasterMaterialRowSearchText(row: MasterMaterialProjectRow) {
  return normalizeText(
    [
      row.project.projectName,
      row.project.projectCode ?? "",
      row.project.clientName ?? "",
      row.detail.materialLabel,
      row.detail.materialName,
      row.detail.submissionName ?? "",
    ].join(" "),
  );
}

function getBulkResultMessage(input: {
  materialName: string;
  insertedCount: number;
  skippedCount: number;
  failedCount: number;
}) {
  if (input.insertedCount > 0 && input.skippedCount === 0 && input.failedCount === 0) {
    return `Material ${input.materialName} berhasil ditambahkan ke ${input.insertedCount} project.`;
  }
  if (input.insertedCount > 0) {
    const skippedText = input.skippedCount > 0
      ? ` dan ${input.skippedCount} project dilewati karena material sudah tersedia`
      : "";
    const failedText = input.failedCount > 0 ? `, ${input.failedCount} project gagal diproses` : "";
    return `${input.insertedCount} project berhasil ditambahkan${skippedText}${failedText}.`;
  }
  if (input.skippedCount > 0 && input.failedCount === 0) {
    return `${input.skippedCount} project dilewati karena material sudah tersedia.`;
  }
  return `${input.failedCount} project gagal diproses.`;
}

function getMaterialDraftKey(projectId: string, label: string, materialKey?: string) {
  const ruleKey = materialKey || materialRuleByLabel.get(label)?.key || normalizeText(label).replace(/[^a-z0-9]+/g, "_");
  return `${projectId}:${ruleKey}`;
}

function getDefaultSystemAmount(rule: KmpMaterialChecklistRule | undefined) {
  const amount = rule ? getKmpCianjurMaterialAmountOptions(rule)[0]?.amount : 0;
  return amount && amount > 0 ? String(amount) : "";
}

function getDefaultSelectedAmountMode(rule: KmpMaterialChecklistRule | undefined): AmountMode {
  return getDefaultSystemAmount(rule) ? "system" : "none";
}

function createInitialMaterialDraft(
  label: string,
  rule: KmpMaterialChecklistRule | undefined,
  submissionName = "",
  standardAmount = 0,
): MaterialDraft {
  return {
    selected: false,
    materialName: label,
    submissionName,
    amountMode: "none",
    systemAmount: standardAmount > 0 ? String(standardAmount) : getDefaultSystemAmount(rule),
    manualAmount: "",
  };
}

function createBlankMaterialEditor(): MaterialEditorState {
  return {
    clientKey: KMP_CIANJUR_CLIENT_KEY,
    clientName: KMP_CIANJUR_CLIENT_NAME,
    configId: "",
    materialKey: "",
    materialName: "",
    submissionName: "",
    standardAmountRaw: "",
    nominalMinimalRaw: "",
    checklistType: "manual",
    checklistStatus: "auto",
  };
}

function createMaterialEditorFromDetail(
  detail: KmpMaterialMonitorProject["missingMaterialDetails"][number],
): MaterialEditorState {
  return {
    clientKey: KMP_CIANJUR_CLIENT_KEY,
    clientName: KMP_CIANJUR_CLIENT_NAME,
    configId: detail.configId ?? "",
    materialKey: detail.materialKey,
    materialName: detail.materialName || detail.materialLabel,
    submissionName: detail.submissionName ?? "",
    standardAmountRaw: detail.standardAmount > 0 ? String(Math.round(detail.standardAmount)) : "",
    nominalMinimalRaw: detail.minimumAmount > 0 ? String(Math.round(detail.minimumAmount)) : "",
    checklistType: detail.checklistType,
    checklistStatus: detail.checklistStatus,
  };
}

function normalizeMaterialEditorState(editor: Partial<MaterialEditorState> | null): MaterialEditorState | null {
  if (!editor) {
    return null;
  }

  const defaults = createBlankMaterialEditor();
  const checklistType: AmountMode =
    editor.checklistType === "none" || editor.checklistType === "system" || editor.checklistType === "manual"
      ? editor.checklistType
      : defaults.checklistType;
  const checklistStatus: ChecklistStatus =
    editor.checklistStatus === "auto" ||
    editor.checklistStatus === "pending" ||
    editor.checklistStatus === "fulfilled"
      ? editor.checklistStatus
      : defaults.checklistStatus;

  return {
    clientKey: editor.clientKey ?? defaults.clientKey,
    clientName: editor.clientName ?? defaults.clientName,
    configId: editor.configId ?? defaults.configId,
    materialKey: editor.materialKey ?? defaults.materialKey,
    materialName: editor.materialName ?? defaults.materialName,
    submissionName: editor.submissionName ?? defaults.submissionName,
    standardAmountRaw: normalizeDigits(editor.standardAmountRaw ?? defaults.standardAmountRaw),
    nominalMinimalRaw: normalizeDigits(editor.nominalMinimalRaw ?? defaults.nominalMinimalRaw),
    checklistType,
    checklistStatus,
  };
}

function KmpMaterialSubmitButton({
  canEdit,
  selectedCount,
  invalidManualCount,
}: {
  canEdit: boolean;
  selectedCount: number;
  invalidManualCount: number;
}) {
  const { pending } = useFormStatus();
  const isDisabled = !canEdit || selectedCount === 0 || invalidManualCount > 0 || pending;

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
        : invalidManualCount > 0
          ? "Lengkapi Nominal Manual"
        : selectedCount > 0
          ? `Simpan Checklist (${selectedCount})`
          : "Pilih Material"}
    </button>
  );
}

function MaterialEditorModal({
  editor,
  error,
  isSubmitting,
  returnTo,
  onClose,
  onDelete,
  onPatch,
  onSubmit,
}: {
  editor: MaterialEditorState;
  error: string;
  isSubmitting: boolean;
  returnTo: string;
  onClose: () => void;
  onDelete: () => void;
  onPatch: (patch: Partial<MaterialEditorState>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Tutup editor material"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/55"
      />
      <section
        className="panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto p-5"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
              Material Deteksi KMP
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-950">
              {editor.configId ? "Edit Material" : "Tambah Material"}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Berlaku untuk semua project klien {editor.clientName}.
            </p>
          </div>
          <button
            type="button"
            data-ui-button="true"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            <span className="btn-icon bg-slate-100 text-slate-600">
              <CloseIcon />
            </span>
            Tutup
          </button>
        </div>

        <form
          onSubmit={onSubmit}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => event.stopPropagation()}
          className="mt-4 space-y-3"
        >
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="client_key" value={editor.clientKey} />
          <input type="hidden" name="client_name" value={editor.clientName} />
          <input type="hidden" name="material_config_id" value={editor.configId} />
          <input type="hidden" name="material_key" value={editor.materialKey} />

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Nama material yang ingin dideteksi
            </label>
            <input
              name="material_name"
              value={editor.materialName}
              onChange={(event) => onPatch({ materialName: event.currentTarget.value })}
              placeholder="Contoh: Folding Gate"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Nama pengajuan
            </label>
            <input
              name="submission_name"
              value={editor.submissionName}
              onChange={(event) => onPatch({ submissionName: event.currentTarget.value })}
              placeholder="Contoh: Pengajuan Folding Gate"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Nominal harga standard produk
              </label>
              <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-700">
                <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                  Rp
                </span>
                <input
                  name="standard_amount"
                  type="text"
                  inputMode="numeric"
                  value={editor.standardAmountRaw ? formatThousands(editor.standardAmountRaw) : ""}
                  onChange={(event) => onPatch({ standardAmountRaw: normalizeDigits(event.currentTarget.value) })}
                  placeholder="Contoh: 9.300.000"
                  className="!rounded-none !border-0 !shadow-none focus:!border-0"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Nominal minimal
              </label>
              <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-700">
                <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                  Rp
                </span>
                <input
                  name="nominal_minimal"
                  type="text"
                  inputMode="numeric"
                  value={editor.nominalMinimalRaw ? formatThousands(editor.nominalMinimalRaw) : ""}
                  onChange={(event) => onPatch({ nominalMinimalRaw: normalizeDigits(event.currentTarget.value) })}
                  placeholder="Contoh: 5.000.000"
                  className="!rounded-none !border-0 !shadow-none focus:!border-0"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Tipe checklist
              </label>
              <select
                name="checklist_type"
                value={editor.checklistType}
                onChange={(event) => onPatch({ checklistType: event.currentTarget.value as AmountMode })}
              >
                <option value="none">Tanpa nominal</option>
                <option value="system">Sistem</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Status checklist
              </label>
              <select
                name="checklist_status"
                value={editor.checklistStatus}
                onChange={(event) => onPatch({ checklistStatus: event.currentTarget.value as ChecklistStatus })}
              >
                <option value="auto">Otomatis dari input biaya</option>
                <option value="pending">Manual belum terpenuhi</option>
                <option value="fulfilled">Manual terpenuhi</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {editor.configId ? (
              <button
                type="button"
                data-ui-button="true"
                onClick={onDelete}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="btn-icon bg-rose-100 text-rose-700">
                  <TrashIcon />
                </span>
                Hapus Aturan
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              data-ui-button="true"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="btn-icon bg-white/20 text-white">
                <SaveIcon />
              </span>
              {isSubmitting ? "Menyimpan..." : "Simpan Material"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
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
  onDataChanged,
}: KmpMaterialMonitorPanelProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [masterMaterialQuery, setMasterMaterialQuery] = useState("");
  const [isMasterMaterialVisible, setIsMasterMaterialVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("incomplete");
  const [visibleProjectLimit, setVisibleProjectLimit] = useState(PROJECT_RENDER_BATCH_SIZE);
  const [expenseDate, setExpenseDate] = useState(today);
  const [materialDrafts, setMaterialDrafts] = useState<Record<string, MaterialDraft>>({});
  const [selectedCompletedProjectIds, setSelectedCompletedProjectIds] = useState<string[]>([]);
  const [selectedDetectedMaterial, setSelectedDetectedMaterial] = useState<{
    projectId: string;
    materialKey: string;
  } | null>(null);
  const [masterDetailModal, setMasterDetailModal] = useState<{
    mode: MasterMaterialDetailMode;
    materialKey: string;
  } | null>(null);
  const [masterDetailSearch, setMasterDetailSearch] = useState("");
  const [masterDetailLocationFilter, setMasterDetailLocationFilter] = useState("");
  const [masterDetailPage, setMasterDetailPage] = useState(1);
  const [selectedBulkProjectIds, setSelectedBulkProjectIds] = useState<string[]>([]);
  const [isBulkFormVisible, setIsBulkFormVisible] = useState(false);
  const [bulkSubmissionName, setBulkSubmissionName] = useState("");
  const [bulkNominalRaw, setBulkNominalRaw] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkNotice, setBulkNotice] = useState<{
    type: "success" | "info";
    message: string;
  } | null>(null);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [showAllSelectedBulkProjects, setShowAllSelectedBulkProjects] = useState(false);
  const [materialEditor, setMaterialEditor] = useState<MaterialEditorState | null>(null);
  const [materialEditorError, setMaterialEditorError] = useState("");
  const [isMaterialEditorSubmitting, setIsMaterialEditorSubmitting] = useState(false);
  const { notice, runOptimisticMutation } = useOptimisticMutation();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 1000);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let isCancelled = false;
    syncKmpMaterialProjectStatusesAction()
      .then((result) => {
        if (!isCancelled && result.updatedCount > 0) {
          router.refresh();
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [router]);

  const getMaterialDraft = (
    projectId: string,
    detail: KmpMaterialDetail,
    submissionName = "",
    standardAmount = 0,
  ) => {
    const rule = createMaterialRuleFromDetail(detail);
    const key = getMaterialDraftKey(projectId, detail.materialLabel, detail.materialKey);
    return materialDrafts[key] ?? createInitialMaterialDraft(detail.materialLabel, rule, submissionName, standardAmount);
  };

  const openMaterialEditor = (nextEditor: MaterialEditorState) => {
    setMaterialEditorError("");
    setMaterialEditor(normalizeMaterialEditorState(nextEditor));
  };

  const closeMaterialEditor = () => {
    setMaterialEditorError("");
    setMaterialEditor(null);
  };

  const updateMaterialEditor = (patch: Partial<MaterialEditorState>) => {
    setMaterialEditor((current) => {
      if (!current) {
        return current;
      }
      return normalizeMaterialEditorState({ ...createBlankMaterialEditor(), ...current, ...patch });
    });
    if (materialEditorError) {
      setMaterialEditorError("");
    }
  };

  const updateMaterialDraft = (
    projectId: string,
    detail: KmpMaterialDetail,
    updater: (draft: MaterialDraft) => MaterialDraft,
  ) => {
    setMaterialDrafts((previous) => {
      const rule = createMaterialRuleFromDetail(detail);
      const key = getMaterialDraftKey(projectId, detail.materialLabel, detail.materialKey);
      const current = previous[key] ?? createInitialMaterialDraft(
        detail.materialLabel,
        rule,
        detail.submissionName ?? "",
        detail.standardAmount,
      );
      return {
        ...previous,
        [key]: updater(current),
      };
    });
  };

  const setProjectMaterialDraftSelection = (
    project: KmpMaterialMonitorProject,
    details: KmpMaterialDetail[],
    selected: boolean,
  ) => {
    setMaterialDrafts((previous) => {
      const next = { ...previous };
      for (const detail of details) {
        const rule = createMaterialRuleFromDetail(detail);
        const key = getMaterialDraftKey(project.projectId, detail.materialLabel, detail.materialKey);
        const current = next[key] ?? createInitialMaterialDraft(
          detail.materialLabel,
          rule,
          detail.submissionName ?? "",
          detail.standardAmount,
        );
        next[key] = {
          ...current,
          selected,
          materialName: detail.materialName || current.materialName,
          submissionName: current.submissionName || detail.submissionName || "",
          amountMode: selected && current.amountMode === "none" ? getDefaultSelectedAmountMode(rule) : current.amountMode,
        };
      }
      return next;
    });
  };

  const applyMaterialDraftToAllProjects = (
    detail: KmpMaterialDetail,
    sourceDraft: MaterialDraft,
  ) => {
    setMaterialDrafts((previous) => {
      const rule = createMaterialRuleFromDetail(detail);

      const next = { ...previous };
      for (const project of projects) {
        const matchingDetail = project.missingMaterialDetails.find((item) => item.materialKey === detail.materialKey);
        if (!matchingDetail) {
          continue;
        }

        const key = getMaterialDraftKey(project.projectId, matchingDetail.materialLabel, matchingDetail.materialKey);
        const current = next[key] ?? createInitialMaterialDraft(
          matchingDetail.materialLabel,
          rule,
          matchingDetail.submissionName ?? "",
          matchingDetail.standardAmount,
        );
        next[key] = {
          ...current,
          selected: true,
          materialName: sourceDraft.materialName,
          submissionName: sourceDraft.submissionName,
          amountMode: sourceDraft.amountMode,
          systemAmount: sourceDraft.systemAmount,
          manualAmount: sourceDraft.manualAmount,
        };
      }
      return next;
    });
  };

  const selectProjectMissingMaterials = (project: KmpMaterialMonitorProject) => {
    setProjectMaterialDraftSelection(project, project.missingMaterialDetails, true);
  };

  const completedBackfillProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.projectStatus === "selesai" && project.completedMissingMaterialDetails.length > 0,
      ),
    [projects],
  );

  const selectedCompletedProjectIdSet = useMemo(
    () => new Set(selectedCompletedProjectIds),
    [selectedCompletedProjectIds],
  );

  const selectedCompletedBackfillProjects = useMemo(
    () =>
      completedBackfillProjects.filter((project) =>
        selectedCompletedProjectIdSet.has(project.projectId),
      ),
    [completedBackfillProjects, selectedCompletedProjectIdSet],
  );

  useEffect(() => {
    const validProjectIds = new Set(completedBackfillProjects.map((project) => project.projectId));
    setSelectedCompletedProjectIds((current) => {
      const next = current.filter((projectId) => validProjectIds.has(projectId));
      return next.length === current.length ? current : next;
    });
  }, [completedBackfillProjects]);

  const toggleCompletedBackfillProject = (project: KmpMaterialMonitorProject, checked: boolean) => {
    setSelectedCompletedProjectIds((current) => {
      if (checked) {
        return current.includes(project.projectId) ? current : [...current, project.projectId];
      }
      return current.filter((projectId) => projectId !== project.projectId);
    });
    setProjectMaterialDraftSelection(project, project.completedMissingMaterialDetails, checked);
  };

  const selectAllCompletedBackfillProjects = () => {
    setSelectedCompletedProjectIds(completedBackfillProjects.map((project) => project.projectId));
    setMaterialDrafts((previous) => {
      const next = { ...previous };
      for (const project of completedBackfillProjects) {
        for (const detail of project.completedMissingMaterialDetails) {
          const rule = createMaterialRuleFromDetail(detail);
          const key = getMaterialDraftKey(project.projectId, detail.materialLabel, detail.materialKey);
          const current = next[key] ?? createInitialMaterialDraft(
            detail.materialLabel,
            rule,
            detail.submissionName ?? "",
            detail.standardAmount,
          );
          next[key] = {
            ...current,
            selected: true,
            materialName: detail.materialName || current.materialName,
            submissionName: current.submissionName || detail.submissionName || "",
            amountMode: current.amountMode === "none" ? getDefaultSelectedAmountMode(rule) : current.amountMode,
          };
        }
      }
      return next;
    });
  };

  const clearCompletedBackfillProjects = () => {
    setSelectedCompletedProjectIds([]);
    setMaterialDrafts((previous) => {
      const next = { ...previous };
      for (const project of completedBackfillProjects) {
        for (const detail of project.completedMissingMaterialDetails) {
          const key = getMaterialDraftKey(project.projectId, detail.materialLabel, detail.materialKey);
          if (next[key]) {
            next[key] = {
              ...next[key],
              selected: false,
            };
          }
        }
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

  const masterMaterialRows = useMemo<MasterMaterialRow[]>(() => {
    const rowByKey = new Map<string, MasterMaterialRow>();

    const addDetail = (detail: KmpMaterialDetail, state: "missing" | "detected") => {
      const current = rowByKey.get(detail.materialKey);
      if (!current) {
        rowByKey.set(detail.materialKey, {
          detail,
          projectCount: 1,
          missingCount: state === "missing" ? 1 : 0,
          detectedCount: state === "detected" ? 1 : 0,
        });
        return;
      }

      current.projectCount += 1;
      if (state === "missing") {
        current.missingCount += 1;
      } else {
        current.detectedCount += 1;
      }
      if (!current.detail.configId && detail.configId) {
        current.detail = detail;
      }
    };

    for (const project of projects) {
      for (const detail of project.missingMaterialDetails) {
        addDetail(detail, "missing");
      }
      for (const detail of project.detectedMaterialDetails) {
        addDetail(detail, "detected");
      }
    }

    const normalizedQuery = normalizeText(masterMaterialQuery);
    return Array.from(rowByKey.values())
      .filter(({ detail }) => {
        if (!normalizedQuery) {
          return true;
        }
        return normalizeText(
          [
            detail.materialLabel,
            detail.materialName,
            detail.submissionName ?? "",
            detail.materialKey,
          ].join(" "),
        ).includes(normalizedQuery);
      })
      .sort((a, b) => a.detail.materialLabel.localeCompare(b.detail.materialLabel, "id-ID"));
  }, [masterMaterialQuery, projects]);

  const activeMasterMaterialRow = useMemo(() => {
    if (!masterDetailModal) {
      return null;
    }
    return masterMaterialRows.find((row) => row.detail.materialKey === masterDetailModal.materialKey) ?? null;
  }, [masterDetailModal, masterMaterialRows]);

  const activeMasterMaterialProjectRows = useMemo<MasterMaterialProjectRow[]>(() => {
    if (!masterDetailModal) {
      return [];
    }

    return projects
      .map((project) => {
        const detail = masterDetailModal.mode === "missing"
          ? project.missingMaterialDetails.find((item) => item.materialKey === masterDetailModal.materialKey)
          : project.detectedMaterialDetails.find((item) => item.materialKey === masterDetailModal.materialKey);
        return detail ? { project, detail } : null;
      })
      .filter((row): row is MasterMaterialProjectRow => Boolean(row))
      .sort((a, b) => a.project.projectName.localeCompare(b.project.projectName, "id-ID"));
  }, [masterDetailModal, projects]);

  const masterDetailLocationOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activeMasterMaterialProjectRows
            .map((row) => getProjectLocationLabel(row.project))
            .filter((label) => label.trim().length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, "id-ID")),
    [activeMasterMaterialProjectRows],
  );

  const filteredMasterDetailRows = useMemo(() => {
    const normalizedSearch = normalizeText(masterDetailSearch);
    return activeMasterMaterialProjectRows.filter((row) => {
      const matchesSearch = !normalizedSearch || getMasterMaterialRowSearchText(row).includes(normalizedSearch);
      const matchesLocation =
        !masterDetailLocationFilter || getProjectLocationLabel(row.project) === masterDetailLocationFilter;
      return matchesSearch && matchesLocation;
    });
  }, [activeMasterMaterialProjectRows, masterDetailLocationFilter, masterDetailSearch]);

  const masterDetailPageCount = Math.max(1, Math.ceil(filteredMasterDetailRows.length / MASTER_MATERIAL_DETAIL_PAGE_SIZE));
  const safeMasterDetailPage = Math.min(masterDetailPage, masterDetailPageCount);
  const pagedMasterDetailRows = useMemo(
    () =>
      filteredMasterDetailRows.slice(
        (safeMasterDetailPage - 1) * MASTER_MATERIAL_DETAIL_PAGE_SIZE,
        safeMasterDetailPage * MASTER_MATERIAL_DETAIL_PAGE_SIZE,
      ),
    [filteredMasterDetailRows, safeMasterDetailPage],
  );

  const selectedBulkProjectIdSet = useMemo(
    () => new Set(selectedBulkProjectIds),
    [selectedBulkProjectIds],
  );
  const selectedBulkRows = useMemo(
    () =>
      activeMasterMaterialProjectRows.filter((row) => selectedBulkProjectIdSet.has(row.project.projectId)),
    [activeMasterMaterialProjectRows, selectedBulkProjectIdSet],
  );

  useEffect(() => {
    setMasterDetailPage(1);
  }, [masterDetailLocationFilter, masterDetailModal?.materialKey, masterDetailModal?.mode, masterDetailSearch]);

  useEffect(() => {
    if (masterDetailModal?.mode !== "missing") {
      setSelectedBulkProjectIds((current) => (current.length === 0 ? current : []));
      return;
    }

    const validProjectIds = new Set(activeMasterMaterialProjectRows.map((row) => row.project.projectId));
    setSelectedBulkProjectIds((current) => {
      const next = current.filter((projectId) => validProjectIds.has(projectId));
      return next.length === current.length ? current : next;
    });
  }, [activeMasterMaterialProjectRows, masterDetailModal?.mode]);

  const selectedMaterialRows = useMemo<MaterialSelectionRow[]>(() => {
    const rows: MaterialSelectionRow[] = [];

    for (const project of projects) {
      for (const detail of getSelectableMaterialDetails(project)) {
        const rule = createMaterialRuleFromDetail(detail);

        const draft = materialDrafts[getMaterialDraftKey(project.projectId, detail.materialLabel, detail.materialKey)] ??
          createInitialMaterialDraft(detail.materialLabel, rule, detail.submissionName ?? "", detail.standardAmount);
        if (!draft.selected) {
          continue;
        }

        rows.push({
          projectId: project.projectId,
          projectName: project.projectName,
          materialKey: rule.key,
          materialName: draft.materialName.trim() || rule.label,
          submissionName: draft.submissionName.trim(),
          amountMode: draft.amountMode,
          systemAmount: draft.systemAmount,
          manualAmount: draft.manualAmount,
        });
      }
    }

    return rows;
  }, [materialDrafts, projects]);
  const visibleProjects = useMemo(
    () => filteredProjects.slice(0, visibleProjectLimit),
    [filteredProjects, visibleProjectLimit],
  );

  const selectedMaterialPayload = useMemo(
    () => JSON.stringify(selectedMaterialRows),
    [selectedMaterialRows],
  );
  const selectedTotalAmount = useMemo(() => {
    return selectedMaterialRows.reduce((total, row) => {
      return total + getSelectionAmount(row);
    }, 0);
  }, [selectedMaterialRows]);
  const selectedAmountByProjectId = useMemo(() => {
    const amountByProjectId = new Map<string, number>();
    for (const row of selectedMaterialRows) {
      amountByProjectId.set(
        row.projectId,
        (amountByProjectId.get(row.projectId) ?? 0) + getSelectionAmount(row),
      );
    }
    return amountByProjectId;
  }, [selectedMaterialRows]);
  const selectedCompletedBackfillMaterialRows = useMemo(
    () => selectedMaterialRows.filter((row) => selectedCompletedProjectIdSet.has(row.projectId)),
    [selectedCompletedProjectIdSet, selectedMaterialRows],
  );
  const completedBackfillBeforeTotal = useMemo(
    () =>
      selectedCompletedBackfillProjects.reduce(
        (total, project) => total + project.projectExpenseTotal,
        0,
      ),
    [selectedCompletedBackfillProjects],
  );
  const completedBackfillMaterialTotal = useMemo(
    () =>
      selectedCompletedBackfillProjects.reduce(
        (total, project) => total + (selectedAmountByProjectId.get(project.projectId) ?? 0),
        0,
      ),
    [selectedAmountByProjectId, selectedCompletedBackfillProjects],
  );
  const completedBackfillAfterTotal = completedBackfillBeforeTotal + completedBackfillMaterialTotal;
  const invalidManualSelectionCount = useMemo(
    () =>
      selectedMaterialRows.filter(
        (row) => row.amountMode === "manual" && normalizeDigits(row.manualAmount).length === 0,
      ).length,
    [selectedMaterialRows],
  );
  const activeDetectedMaterial = useMemo(() => {
    if (!selectedDetectedMaterial) {
      return null;
    }
    const project = projects.find((item) => item.projectId === selectedDetectedMaterial.projectId);
    const detail = project?.detectedMaterialDetails.find(
      (item) => item.materialKey === selectedDetectedMaterial.materialKey,
    );
    return project && detail ? { project, detail } : null;
  }, [projects, selectedDetectedMaterial]);
  const activeMaterialEditor = normalizeMaterialEditorState(materialEditor);

  const renderCompletedBackfillSection = () => {
    if (completedBackfillProjects.length === 0) {
      return null;
    }

    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Input Material Desa 100%
            </p>
            <h4 className="mt-1 text-base font-black text-slate-950">
              Desa selesai dengan material belum tercatat
            </h4>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-ui-button="true"
              disabled={!canEdit || completedBackfillProjects.length === 0}
              onClick={selectAllCompletedBackfillProjects}
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Pilih Semua Desa
            </button>
            <button
              type="button"
              data-ui-button="true"
              disabled={!canEdit || selectedCompletedProjectIds.length === 0}
              onClick={clearCompletedBackfillProjects}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Kosongkan
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Desa 100%
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">{completedBackfillProjects.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Desa Dipilih
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">{selectedCompletedBackfillProjects.length}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
              Material Simulasi
            </p>
            <p className="mt-1 text-lg font-black text-blue-950">
              {formatCurrency(completedBackfillMaterialTotal)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Sebelum Input
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">
              {formatCurrency(completedBackfillBeforeTotal)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
              Sesudah Input
            </p>
            <p className="mt-1 text-lg font-black text-emerald-950">
              {formatCurrency(completedBackfillAfterTotal)}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {completedBackfillProjects.map((project) => {
            const isProjectSelected = selectedCompletedProjectIdSet.has(project.projectId);
            const projectSimulationAmount = selectedAmountByProjectId.get(project.projectId) ?? 0;
            const selectedMaterialCount = project.completedMissingMaterialDetails.filter(
              (detail) => getMaterialDraft(project.projectId, detail).selected,
            ).length;

            return (
              <article
                key={`completed-backfill-${project.projectId}`}
                className={`rounded-xl border bg-white p-3 ${
                  isProjectSelected ? "border-emerald-300 shadow-sm" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <label className="flex min-w-0 flex-1 items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isProjectSelected}
                      disabled={!canEdit}
                      onChange={(event) =>
                        toggleCompletedBackfillProject(project, event.currentTarget.checked)
                      }
                      className="mt-1 h-4 w-4"
                      aria-label={`Pilih desa selesai ${project.projectName}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-slate-950">
                        {project.projectName}
                      </span>
                      <span className="mt-1 block text-[11px] font-semibold text-emerald-700">
                        {project.completedMissingMaterialDetails.length} material belum tercatat
                      </span>
                    </span>
                  </label>
                  <Link
                    href={project.recapHref}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Buka Rekap
                  </Link>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Sebelum
                    </p>
                    <p className="mt-1 text-xs font-black text-slate-900">
                      {formatCurrency(project.projectExpenseTotal)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                      Material
                    </p>
                    <p className="mt-1 text-xs font-black text-blue-950">
                      {formatCurrency(projectSimulationAmount)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      Sesudah
                    </p>
                    <p className="mt-1 text-xs font-black text-emerald-950">
                      {formatCurrency(project.projectExpenseTotal + projectSimulationAmount)}
                    </p>
                  </div>
                </div>

                {isProjectSelected ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-600">
                      {selectedMaterialCount}/{project.completedMissingMaterialDetails.length} material dipilih
                    </p>
                    {project.completedMissingMaterialDetails.map((detail) => {
                      const rule = createMaterialRuleFromDetail(detail);
                      const draft = getMaterialDraft(project.projectId, detail, detail.submissionName ?? "", detail.standardAmount);
                      const amountOptions = detail.standardAmount > 0
                        ? [{ label: "Standard", amount: detail.standardAmount }]
                        : getKmpCianjurMaterialAmountOptions(rule);

                      return (
                        <div
                          key={`completed-backfill-material-${project.projectId}-${detail.materialKey}`}
                          className={`rounded-lg border p-2 ${
                            draft.selected ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={draft.selected}
                              disabled={!canEdit}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                updateMaterialDraft(project.projectId, detail, (current) => ({
                                  ...current,
                                  selected: checked,
                                  amountMode:
                                    checked && current.amountMode === "none"
                                      ? getDefaultSelectedAmountMode(rule)
                                      : current.amountMode,
                                }));
                              }}
                              className="mt-2 h-4 w-4"
                              aria-label={`Pilih material ${detail.materialLabel}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-black text-slate-900">
                                {detail.materialLabel}
                              </span>
                              <input
                                type="text"
                                value={draft.materialName}
                                disabled={!canEdit || !draft.selected}
                                onChange={(event) =>
                                  updateMaterialDraft(project.projectId, detail, (current) => ({
                                    ...current,
                                    materialName: event.currentTarget.value,
                                    selected: true,
                                  }))
                                }
                                className="mt-2 !h-9 !rounded-lg text-xs font-semibold"
                                aria-label={`Nama material ${detail.materialLabel}`}
                              />
                              <input
                                type="text"
                                value={draft.submissionName}
                                disabled={!canEdit || !draft.selected}
                                onChange={(event) =>
                                  updateMaterialDraft(project.projectId, detail, (current) => ({
                                    ...current,
                                    submissionName: event.currentTarget.value,
                                    selected: true,
                                  }))
                                }
                                placeholder="Nama pengajuan untuk rincian"
                                className="mt-2 !h-9 !rounded-lg text-xs font-semibold"
                                aria-label={`Nama pengajuan ${detail.materialLabel}`}
                              />
                              <span className="mt-2 flex flex-wrap gap-1.5">
                                {[
                                  { key: "none", label: "Tanpa nominal" },
                                  { key: "system", label: "Sistem" },
                                  { key: "manual", label: "Manual" },
                                ].map((item) => {
                                  const disabled = !canEdit ||
                                    !draft.selected ||
                                    (item.key === "system" && amountOptions.length === 0);
                                  return (
                                    <button
                                      key={item.key}
                                      type="button"
                                      data-ui-button="true"
                                      disabled={disabled}
                                      onClick={() =>
                                        updateMaterialDraft(project.projectId, detail, (current) => ({
                                          ...current,
                                          selected: true,
                                          amountMode: item.key as AmountMode,
                                        }))
                                      }
                                      className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${
                                        draft.amountMode === item.key
                                          ? "border-blue-700 bg-blue-700 text-white"
                                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
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
                                    disabled={!canEdit || !draft.selected}
                                    onChange={(event) =>
                                      updateMaterialDraft(project.projectId, detail, (current) => ({
                                        ...current,
                                        selected: true,
                                        amountMode: "system",
                                        systemAmount: event.currentTarget.value,
                                      }))
                                    }
                                    className="mt-2 !h-9 text-xs"
                                    aria-label={`Nominal sistem ${detail.materialLabel}`}
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
                                    disabled={!canEdit || !draft.selected}
                                    onChange={(event) =>
                                      updateMaterialDraft(project.projectId, detail, (current) => ({
                                        ...current,
                                        selected: true,
                                        amountMode: "manual",
                                        manualAmount: normalizeDigits(event.currentTarget.value),
                                      }))
                                    }
                                    placeholder="Masukkan nominal"
                                    className="!h-9 !rounded-none !border-0 text-xs !shadow-none focus:!border-0"
                                    aria-label={`Nominal manual ${detail.materialLabel}`}
                                  />
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-white px-3 py-2">
          <p className="text-xs font-semibold text-blue-700">
            {selectedCompletedBackfillMaterialRows.length} material dari desa selesai masuk simulasi input.
          </p>
          <KmpMaterialSubmitButton
            canEdit={canEdit}
            selectedCount={selectedMaterialRows.length}
            invalidManualCount={invalidManualSelectionCount}
          />
        </div>
      </section>
    );
  };

  const submitMaterialEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isMaterialEditorSubmitting) {
      return;
    }
    const currentEditor = normalizeMaterialEditorState(materialEditor);
    if (!currentEditor) {
      return;
    }
    if (!currentEditor.materialName.trim()) {
      setMaterialEditorError("Nama material wajib diisi.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("client_key", currentEditor.clientKey);
    formData.set("client_name", currentEditor.clientName);
    formData.set("material_config_id", currentEditor.configId);
    formData.set("material_key", currentEditor.materialKey);
    formData.set("material_name", currentEditor.materialName.trim());
    formData.set("submission_name", currentEditor.submissionName.trim());
    formData.set("standard_amount", currentEditor.standardAmountRaw);
    formData.set("nominal_minimal", currentEditor.nominalMinimalRaw);
    formData.set("checklist_type", currentEditor.checklistType);
    formData.set("checklist_status", currentEditor.checklistStatus);
    formData.set(OPTIMISTIC_UI_FIELD, "1");
    setMaterialEditorError("");
    setIsMaterialEditorSubmitting(true);
    void upsertKmpProjectMaterialAction(formData)
      .then((result) => {
        if (!result?.ok) {
          setMaterialEditorError(result?.message || "Material gagal disimpan. Periksa input lalu coba lagi.");
          return;
        }
        setMaterialEditor(null);
        setMaterialEditorError("");
        onDataChanged?.();
        router.refresh();
      })
      .catch(() => {
        setMaterialEditorError("Koneksi ke server gagal. Data input tetap dipertahankan.");
      })
      .finally(() => {
        setIsMaterialEditorSubmitting(false);
      });
  };

  const deleteMaterialEditor = () => {
    const currentEditor = normalizeMaterialEditorState(materialEditor);
    if (!currentEditor?.configId) {
      return;
    }
    const snapshot = currentEditor;
    const formData = new FormData();
    formData.set("material_config_id", currentEditor.configId);
    formData.set("client_key", currentEditor.clientKey);
    formData.set("return_to", returnTo);
    void runOptimisticMutation({
      action: deleteKmpProjectMaterialAction,
      formData,
      pendingMessage: "Menghapus material deteksi KMP...",
      optimisticUpdate: () => setMaterialEditor(null),
      rollback: () => setMaterialEditor(snapshot),
      onSuccess: () => onDataChanged?.(),
    });
  };

  const resetBulkMaterialState = () => {
    setSelectedBulkProjectIds([]);
    setIsBulkFormVisible(false);
    setBulkSubmissionName("");
    setBulkNominalRaw("");
    setBulkError("");
    setBulkNotice(null);
    setIsBulkConfirmOpen(false);
    setShowAllSelectedBulkProjects(false);
  };

  const openMasterMaterialDetail = (mode: MasterMaterialDetailMode, materialKey: string) => {
    setMasterDetailModal({ mode, materialKey });
    setMasterDetailSearch("");
    setMasterDetailLocationFilter("");
    setMasterDetailPage(1);
    resetBulkMaterialState();
  };

  const closeMasterMaterialDetail = () => {
    setMasterDetailModal(null);
    resetBulkMaterialState();
  };

  const toggleBulkProjectSelection = (projectId: string, checked: boolean) => {
    setSelectedBulkProjectIds((current) => {
      if (checked) {
        return current.includes(projectId) ? current : [...current, projectId];
      }
      return current.filter((item) => item !== projectId);
    });
    setBulkError("");
    setBulkNotice(null);
  };

  const selectAllFilteredBulkProjects = () => {
    setSelectedBulkProjectIds(Array.from(new Set(filteredMasterDetailRows.map((row) => row.project.projectId))));
    setBulkError("");
    setBulkNotice(null);
  };

  const clearBulkProjectSelection = () => {
    setSelectedBulkProjectIds([]);
    setIsBulkFormVisible(false);
    setBulkError("");
    setBulkNotice(null);
    setShowAllSelectedBulkProjects(false);
  };

  const validateBulkMaterialForm = () => {
    if (!canEdit) {
      return "Role viewer hanya bisa melihat daftar material.";
    }
    if (selectedBulkProjectIds.length === 0) {
      return "Pilih minimal satu project terlebih dahulu.";
    }
    if (!bulkSubmissionName.trim()) {
      return "Nama pengajuan wajib diisi.";
    }
    if (bulkSubmissionName.trim().length > BULK_SUBMISSION_NAME_MAX_LENGTH) {
      return `Nama pengajuan maksimal ${BULK_SUBMISSION_NAME_MAX_LENGTH} karakter.`;
    }
    const nominal = Number(normalizeDigits(bulkNominalRaw));
    if (!Number.isSafeInteger(nominal) || nominal <= 0) {
      return "Nominal wajib diisi dan harus lebih besar dari 0.";
    }
    return "";
  };

  const requestBulkMaterialSubmit = () => {
    const errorMessage = validateBulkMaterialForm();
    if (errorMessage) {
      setBulkError(errorMessage);
      return;
    }
    setBulkError("");
    setIsBulkConfirmOpen(true);
  };

  const confirmBulkMaterialSubmit = async () => {
    if (isBulkSubmitting || !activeMasterMaterialRow || masterDetailModal?.mode !== "missing") {
      return;
    }

    const errorMessage = validateBulkMaterialForm();
    if (errorMessage) {
      setBulkError(errorMessage);
      setIsBulkConfirmOpen(false);
      return;
    }

    const nominal = Number(normalizeDigits(bulkNominalRaw));
    setIsBulkSubmitting(true);
    setBulkError("");
    setBulkNotice(null);
    try {
      const result = await bulkInsertKmpProjectMaterialAction({
        material_key: activeMasterMaterialRow.detail.materialKey,
        material_name: activeMasterMaterialRow.detail.materialName || activeMasterMaterialRow.detail.materialLabel,
        project_ids: selectedBulkProjectIds,
        nama_pengajuan: bulkSubmissionName.trim(),
        nominal,
        expense_date: today,
      });
      const nextMessage = getBulkResultMessage({
        materialName: activeMasterMaterialRow.detail.materialLabel,
        insertedCount: result.inserted_count,
        skippedCount: result.skipped_count,
        failedCount: result.failed_count,
      });
      if (result.inserted_count > 0 || result.skipped_count > 0) {
        setBulkNotice({
          type: result.failed_count > 0 || result.skipped_count > 0 ? "info" : "success",
          message: nextMessage,
        });
      }
      if (result.failed_count > 0 && result.inserted_count === 0) {
        const preview = result.failed_projects
          .slice(0, 3)
          .map((project) => `${project.project_name ?? project.project_id}: ${project.reason}`)
          .join("; ");
        setBulkError(preview || result.message || "Material gagal ditambahkan.");
      }
      if (result.inserted_count > 0) {
        setSelectedBulkProjectIds([]);
        setIsBulkFormVisible(false);
        setBulkSubmissionName("");
        setBulkNominalRaw("");
        setShowAllSelectedBulkProjects(false);
        setIsBulkRefreshing(true);
        await onDataChanged?.();
        router.refresh();
      }
    } catch {
      setBulkError("Koneksi terputus saat menyimpan material. Coba lagi.");
    } finally {
      setIsBulkConfirmOpen(false);
      setIsBulkSubmitting(false);
      setIsBulkRefreshing(false);
    }
  };

  const renderDetectedMaterials = (project: KmpMaterialMonitorProject) => (
    <div className="rounded-2xl border border-slate-200 bg-white/78 p-3">
      <p className="text-xs font-semibold text-slate-700">Sudah terdeteksi</p>
      {project.detectedMaterialDetails.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">
          Belum ada material checklist yang cocok pada histori biaya project ini.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-slate-500">
            Tekan nama material untuk membuka rincian rekapnya.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {project.detectedMaterialDetails.map((detail) => (
              <span
                key={`${project.projectId}-detected-${detail.materialKey}`}
                className="inline-flex items-center overflow-hidden rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700"
              >
                <button
                  type="button"
                  data-ui-button="true"
                  onClick={() =>
                    setSelectedDetectedMaterial({
                      projectId: project.projectId,
                      materialKey: detail.materialKey,
                    })
                  }
                  className="px-3 py-1 transition hover:bg-emerald-100"
                >
                  {detail.materialLabel}
                  {detail.minimumAmount > 0 ? ` (${formatCurrency(detail.detectedAmount)})` : ""}
                </button>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderMasterMaterialDetailModal = () => {
    if (typeof document === "undefined" || !masterDetailModal || !activeMasterMaterialRow) {
      return null;
    }

    const isMissingMode = masterDetailModal.mode === "missing";
    const detail = activeMasterMaterialRow.detail;
    const pageStart = filteredMasterDetailRows.length === 0
      ? 0
      : (safeMasterDetailPage - 1) * MASTER_MATERIAL_DETAIL_PAGE_SIZE + 1;
    const pageEnd = Math.min(
      safeMasterDetailPage * MASTER_MATERIAL_DETAIL_PAGE_SIZE,
      filteredMasterDetailRows.length,
    );
    const selectedCount = selectedBulkRows.length;
    const selectedPreviewRows = showAllSelectedBulkProjects
      ? selectedBulkRows
      : selectedBulkRows.slice(0, 5);
    const nominalValue = Number(normalizeDigits(bulkNominalRaw));
    const modalTitle = isMissingMode
      ? `Project Belum Memiliki Material - ${detail.materialLabel}`
      : `Project Sudah Memiliki Material - ${detail.materialLabel}`;

    return createPortal(
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4">
        <button
          type="button"
          aria-label="Tutup detail master material"
          disabled={isBulkSubmitting}
          onClick={closeMasterMaterialDetail}
          className="absolute inset-0 bg-slate-950/55"
        />
        <section
          className="panel relative z-10 max-h-[calc(100vh-1.5rem)] w-full max-w-6xl overflow-y-auto p-4 sm:p-5"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${
                isMissingMode ? "text-amber-700" : "text-emerald-700"
              }`}>
                {isMissingMode ? "Detail Project Belum" : "Detail Project Sudah"}
              </p>
              <h3 className="mt-1 text-lg font-black text-slate-950">
                {modalTitle}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {detail.submissionName
                  ? `Nama pengajuan/PIC: ${detail.submissionName}`
                  : "Nama pengajuan/PIC belum tersedia."}
              </p>
            </div>
            <button
              type="button"
              data-ui-button="true"
              onClick={closeMasterMaterialDetail}
              disabled={isBulkSubmitting}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="btn-icon bg-slate-100 text-slate-600">
                <CloseIcon />
              </span>
              Tutup
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Nominal Standard
              </p>
              <p className="mt-1 text-sm font-black text-slate-950">
                {detail.standardAmount > 0 ? formatCurrency(detail.standardAmount) : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Nominal Minimal
              </p>
              <p className="mt-1 text-sm font-black text-slate-950">
                {detail.minimumAmount > 0 ? formatCurrency(detail.minimumAmount) : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Total Project
              </p>
              <p className="mt-1 text-sm font-black text-slate-950">
                {activeMasterMaterialRow.projectCount}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                Belum
              </p>
              <p className="mt-1 text-sm font-black text-amber-950">
                {activeMasterMaterialRow.missingCount}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                Sudah
              </p>
              <p className="mt-1 text-sm font-black text-emerald-950">
                {activeMasterMaterialRow.detectedCount}
              </p>
            </div>
          </div>

          {bulkNotice ? (
            <div
              className={`mt-4 rounded-xl border px-3 py-2 text-xs font-semibold ${
                bulkNotice.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {bulkNotice.message}
            </div>
          ) : null}
          {isBulkRefreshing ? (
            <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
              Memperbarui daftar project dari database...
            </p>
          ) : null}
          {bulkError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              <p>{bulkError}</p>
              {isBulkFormVisible && canEdit ? (
                <button
                  type="button"
                  data-ui-button="true"
                  onClick={requestBulkMaterialSubmit}
                  disabled={isBulkSubmitting}
                  className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Coba Lagi
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Cari project atau lokasi</span>
              <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <span className="inline-flex items-center px-3 text-slate-400">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <input
                  value={masterDetailSearch}
                  onChange={(event) => setMasterDetailSearch(event.currentTarget.value)}
                  placeholder="Cari nama project, desa/lokasi, atau nama pengajuan"
                  autoComplete="off"
                  className="!border-0 !shadow-none focus:!border-0 focus:!shadow-none"
                />
              </div>
            </label>
            {masterDetailLocationOptions.length > 1 ? (
              <label className="block min-w-[14rem]">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Filter lokasi</span>
                <select
                  value={masterDetailLocationFilter}
                  onChange={(event) => setMasterDetailLocationFilter(event.currentTarget.value)}
                >
                  <option value="">Semua lokasi</option>
                  {masterDetailLocationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {isMissingMode ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-ui-button="true"
                  disabled={!canEdit || filteredMasterDetailRows.length === 0 || isBulkSubmitting}
                  onClick={selectAllFilteredBulkProjects}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  data-ui-button="true"
                  disabled={!canEdit || selectedCount === 0 || isBulkSubmitting}
                  onClick={clearBulkProjectSelection}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Batalkan Pilihan
                </button>
              </div>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                {selectedCount} project dipilih
              </p>
            </div>
          ) : null}
          {!canEdit && isMissingMode ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Role viewer hanya bisa melihat daftar project. Bulk insert dinonaktifkan.
            </p>
          ) : null}

          <div className="mt-3 table-card">
            <div className="data-table-shell">
              <table className="data-table data-table--compact min-w-[760px]">
                <thead>
                  {isMissingMode ? (
                    <tr>
                      <th className="w-12">Pilih</th>
                      <th className="w-16">No</th>
                      <th>Nama Project</th>
                      <th>Desa/Lokasi</th>
                      <th>Status Material</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="w-16">No</th>
                      <th>Nama Project</th>
                      <th>Desa/Lokasi</th>
                      <th>Nama Pengajuan</th>
                      <th>Nominal</th>
                      <th>Tanggal Input</th>
                      <th>Status</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {pagedMasterDetailRows.length === 0 ? (
                    <tr>
                      <td colSpan={isMissingMode ? 6 : 8}>
                        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">
                          {isMissingMode && activeMasterMaterialRow.missingCount === 0
                            ? `Semua project sudah memiliki material ${detail.materialLabel}.`
                            : "Tidak ada project yang cocok dengan pencarian atau filter saat ini."}
                        </p>
                      </td>
                    </tr>
                  ) : isMissingMode ? (
                    pagedMasterDetailRows.map((row, index) => (
                      <tr key={`missing-detail-${row.project.projectId}-${row.detail.materialKey}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBulkProjectIdSet.has(row.project.projectId)}
                            disabled={!canEdit || isBulkSubmitting}
                            onChange={(event) =>
                              toggleBulkProjectSelection(row.project.projectId, event.currentTarget.checked)
                            }
                            aria-label={`Pilih project ${row.project.projectName}`}
                          />
                        </td>
                        <td>{pageStart + index}</td>
                        <td>
                          <p className="font-semibold text-slate-900">{row.project.projectName}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{row.project.clientName ?? "Tanpa klien"}</p>
                        </td>
                        <td>{getProjectLocationLabel(row.project)}</td>
                        <td>
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                            Belum Ada
                          </span>
                        </td>
                        <td className="text-right">
                          <Link
                            href={row.project.recapHref}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Buka Rekap
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    pagedMasterDetailRows.map((row, index) => {
                      const primaryExpense = row.detail.expenses[0];
                      return (
                        <tr key={`detected-detail-${row.project.projectId}-${row.detail.materialKey}`}>
                          <td>{pageStart + index}</td>
                          <td>
                            <p className="font-semibold text-slate-900">{row.project.projectName}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {row.project.clientName ?? "Tanpa klien"}
                            </p>
                          </td>
                          <td>{getProjectLocationLabel(row.project)}</td>
                          <td>{primaryExpense?.requesterName ?? row.detail.submissionName ?? "-"}</td>
                          <td>{formatCurrency(row.detail.detectedAmount)}</td>
                          <td>{primaryExpense ? formatDate(primaryExpense.expenseDate) : "-"}</td>
                          <td>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                              Sudah Ada
                            </span>
                          </td>
                          <td className="text-right">
                            <Link
                              href={row.project.recapHref}
                              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Buka Rekap
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <p>
              Menampilkan {pageStart}-{pageEnd} dari {filteredMasterDetailRows.length} project.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-ui-button="true"
                disabled={safeMasterDetailPage <= 1}
                onClick={() => setMasterDetailPage((page) => Math.max(1, page - 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-600">
                Halaman {safeMasterDetailPage}/{masterDetailPageCount}
              </span>
              <button
                type="button"
                data-ui-button="true"
                disabled={safeMasterDetailPage >= masterDetailPageCount}
                onClick={() => setMasterDetailPage((page) => Math.min(masterDetailPageCount, page + 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>

          {isMissingMode && canEdit ? (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/75 p-3">
              {!isBulkFormVisible ? (
                <button
                  type="button"
                  data-ui-button="true"
                  disabled={selectedCount === 0 || isBulkSubmitting}
                  onClick={() => {
                    setIsBulkFormVisible(true);
                    setBulkError("");
                    setBulkNotice(null);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="btn-icon bg-white/20 text-white">
                    <PlusIcon />
                  </span>
                  Tambahkan Material ke Project Terpilih
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-xs font-semibold text-blue-900">Nama Pengajuan</span>
                      <input
                        value={bulkSubmissionName}
                        onChange={(event) => {
                          setBulkSubmissionName(event.currentTarget.value);
                          setBulkError("");
                        }}
                        maxLength={BULK_SUBMISSION_NAME_MAX_LENGTH}
                        placeholder="Contoh: Pengadaan Aluminium Tahap 1"
                        disabled={isBulkSubmitting}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-semibold text-blue-900">Nominal</span>
                      <span className="flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-700">
                        <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                          Rp
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={bulkNominalRaw ? formatThousands(bulkNominalRaw) : ""}
                          onChange={(event) => {
                            setBulkNominalRaw(normalizeDigits(event.currentTarget.value));
                            setBulkError("");
                          }}
                          placeholder="25.000.000"
                          disabled={isBulkSubmitting}
                          className="!rounded-none !border-0 !shadow-none focus:!border-0"
                        />
                      </span>
                    </label>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-900">
                      {selectedCount} project akan menerima material {detail.materialLabel}.
                    </p>
                    {selectedPreviewRows.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedPreviewRows.map((row) => (
                          <span
                            key={`bulk-preview-${row.project.projectId}`}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                          >
                            {row.project.projectName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {selectedBulkRows.length > 5 ? (
                      <button
                        type="button"
                        data-ui-button="true"
                        onClick={() => setShowAllSelectedBulkProjects((value) => !value)}
                        className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        {showAllSelectedBulkProjects ? "Sembunyikan sebagian" : "Lihat seluruh project terpilih"}
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      data-ui-button="true"
                      disabled={isBulkSubmitting}
                      onClick={() => setIsBulkFormVisible(false)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      data-ui-button="true"
                      disabled={selectedCount === 0 || isBulkSubmitting}
                      onClick={requestBulkMaterialSubmit}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="btn-icon bg-white/20 text-white">
                        <SaveIcon />
                      </span>
                      Tambahkan Material ke Project Terpilih
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {isBulkConfirmOpen ? (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <button
                type="button"
                aria-label="Batal konfirmasi tambah material"
                disabled={isBulkSubmitting}
                onClick={() => setIsBulkConfirmOpen(false)}
                className="absolute inset-0 bg-slate-950/60"
              />
              <section className="panel relative z-10 w-full max-w-lg p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
                  Konfirmasi Bulk Material
                </p>
                <h4 className="mt-1 text-lg font-black text-slate-950">
                  Ya, tambahkan material?
                </h4>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <p>
                    Material <strong>{detail.materialLabel}</strong> akan ditambahkan ke{" "}
                    <strong>{selectedCount} project</strong> dengan rincian:
                  </p>
                  <dl className="mt-3 space-y-2">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Nama Pengajuan
                      </dt>
                      <dd className="font-semibold text-slate-900">{bulkSubmissionName.trim()}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Nominal per Project
                      </dt>
                      <dd className="font-semibold text-slate-900">
                        {nominalValue > 0 ? formatCurrency(nominalValue) : "-"}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3">Apakah Anda yakin ingin melanjutkan?</p>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    data-ui-button="true"
                    disabled={isBulkSubmitting}
                    onClick={() => setIsBulkConfirmOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    data-ui-button="true"
                    disabled={isBulkSubmitting}
                    onClick={confirmBulkMaterialSubmit}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="btn-icon bg-white/20 text-white">
                      <SaveIcon />
                    </span>
                    {isBulkSubmitting ? "Menambahkan..." : "Ya, Tambahkan Material"}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>,
      document.body,
    );
  };

  return (
    <div className="mt-4 space-y-4">
      <OptimisticMutationNotice notice={notice} />
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
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
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

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
              Master Material Global
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Edit nama pengajuan, nominal deteksi, dan aturan material satu kali untuk seluruh project KMP Cianjur.
            </p>
          </div>
          <button
            type="button"
            data-ui-button="true"
            onClick={() => setIsMasterMaterialVisible((value) => !value)}
            className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            {isMasterMaterialVisible ? "Sembunyikan Edit Material" : "Tampilkan Edit Material"}
          </button>
        </div>
        {isMasterMaterialVisible ? (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {canEdit ? (
                <button
                  type="button"
                  data-ui-button="true"
                  onClick={() => openMaterialEditor(createBlankMaterialEditor())}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  <span className="btn-icon bg-blue-100 text-blue-700">
                    <PlusIcon />
                  </span>
                  Tambah Material
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={masterMaterialQuery}
                onChange={(event) => setMasterMaterialQuery(event.currentTarget.value)}
                placeholder="Cari master material atau nama pengajuan"
                autoComplete="off"
              />
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                {masterMaterialRows.length} material unik
              </p>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {masterMaterialRows.slice(0, 60).map(({ detail, projectCount, missingCount, detectedCount }) => (
                <article
                  key={`master-material-${detail.materialKey}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900" title={detail.materialLabel}>
                        {detail.materialLabel}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-slate-500" title={detail.submissionName ?? ""}>
                        {detail.submissionName || "Nama pengajuan belum diisi"}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        Standard: {detail.standardAmount > 0 ? formatCurrency(detail.standardAmount) : "-"} | Minimal:{" "}
                        {detail.minimumAmount > 0 ? formatCurrency(detail.minimumAmount) : "-"}
                      </p>
                    </div>
                    {canEdit ? (
                  <button
                    type="button"
                    data-ui-button="true"
                    onClick={() => openMaterialEditor(createMaterialEditorFromDetail(detail))}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                    aria-label={`Edit master material ${detail.materialLabel}`}
                  >
                    <EditIcon className="h-3 w-3" />
                    Edit
                  </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-slate-600">
                    <span className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                      {projectCount} project
                    </span>
                    <button
                      type="button"
                      data-ui-button="true"
                      onClick={() => openMasterMaterialDetail("missing", detail.materialKey)}
                      title="Lihat project yang belum memiliki material"
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700 hover:bg-amber-100"
                      aria-label={`Lihat ${missingCount} project yang belum memiliki ${detail.materialLabel}`}
                    >
                      {missingCount} belum
                    </button>
                    <button
                      type="button"
                      data-ui-button="true"
                      onClick={() => openMasterMaterialDetail("detected", detail.materialKey)}
                      title="Lihat project yang sudah memiliki material"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700 hover:bg-emerald-100"
                      aria-label={`Lihat ${detectedCount} project yang sudah memiliki ${detail.materialLabel}`}
                    >
                      {detectedCount} sudah
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {masterMaterialRows.length > 60 ? (
              <p className="mt-3 text-[11px] text-slate-500">
                Gunakan pencarian untuk menampilkan material lain.
              </p>
            ) : null}
          </>
        ) : null}
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
            Menampilkan {visibleProjects.length} dari {filteredProjects.length} project cocok.
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

      <OptimisticExpenseCreateForm action={createExpenseAction} className="space-y-3">
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
            <KmpMaterialSubmitButton
              canEdit={canEdit}
              selectedCount={selectedMaterialRows.length}
              invalidManualCount={invalidManualSelectionCount}
            />
          </div>
          {!canEdit ? (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              Role viewer hanya bisa melihat monitoring material.
            </p>
          ) : null}
          {invalidManualSelectionCount > 0 ? (
            <p className="mt-2 text-xs font-semibold text-rose-700">
              Isi nominal manual pada {invalidManualSelectionCount} material sebelum menyimpan.
            </p>
          ) : null}
        </div>

        {renderCompletedBackfillSection()}

        {filteredProjects.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            Tidak ada project yang cocok dengan filter monitoring saat ini.
          </p>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {visibleProjects.map((project, index) => {
              const checklistTotal = Math.max(project.totalChecklistCount, 0);
              const checklistProgress = checklistTotal > 0
                ? Math.round((project.detectedCount / checklistTotal) * 100)
                : 0;
              const projectSelectedCount = project.missingMaterialDetails.filter(
                (detail) => getMaterialDraft(project.projectId, detail).selected,
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
                        {project.detectedCount}/{checklistTotal}
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

                  {project.missingMaterialDetails.length === 0 ? (
                    <div className="relative mt-4 space-y-3">
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">
                        <span className="inline-flex items-center gap-2">
                          <span className="btn-icon bg-emerald-100 text-emerald-700">
                            <CheckIcon />
                          </span>
                          Semua material checklist sudah pernah terdeteksi di project ini.
                        </span>
                      </div>
                      {renderDetectedMaterials(project)}
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
                          {project.missingMaterialDetails.map((detail) => {
                            const label = detail.materialLabel;
                            const rule = createMaterialRuleFromDetail(detail);
                            const draft = getMaterialDraft(project.projectId, detail, detail.submissionName ?? "", detail.standardAmount);
                            const amountOptions = detail.standardAmount > 0
                              ? [{ label: "Standard", amount: detail.standardAmount }]
                              : getKmpCianjurMaterialAmountOptions(rule);
                            const isDisabled = !canEdit;

                            return (
                              <div
                                key={`${project.projectId}-missing-${detail.materialKey}`}
                                className={`rounded-xl border bg-white p-2 ${
                                  draft.selected ? "border-blue-300 shadow-sm" : "border-amber-200"
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={draft.selected}
                                    disabled={isDisabled}
                                    onChange={(event) => {
                                      const checked = event.currentTarget.checked;
                                      updateMaterialDraft(project.projectId, detail, (current) => ({
                                        ...current,
                                        selected: checked,
                                        amountMode:
                                          checked && current.amountMode === "none"
                                            ? getDefaultSelectedAmountMode(rule)
                                            : current.amountMode,
                                      }));
                                    }}
                                    className="mt-2 h-4 w-4"
                                    aria-label={`Pilih ${label}`}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-start justify-between gap-2">
                                      <span className="min-w-0">
                                        <span className="block text-xs font-black text-slate-900">
                                          {detail.materialLabel}
                                        </span>
                                        <span className="mt-1 block text-[11px] text-slate-500">
                                          {detail.submissionName || "Nama pengajuan belum diisi"}
                                        </span>
                                      </span>
                                    </span>
                                    <span className="mt-2 block rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-800">
                                      {detail.minimumAmount > 0
                                        ? `${formatCurrency(detail.detectedAmount)} dari minimal ${formatCurrency(detail.minimumAmount)}`
                                        : detail.detectedAmount > 0
                                          ? `Sudah ada nominal cocok ${formatCurrency(detail.detectedAmount)}, status masih belum terpenuhi.`
                                          : "Belum ada biaya yang cocok dengan material ini."}
                                    </span>
                                    <input
                                      type="text"
                                      value={draft.materialName}
                                      disabled={isDisabled || !draft.selected}
                                      onChange={(event) =>
                                        updateMaterialDraft(project.projectId, detail, (current) => ({
                                          ...current,
                                          materialName: event.currentTarget.value,
                                          selected: true,
                                        }))
                                      }
                                      className="mt-2 !h-9 !rounded-lg text-xs font-semibold"
                                      aria-label={`Nama material ${label}`}
                                    />
                                    <input
                                      type="text"
                                      value={draft.submissionName}
                                      disabled={isDisabled || !draft.selected}
                                      onChange={(event) =>
                                        updateMaterialDraft(project.projectId, detail, (current) => ({
                                          ...current,
                                          submissionName: event.currentTarget.value,
                                          selected: true,
                                        }))
                                      }
                                      placeholder="Nama pengajuan untuk rincian"
                                      className="mt-2 !h-9 !rounded-lg text-xs font-semibold"
                                      aria-label={`Nama pengajuan ${label}`}
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
                                              updateMaterialDraft(project.projectId, detail, (current) => ({
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
                                    {detail.minimumAmount > 0 ? (
                                      <span className="mt-2 block text-[11px] font-semibold text-amber-700">
                                        Minimal terdeteksi: {formatCurrency(detail.minimumAmount)}
                                      </span>
                                    ) : null}
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
                                            updateMaterialDraft(project.projectId, detail, (current) => ({
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
                                            updateMaterialDraft(project.projectId, detail, (current) => ({
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
                                    <button
                                      type="button"
                                      data-ui-button="true"
                                      disabled={isDisabled || !draft.selected}
                                      onClick={() => applyMaterialDraftToAllProjects(detail, draft)}
                                      className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Terapkan ke semua {label}
                                    </button>
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {renderDetectedMaterials(project)}
                    </div>
                  )}
                </article>
              );
            })}
            {visibleProjects.length < filteredProjects.length ? (
              <div className="xl:col-span-2">
                <button
                  type="button"
                  data-ui-button="true"
                  onClick={() => setVisibleProjectLimit((value) => value + PROJECT_RENDER_BATCH_SIZE)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Tampilkan {Math.min(PROJECT_RENDER_BATCH_SIZE, filteredProjects.length - visibleProjects.length)} project lagi
                </button>
              </div>
            ) : null}
          </div>
        )}
      </OptimisticExpenseCreateForm>

      {renderMasterMaterialDetailModal()}

      {activeMaterialEditor ? (
        <MaterialEditorModal
          editor={activeMaterialEditor}
          error={materialEditorError}
          isSubmitting={isMaterialEditorSubmitting}
          returnTo={returnTo}
          onClose={closeMaterialEditor}
          onDelete={deleteMaterialEditor}
          onPatch={updateMaterialEditor}
          onSubmit={submitMaterialEditor}
        />
      ) : null}

      {typeof document !== "undefined" && activeDetectedMaterial
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Tutup rincian material"
            onClick={() => setSelectedDetectedMaterial(null)}
            className="absolute inset-0 bg-slate-950/55"
          />
          <section className="panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Rincian Rekap Material
                </p>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  {activeDetectedMaterial.detail.materialLabel}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {activeDetectedMaterial.project.projectName}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-ui-button="true"
                  onClick={() => setSelectedDetectedMaterial(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  <span className="btn-icon bg-slate-100 text-slate-600">
                    <CloseIcon />
                  </span>
                  Tutup
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Nominal Terdeteksi
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatCurrency(activeDetectedMaterial.detail.detectedAmount)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Minimal
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {activeDetectedMaterial.detail.minimumAmount > 0
                      ? formatCurrency(activeDetectedMaterial.detail.minimumAmount)
                      : "Tanpa minimal"}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-black text-emerald-950">
                    Terpenuhi
                  </p>
                </div>
              </div>
              {activeDetectedMaterial.detail.expenses.map((expense, index) => (
                <article
                  key={expense.id || `${activeDetectedMaterial.detail.materialKey}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-500">
                      {formatDate(expense.expenseDate)}
                    </p>
                    <p className="text-sm font-black text-emerald-700">
                      {formatCurrency(expense.amount)}
                    </p>
                  </div>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Nama Pengaju
                      </dt>
                      <dd className="mt-1 text-xs font-semibold text-slate-800">
                        {expense.requesterName ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Keterangan
                      </dt>
                      <dd className="mt-1 text-xs font-semibold text-slate-800">
                        {expense.description ?? "-"}
                      </dd>
                    </div>
                  </dl>
                  {expense.usageInfo ? (
                    <p className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
                      {expense.usageInfo}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}

