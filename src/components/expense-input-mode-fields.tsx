"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  clearExpenseInputDraftAction,
  getExpenseInputDraftAction,
  saveExpenseInputDraftAction,
} from "@/app/actions/expense-draft.action";
import {
  createScraperExpenseQuickAction,
  getKmpMaterialDuplicateDetectionAction,
} from "@/app/actions/expense.action";
import { EnterToNextField } from "@/components/enter-to-next-field";
import { useOptimisticCreateStore } from "@/components/optimistic-create-store";
import { ProjectAutocomplete, PROJECT_AUTOCOMPLETE_SELECT_EVENT } from "@/components/project-autocomplete";
import { ProjectChecklistSearch } from "@/components/project-checklist-search";
import { ProjectScopedAutocompleteInput } from "@/components/project-scoped-autocomplete-input";
import { RequesterProjectAutocompleteInput } from "@/components/requester-project-autocomplete-input";
import { RupiahInput } from "@/components/rupiah-input";
import { ClipboardIcon, ExcelIcon, SaveIcon } from "@/components/icons";
import { SuccessToast } from "@/components/success-toast";
import { formatCurrency } from "@/lib/format";
import { parseHokClipboardText, parseHokImportRows, type HokImportResult } from "@/lib/hok-import";
import { SPECIALIST_COST_PRESETS } from "@/lib/constants";
import type { ExpenseEntry } from "@/lib/types";

type ProjectOption = {
  id: string;
  name: string;
  code?: string | null;
  clientName?: string | null;
};

type ExpenseCategoryOption = {
  value: string;
  label: string;
};

type RequesterProjectSuggestion = {
  requesterName: string;
  projectId: string;
  projectName: string;
  projectCode?: string | null;
  clientName?: string | null;
};

type HokProjectPreset = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  requesterName: string;
  requesterSource: "project_hok" | "project_upah" | "client_hok" | "client_upah" | "fallback";
  defaultSelected: boolean;
};

type HokProjectRow = HokProjectPreset & {
  defaultRequesterName: string;
  amountRaw: string;
  selected: boolean;
  isRequesterEditable?: boolean;
};

type HokImportFeedback = {
  tone: "success" | "warning" | "error";
  title: string;
  details: string[];
  issues?: {
    unmatchedRows: HokImportResult["unmatchedRows"];
    invalidRows: HokImportResult["invalidRows"];
    duplicateRows: HokImportResult["duplicateRows"];
  };
};

type ScraperRow = {
  id: string;
  projectId: string;
  amountRaw: string;
};

type ContinueEntry = {
  id: string;
  projectId: string;
  projectName: string;
  category: string;
  expenseDate: string;
  requesterName: string;
  description: string;
  amountRaw: string;
};

type StandardDraftState = {
  projectId: string;
  additionalProjectIds: string[];
  category: string;
  categoryCustom: string;
  expenseDate: string;
  requesterName: string;
  description: string;
  amountRaw: string;
  recipientName: string;
  usageInfo: string;
  specialistType: string;
  specialistTypeCustom: string;
  quantity: string;
  unitLabel: string;
  unitPriceRaw: string;
};

type ScraperDraftState = {
  category: string;
  expenseDate: string;
  requesterName: string;
  description: string;
  rows: ScraperRow[];
};

type ContinueDraftState = {
  entries: ContinueEntry[];
  projectId: string;
  category: string;
  expenseDate: string;
  requesterName: string;
  description: string;
  amountRaw: string;
};

type HokDraftState = {
  expenseDate: string;
  pasteText: string;
  rows: Array<{
    projectId: string;
    requesterName: string;
    amountRaw: string;
    selected: boolean;
  }>;
};

type ExpenseDraftPayload = {
  version: 2;
  mode: ExpenseInputMode;
  savedAt: string;
  standard: StandardDraftState;
  scraper: ScraperDraftState;
  continueMode: ContinueDraftState;
  hok: HokDraftState;
};

type ExpenseInputModeFieldsProps = {
  projects: ProjectOption[];
  initialProjectId?: string;
  today: string;
  defaultExpenseCategory: string;
  expenseCategories: ExpenseCategoryOption[];
  requesterHistorySuggestions: RequesterProjectSuggestion[];
  projectClientNameById: Record<string, string | null>;
  descriptionSuggestionsForProjects: Record<string, string[]>;
  hokProjectPresets: HokProjectPreset[];
  formId?: string;
};

type KmpMaterialDuplicateInfo = Awaited<ReturnType<typeof getKmpMaterialDuplicateDetectionAction>>;

const STANDARD_MODE = "standard";
const HOK_MODE = "hok_kmp_cianjur";
const SCRAPER_MODE = "scraper";
const CONTINUE_MODE = "continue";
const EXPENSE_PROJECT_REFOCUS_KEY = "expense-modal-refocus-project";
const EXPENSE_DRAFT_PENDING_CLEAR_KEY = "expense-modal-draft-pending-clear";
const EXPENSE_CONTINUE_DRAFT_STORAGE_KEY = "admin-web:expense-continue-draft:v1";
const EXPENSE_CONTINUE_DRAFT_PENDING_CLEAR_KEY = "expense-modal-continue-draft-pending-clear";
const EXPENSE_INPUT_DRAFT_DEBOUNCE_MS = 1000;
const SCRAPER_SAVE_TIMEOUT_MS = 15_000;
const HOK_EXCEL_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
type ExpenseInputMode = typeof STANDARD_MODE | typeof HOK_MODE | typeof SCRAPER_MODE | typeof CONTINUE_MODE;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
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

function createInitialHokRows(rows: HokProjectPreset[]): HokProjectRow[] {
  return rows.map((row) => ({
    ...row,
    defaultRequesterName: row.requesterName,
    amountRaw: "",
    selected: row.defaultSelected,
    isRequesterEditable: false,
  }));
}

function createScraperRow(projectId = ""): ScraperRow {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `scraper-row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    projectId,
    amountRaw: "",
  };
}

function createInitialScraperRows(initialProjectId?: string) {
  return [createScraperRow(initialProjectId ?? "")];
}

function getRequesterSourceLabel(value: HokProjectPreset["requesterSource"]) {
  if (value === "project_hok") {
    return "Histori HOK";
  }
  if (value === "project_upah") {
    return "Histori Upah";
  }
  if (value === "client_hok") {
    return "Fallback Klien HOK";
  }
  if (value === "client_upah") {
    return "Fallback Klien Upah";
  }
  return "Fallback";
}

function createExpenseSubmissionToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createContinueEntryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ce-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function getRecordStringList(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function resolveDraftMode(value: string): ExpenseInputMode {
  return value === HOK_MODE || value === SCRAPER_MODE || value === CONTINUE_MODE ? value : STANDARD_MODE;
}

function resolveDraftDate(value: string, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function resolveDraftCategory(value: string, categoryValues: Set<string>, fallback: string) {
  return categoryValues.has(value) ? value : fallback;
}

function hasStandardDraftContent(
  input: StandardDraftState,
  defaultCategory: string,
  today: string,
  defaultProjectId = "",
) {
  const projectId = input.projectId.trim();
  return (
    (projectId.length > 0 && projectId !== defaultProjectId) ||
    input.additionalProjectIds.length > 0 ||
    input.category !== defaultCategory ||
    input.categoryCustom.trim().length > 0 ||
    input.expenseDate !== today ||
    input.requesterName.trim().length > 0 ||
    input.description.trim().length > 0 ||
    normalizeDigits(input.amountRaw).length > 0 ||
    input.recipientName.trim().length > 0 ||
    input.usageInfo.trim().length > 0 ||
    input.specialistType.trim().length > 0 ||
    input.specialistTypeCustom.trim().length > 0 ||
    input.quantity.trim().length > 0 ||
    input.unitLabel.trim().length > 0 ||
    normalizeDigits(input.unitPriceRaw).length > 0
  );
}

function hasScraperDraftContent(
  input: ScraperDraftState,
  defaultCategory: string,
  today: string,
  defaultProjectId = "",
) {
  return (
    input.category !== defaultCategory ||
    input.expenseDate !== today ||
    input.requesterName.trim().length > 0 ||
    input.description.trim().length > 0 ||
    input.rows.some((row) => {
      const projectId = row.projectId.trim();
      return (
        (projectId.length > 0 && projectId !== defaultProjectId) ||
        normalizeDigits(row.amountRaw).length > 0
      );
    })
  );
}

function hasHokDraftContent(input: HokDraftState, today: string) {
  return (
    input.expenseDate !== today ||
    input.pasteText.trim().length > 0 ||
    input.rows.some((row) => row.amountRaw.trim().length > 0 || row.requesterName.trim().length > 0)
  );
}

function hasExpenseInputDraftContent(
  input: ExpenseDraftPayload,
  defaultCategory: string,
  today: string,
  defaultProjectId = "",
) {
  return (
    hasStandardDraftContent(input.standard, defaultCategory, today, defaultProjectId) ||
    hasScraperDraftContent(input.scraper, defaultCategory, today, defaultProjectId) ||
    hasHokDraftContent(input.hok, today) ||
    hasContinueDraftContent(input.continueMode)
  );
}

function hasContinueDraftContent(input: {
  entries: ContinueEntry[];
  projectId: string;
  requesterName: string;
  description: string;
  amountRaw: string;
}) {
  return (
    input.entries.length > 0 ||
    input.projectId.trim().length > 0 ||
    input.requesterName.trim().length > 0 ||
    input.description.trim().length > 0 ||
    normalizeDigits(input.amountRaw).length > 0
  );
}

function formatContinueDraftSavedAt(value: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatHokImportIssuePreview(
  rows: Array<{ rowNumber: number; sourceProjectName: string }>,
  emptyLabel: string,
) {
  return rows
    .slice(0, 3)
    .map((row) => `baris ${row.rowNumber} (${row.sourceProjectName || emptyLabel})`)
    .join(", ");
}

function buildHokImportFeedback(result: HokImportResult, sourceLabel: string): HokImportFeedback {
  if (result.parsedRowCount === 0) {
    return {
      tone: "error",
      title: `Tidak ada data HOK yang terbaca dari ${sourceLabel}.`,
      details: ["Pastikan sheet atau hasil paste berisi tabel project dan nominal."],
    };
  }

  const details: string[] = [];
  if (result.matchedRows.length > 0) {
    details.push(`${result.matchedRows.length} project cocok dan dipilih otomatis.`);
  }
  if (result.unmatchedRows.length > 0) {
    details.push(
      `${result.unmatchedRows.length} project tidak dikenali, misalnya ${formatHokImportIssuePreview(
        result.unmatchedRows,
        "tanpa nama project",
      )}.`,
    );
  }
  if (result.invalidRows.length > 0) {
    details.push(
      `${result.invalidRows.length} baris diabaikan karena project atau nominal belum lengkap.`,
    );
  }
  if (result.duplicateRows.length > 0) {
    details.push(
      `${result.duplicateRows.length} duplikasi project ditemukan. Nominal pada baris terakhir yang dipakai.`,
    );
  }

  if (result.matchedRows.length === 0) {
    return {
      tone: "error",
      title: `Tidak ada project HOK yang cocok dari ${sourceLabel}.`,
      details:
        details.length > 0
          ? details
          : ["Periksa nama project pada file atau hasil paste agar sesuai dengan daftar project HOK."],
    };
  }

  return {
    tone:
      result.unmatchedRows.length > 0 || result.invalidRows.length > 0 || result.duplicateRows.length > 0
        ? "warning"
        : "success",
    title: `Import HOK dari ${sourceLabel} selesai.`,
    details,
    issues: {
      unmatchedRows: result.unmatchedRows,
      invalidRows: result.invalidRows,
      duplicateRows: result.duplicateRows,
    },
  };
}

function ExpenseSubmitButton({
  disabled,
  mode,
  selectedHokRowCount,
  selectedScraperRowCount,
  continueEntryCount,
  isScraperSaving,
  onScraperSave,
}: {
  disabled: boolean;
  mode: ExpenseInputMode;
  selectedHokRowCount: number;
  selectedScraperRowCount: number;
  continueEntryCount: number;
  isScraperSaving: boolean;
  onScraperSave: () => void;
}) {
  const { pending } = useFormStatus();
  const isScraperMode = mode === SCRAPER_MODE;
  const isPending = isScraperMode ? isScraperSaving : pending;
  const isDisabled = disabled || isPending;

  return (
    <button
      type={isScraperMode ? "button" : "submit"}
      onClick={isScraperMode ? onScraperSave : undefined}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={isPending}
    >
      <span className="btn-icon icon-float-soft bg-white/20 text-white">
        <SaveIcon />
      </span>
      {isPending
        ? "Menyimpan..."
        : mode === HOK_MODE
          ? `Simpan HOK ${selectedHokRowCount > 0 ? `(${selectedHokRowCount} project)` : ""}`
          : mode === SCRAPER_MODE
            ? `Simpan Scraper ${selectedScraperRowCount > 0 ? `(${selectedScraperRowCount} data)` : ""}`
            : mode === CONTINUE_MODE
              ? `Simpan Semua${continueEntryCount > 0 ? ` (${continueEntryCount} entry)` : ""}`
              : "Simpan Biaya"}
    </button>
  );
}

export function ExpenseInputModeFields({
  projects,
  initialProjectId,
  today,
  defaultExpenseCategory,
  expenseCategories,
  requesterHistorySuggestions,
  projectClientNameById,
  descriptionSuggestionsForProjects,
  hokProjectPresets,
  formId = "expense-modal-form",
}: ExpenseInputModeFieldsProps) {
  const router = useRouter();
  const { addPendingExpenses, removePendingExpenseIds } = useOptimisticCreateStore();
  const searchParams = useSearchParams();
  const expenseSavedModeParam = searchParams.get("expense_saved_mode")?.trim() ?? "";
  const expenseSavedMode = expenseSavedModeParam ? resolveDraftMode(expenseSavedModeParam) : null;
  const expenseActionToken = searchParams.get("expense_action_token")?.trim() ?? "";
  const rootRef = useRef<HTMLDivElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const hokExcelInputRef = useRef<HTMLInputElement>(null);
  const scraperRequesterInputRef = useRef<HTMLInputElement>(null);
  const scraperDescriptionInputRef = useRef<HTMLInputElement>(null);
  const scraperProjectInputRefs = useRef(new Map<string, HTMLInputElement | null>());
  const scraperAmountInputRefs = useRef(new Map<string, HTMLInputElement | null>());
  const pendingScraperFocusRef = useRef<{ rowId: string; field: "project" | "amount" } | null>(null);
  const lastProcessedContinueDraftClearRef = useRef("");
  const continueDraftClearInProgressRef = useRef(false);
  const hasLoadedExpenseDraftRef = useRef(false);
  const draftServerUpdatedAtRef = useRef<string | null>(null);
  const serverDraftIsClearedRef = useRef(false);
  const hasUserEditedDraftRef = useRef(false);
  const [submissionToken, setSubmissionToken] = useState(createExpenseSubmissionToken);
  const [mode, setMode] = useState<ExpenseInputMode>(() => expenseSavedMode ?? STANDARD_MODE);
  const [hokQuery, setHokQuery] = useState("");
  const [hokRows, setHokRows] = useState<HokProjectRow[]>(() => createInitialHokRows(hokProjectPresets));
  const [hokError, setHokError] = useState("");
  const [hokPasteText, setHokPasteText] = useState("");
  const [hokImportFeedback, setHokImportFeedback] = useState<HokImportFeedback | null>(null);
  const [isHokFileImporting, setIsHokFileImporting] = useState(false);
  const [isReadingHokClipboard, setIsReadingHokClipboard] = useState(false);
  const [scraperRows, setScraperRows] = useState<ScraperRow[]>(() =>
    createInitialScraperRows(initialProjectId),
  );
  const [scraperError, setScraperError] = useState("");
  const [scraperSuccessMessage, setScraperSuccessMessage] = useState("");
  const [isScraperSaving, setIsScraperSaving] = useState(false);
  const [standardProjectId, setStandardProjectId] = useState(initialProjectId ?? "");
  const [standardAdditionalProjectIds, setStandardAdditionalProjectIds] = useState<string[]>([]);
  const [standardCategory, setStandardCategory] = useState(defaultExpenseCategory);
  const [standardCategoryCustom, setStandardCategoryCustom] = useState("");
  const [standardDate, setStandardDate] = useState(today);
  const [standardRequester, setStandardRequester] = useState("");
  const [standardDescription, setStandardDescription] = useState("");
  const [standardAmountRaw, setStandardAmountRaw] = useState("");
  const [standardRecipientName, setStandardRecipientName] = useState("");
  const [standardUsageInfo, setStandardUsageInfo] = useState("");
  const [standardSpecialistType, setStandardSpecialistType] = useState("");
  const [standardSpecialistTypeCustom, setStandardSpecialistTypeCustom] = useState("");
  const [standardQuantity, setStandardQuantity] = useState("");
  const [standardUnitLabel, setStandardUnitLabel] = useState("");
  const [standardUnitPriceRaw, setStandardUnitPriceRaw] = useState("");
  const [kmpDuplicateInfo, setKmpDuplicateInfo] = useState<KmpMaterialDuplicateInfo>(null);
  const [isCheckingKmpDuplicate, setIsCheckingKmpDuplicate] = useState(false);
  const [kmpDuplicateError, setKmpDuplicateError] = useState("");
  const [scraperCategory, setScraperCategory] = useState(defaultExpenseCategory);
  const [scraperDate, setScraperDate] = useState(today);
  const [scraperRequester, setScraperRequester] = useState("");
  const [scraperDescription, setScraperDescription] = useState("");
  const [hokDate, setHokDate] = useState(today);

  // Continue Mode state
  const [continueEntries, setContinueEntries] = useState<ContinueEntry[]>([]);
  const [continueProjectId, setContinueProjectId] = useState(initialProjectId ?? "");
  const [continueCategory, setContinueCategory] = useState(defaultExpenseCategory);
  const [continueDate, setContinueDate] = useState(today);
  const [continueRequester, setContinueRequester] = useState("");
  const [continueDescription, setContinueDescription] = useState("");
  const [continueAmountRaw, setContinueAmountRaw] = useState("");
  const [continueError, setContinueError] = useState("");
  const [continueProjectResetSignal, setContinueProjectResetSignal] = useState(0);
  const [continueDraftReady, setContinueDraftReady] = useState(false);
  const [continueDraftSavedAt, setContinueDraftSavedAt] = useState<string | null>(null);
  const [continueDraftNotice, setContinueDraftNotice] = useState("");
  const [continueDraftClearVersion, setContinueDraftClearVersion] = useState(0);
  const [expenseDraftReady, setExpenseDraftReady] = useState(false);
  const [expenseDraftSavedAt, setExpenseDraftSavedAt] = useState<string | null>(null);
  const [expenseDraftNotice, setExpenseDraftNotice] = useState("");
  const kmpDuplicateRequestIdRef = useRef(0);

  const expenseCategoryValues = useMemo(
    () => new Set(expenseCategories.map((item) => item.value)),
    [expenseCategories],
  );

  useEffect(() => {
    const projectId = standardProjectId.trim();
    const description = standardDescription.trim();
    if (mode !== STANDARD_MODE || !projectId || description.length < 2) {
      kmpDuplicateRequestIdRef.current += 1;
      setKmpDuplicateInfo(null);
      setKmpDuplicateError("");
      setIsCheckingKmpDuplicate(false);
      return;
    }

    const requestId = kmpDuplicateRequestIdRef.current + 1;
    kmpDuplicateRequestIdRef.current = requestId;
    setIsCheckingKmpDuplicate(true);
    setKmpDuplicateError("");

    const timer = window.setTimeout(() => {
      getKmpMaterialDuplicateDetectionAction(projectId, description)
        .then((result) => {
          if (kmpDuplicateRequestIdRef.current !== requestId) {
            return;
          }
          setKmpDuplicateInfo(result);
        })
        .catch(() => {
          if (kmpDuplicateRequestIdRef.current !== requestId) {
            return;
          }
          setKmpDuplicateInfo(null);
          setKmpDuplicateError("Gagal memeriksa histori material KMP.");
        })
        .finally(() => {
          if (kmpDuplicateRequestIdRef.current === requestId) {
            setIsCheckingKmpDuplicate(false);
          }
        });
    }, 650);

    return () => {
      window.clearTimeout(timer);
    };
  }, [mode, standardDescription, standardProjectId]);

  useEffect(() => {
    setHokRows(createInitialHokRows(hokProjectPresets));
    setHokImportFeedback(null);
  }, [hokProjectPresets]);

  useEffect(() => {
    if (!expenseActionToken) {
      return;
    }
    setSubmissionToken((current) => current === expenseActionToken ? current : expenseActionToken);
  }, [expenseActionToken]);

  useEffect(() => {
    setScraperRows((prev) => {
      if (prev.length > 0) {
        return prev;
      }
      return createInitialScraperRows(initialProjectId);
    });
  }, [initialProjectId]);

  const focusProjectInput = useCallback(() => {
    const target = projectInputRef.current;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    target.focus();
    target.select();
  }, []);

  const focusScraperRequesterInput = useCallback(() => {
    const target = scraperRequesterInputRef.current;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    target.focus();
    target.select();
  }, []);

  const focusScraperField = useCallback((rowId: string, field: "project" | "amount") => {
    const target =
      field === "project"
        ? scraperProjectInputRefs.current.get(rowId)
        : scraperAmountInputRefs.current.get(rowId);
    if (!(target instanceof HTMLInputElement)) {
      return false;
    }
    target.focus();
    target.select();
    return true;
  }, []);

  const registerScraperProjectInputRef = useCallback((rowId: string, node: HTMLInputElement | null) => {
    if (node) {
      scraperProjectInputRefs.current.set(rowId, node);
      return;
    }
    scraperProjectInputRefs.current.delete(rowId);
  }, []);

  const registerScraperAmountInputRef = useCallback((rowId: string, node: HTMLInputElement | null) => {
    if (node) {
      scraperAmountInputRefs.current.set(rowId, node);
      return;
    }
    scraperAmountInputRefs.current.delete(rowId);
  }, []);

  useEffect(() => {
    if (mode !== SCRAPER_MODE) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      focusScraperRequesterInput();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusScraperRequesterInput, mode]);

  useEffect(() => {
    const pendingFocus = pendingScraperFocusRef.current;
    if (!pendingFocus) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (focusScraperField(pendingFocus.rowId, pendingFocus.field)) {
        pendingScraperFocusRef.current = null;
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [focusScraperField, scraperRows]);

  const resetContinueDraft = useCallback(() => {
    setContinueProjectId("");
    setContinueCategory(defaultExpenseCategory);
    setContinueDate(today);
    setContinueRequester("");
    setContinueDescription("");
    setContinueAmountRaw("");
    setContinueProjectResetSignal((prev) => prev + 1);
  }, [defaultExpenseCategory, today]);

  const clearStaleLocalDraftCache = useCallback(() => {
    window.localStorage.removeItem(EXPENSE_CONTINUE_DRAFT_STORAGE_KEY);
    window.sessionStorage.removeItem(EXPENSE_CONTINUE_DRAFT_PENDING_CLEAR_KEY);
    window.sessionStorage.removeItem(EXPENSE_DRAFT_PENDING_CLEAR_KEY);
    setContinueDraftSavedAt(null);
    setExpenseDraftSavedAt(null);
  }, []);

  const markUserDraftInteraction = useCallback(() => {
    hasUserEditedDraftRef.current = true;
  }, []);

  const resetExpenseDraftAfterSave = useCallback((nextMode?: ExpenseInputMode) => {
    continueDraftClearInProgressRef.current = true;
    hasUserEditedDraftRef.current = false;
    serverDraftIsClearedRef.current = true;
    clearStaleLocalDraftCache();
    if (nextMode) {
      setMode(nextMode);
    }
    setStandardProjectId(initialProjectId ?? "");
    setStandardAdditionalProjectIds([]);
    setStandardCategory(defaultExpenseCategory);
    setStandardCategoryCustom("");
    setStandardDate(today);
    setStandardRequester("");
    setStandardDescription("");
    setStandardAmountRaw("");
    setStandardRecipientName("");
    setStandardUsageInfo("");
    setStandardSpecialistType("");
    setStandardSpecialistTypeCustom("");
    setStandardQuantity("");
    setStandardUnitLabel("");
    setStandardUnitPriceRaw("");
    setScraperRows(createInitialScraperRows(nextMode === SCRAPER_MODE ? undefined : initialProjectId));
    setScraperCategory(defaultExpenseCategory);
    setScraperDate(today);
    setScraperRequester("");
    setScraperDescription("");
    setScraperError("");
    setHokQuery("");
    setHokRows(createInitialHokRows(hokProjectPresets));
    setHokError("");
    setHokPasteText("");
    setHokImportFeedback(null);
    setContinueEntries([]);
    resetContinueDraft();
    setContinueError("");
    setContinueDraftSavedAt(null);
    setExpenseDraftSavedAt(null);
    setSubmissionToken(createExpenseSubmissionToken());
    setContinueDraftNotice("");
    setExpenseDraftNotice("");
    setContinueDraftReady(true);
    setContinueDraftClearVersion((prev) => prev + 1);
  }, [
    clearStaleLocalDraftCache,
    defaultExpenseCategory,
    hokProjectPresets,
    initialProjectId,
    resetContinueDraft,
    today,
  ]);

  const applyExpenseDraftPayload = useCallback(
    (payload: Record<string, unknown>, updatedAt: string | null) => {
      const projectById = new Map(projects.map((project) => [project.id, project] as const));
      const nextMode = resolveDraftMode(getRecordString(payload, "mode"));

      const standardPayload = isRecord(payload.standard) ? payload.standard : {};
      const standardProjectId = getRecordString(standardPayload, "projectId").trim();
      setStandardProjectId(projectById.has(standardProjectId) ? standardProjectId : "");
      setStandardAdditionalProjectIds(
        getRecordStringList(standardPayload, "additionalProjectIds").filter((projectId) => projectById.has(projectId)),
      );
      setStandardCategory(resolveDraftCategory(getRecordString(standardPayload, "category"), expenseCategoryValues, defaultExpenseCategory));
      setStandardCategoryCustom(getRecordString(standardPayload, "categoryCustom"));
      setStandardDate(resolveDraftDate(getRecordString(standardPayload, "expenseDate"), today));
      setStandardRequester(getRecordString(standardPayload, "requesterName"));
      setStandardDescription(getRecordString(standardPayload, "description"));
      setStandardAmountRaw(normalizeDigits(getRecordString(standardPayload, "amountRaw")));
      setStandardRecipientName(getRecordString(standardPayload, "recipientName"));
      setStandardUsageInfo(getRecordString(standardPayload, "usageInfo"));
      setStandardSpecialistType(getRecordString(standardPayload, "specialistType"));
      setStandardSpecialistTypeCustom(getRecordString(standardPayload, "specialistTypeCustom"));
      setStandardQuantity(normalizeDigits(getRecordString(standardPayload, "quantity")));
      setStandardUnitLabel(getRecordString(standardPayload, "unitLabel"));
      setStandardUnitPriceRaw(normalizeDigits(getRecordString(standardPayload, "unitPriceRaw")));

      const scraperPayload = isRecord(payload.scraper) ? payload.scraper : {};
      setScraperCategory(resolveDraftCategory(getRecordString(scraperPayload, "category"), expenseCategoryValues, defaultExpenseCategory));
      setScraperDate(resolveDraftDate(getRecordString(scraperPayload, "expenseDate"), today));
      setScraperRequester(getRecordString(scraperPayload, "requesterName"));
      setScraperDescription(getRecordString(scraperPayload, "description"));
      const nextScraperRows = (Array.isArray(scraperPayload.rows) ? scraperPayload.rows : [])
        .map((item): ScraperRow | null => {
          if (!isRecord(item)) {
            return null;
          }
          const projectId = getRecordString(item, "projectId").trim();
          const amountRaw = normalizeDigits(getRecordString(item, "amountRaw") || getRecordString(item, "amount"));
          if (!projectById.has(projectId) && !amountRaw) {
            return null;
          }
          return {
            id: getRecordString(item, "id") || createScraperRow().id,
            projectId: projectById.has(projectId) ? projectId : "",
            amountRaw,
          };
        })
        .filter((row): row is ScraperRow => Boolean(row));
      setScraperRows(nextScraperRows.length > 0 ? nextScraperRows : createInitialScraperRows(initialProjectId));

      const continuePayload = isRecord(payload.continueMode) ? payload.continueMode : {};
      const continueProjectId = getRecordString(continuePayload, "projectId").trim();
      const nextContinueEntries = (Array.isArray(continuePayload.entries) ? continuePayload.entries : [])
        .map((item): ContinueEntry | null => {
          if (!isRecord(item)) {
            return null;
          }
          const projectId = getRecordString(item, "projectId").trim();
          const project = projectById.get(projectId);
          const requesterName = getRecordString(item, "requesterName").trim();
          const description = getRecordString(item, "description").trim();
          const amountRaw = normalizeDigits(getRecordString(item, "amountRaw") || getRecordString(item, "amount"));
          if (!project || !requesterName || !description || !amountRaw) {
            return null;
          }
          return {
            id: getRecordString(item, "id") || createContinueEntryId(),
            projectId,
            projectName: project.name,
            category: resolveDraftCategory(getRecordString(item, "category"), expenseCategoryValues, defaultExpenseCategory),
            expenseDate: resolveDraftDate(getRecordString(item, "expenseDate"), today),
            requesterName,
            description,
            amountRaw,
          };
        })
        .filter((entry): entry is ContinueEntry => Boolean(entry));
      setContinueEntries(nextContinueEntries);
      setContinueProjectId(projectById.has(continueProjectId) ? continueProjectId : "");
      setContinueCategory(resolveDraftCategory(getRecordString(continuePayload, "category"), expenseCategoryValues, defaultExpenseCategory));
      setContinueDate(resolveDraftDate(getRecordString(continuePayload, "expenseDate"), today));
      setContinueRequester(getRecordString(continuePayload, "requesterName"));
      setContinueDescription(getRecordString(continuePayload, "description"));
      setContinueAmountRaw(normalizeDigits(getRecordString(continuePayload, "amountRaw")));

      const hokPayload = isRecord(payload.hok) ? payload.hok : {};
      setHokDate(resolveDraftDate(getRecordString(hokPayload, "expenseDate"), today));
      setHokPasteText(getRecordString(hokPayload, "pasteText"));
      const hokDraftRows = new Map<string, Record<string, unknown>>();
      if (Array.isArray(hokPayload.rows)) {
        for (const item of hokPayload.rows) {
          if (!isRecord(item)) {
            continue;
          }
          const projectId = getRecordString(item, "projectId").trim();
          if (projectId) {
            hokDraftRows.set(projectId, item);
          }
        }
      }
      setHokRows(
        createInitialHokRows(hokProjectPresets).map((row) => {
          const draftRow = hokDraftRows.get(row.projectId);
          if (!draftRow) {
            return row;
          }
          return {
            ...row,
            requesterName: getRecordString(draftRow, "requesterName") || row.requesterName,
            amountRaw: normalizeDigits(getRecordString(draftRow, "amountRaw")),
            selected:
              typeof draftRow.selected === "boolean"
                ? draftRow.selected
                : row.selected,
          };
        }),
      );

      setMode(nextMode);
      setContinueDraftReady(true);
      setExpenseDraftSavedAt(updatedAt);
      setExpenseDraftNotice(updatedAt ? "Draft input biaya dipulihkan dari akun ini." : "");
      serverDraftIsClearedRef.current = false;
      hasUserEditedDraftRef.current = false;
    },
    [defaultExpenseCategory, expenseCategoryValues, hokProjectPresets, initialProjectId, projects, today],
  );

  const successMessage = searchParams.get("success")?.trim() ?? "";
  const errorMessage = searchParams.get("error")?.trim() ?? "";
  const expenseDraftClearToken = searchParams.get("expense_draft_clear")?.trim() ?? "";
  const continueDraftClearToken = searchParams.get("expense_continue_draft_clear")?.trim() ?? "";

  useEffect(() => {
    const hasServerClearSignal =
      (expenseDraftClearToken.length > 0 &&
        lastProcessedContinueDraftClearRef.current !== expenseDraftClearToken) ||
      (continueDraftClearToken.length > 0 &&
        lastProcessedContinueDraftClearRef.current !== continueDraftClearToken);
    const shouldClearSubmittedDraft =
      hasServerClearSignal ||
      (Boolean(successMessage) &&
        (window.sessionStorage.getItem(EXPENSE_DRAFT_PENDING_CLEAR_KEY) === "1" ||
          window.sessionStorage.getItem(EXPENSE_CONTINUE_DRAFT_PENDING_CLEAR_KEY) === "1"));

    if (errorMessage) {
      window.sessionStorage.removeItem(EXPENSE_DRAFT_PENDING_CLEAR_KEY);
      window.sessionStorage.removeItem(EXPENSE_CONTINUE_DRAFT_PENDING_CLEAR_KEY);
    }

    if (shouldClearSubmittedDraft) {
      if (expenseDraftClearToken || continueDraftClearToken) {
        lastProcessedContinueDraftClearRef.current = expenseDraftClearToken || continueDraftClearToken;
      }
      resetExpenseDraftAfterSave(expenseSavedMode ?? mode);
      return;
    }

    if (!expenseDraftReady || continueDraftReady) {
      return;
    }

    const projectById = new Map(projects.map((project) => [project.id, project] as const));

    try {
      const rawDraft = window.localStorage.getItem(EXPENSE_CONTINUE_DRAFT_STORAGE_KEY);
      if (!rawDraft) {
        setContinueDraftReady(true);
        return;
      }

      const parsedDraft: unknown = JSON.parse(rawDraft);
      if (!isRecord(parsedDraft)) {
        window.localStorage.removeItem(EXPENSE_CONTINUE_DRAFT_STORAGE_KEY);
        setContinueDraftReady(true);
        return;
      }

      const current = isRecord(parsedDraft.current) ? parsedDraft.current : {};
      const savedAt = getRecordString(parsedDraft, "savedAt") || null;
      const restoredProjectId = getRecordString(current, "projectId").trim();
      const nextProjectId = projectById.has(restoredProjectId) ? restoredProjectId : "";
      const nextCategory = resolveDraftCategory(
        getRecordString(current, "category"),
        expenseCategoryValues,
        defaultExpenseCategory,
      );
      const nextDate = resolveDraftDate(getRecordString(current, "expenseDate"), today);
      const nextRequester = getRecordString(current, "requesterName");
      const nextDescription = getRecordString(current, "description");
      const nextAmountRaw = normalizeDigits(getRecordString(current, "amountRaw"));
      const nextEntries = (Array.isArray(parsedDraft.entries) ? parsedDraft.entries : [])
        .map((item): ContinueEntry | null => {
          if (!isRecord(item)) {
            return null;
          }
          const projectId = getRecordString(item, "projectId").trim();
          const project = projectById.get(projectId);
          const requesterName = getRecordString(item, "requesterName").trim();
          const description = getRecordString(item, "description").trim();
          const amountRaw = normalizeDigits(getRecordString(item, "amountRaw") || getRecordString(item, "amount"));
          const amount = Number(amountRaw);
          if (!project || !requesterName || !description || !Number.isFinite(amount) || amount <= 0) {
            return null;
          }

          return {
            id: getRecordString(item, "id") || createContinueEntryId(),
            projectId,
            projectName: project.name,
            category: resolveDraftCategory(
              getRecordString(item, "category"),
              expenseCategoryValues,
              defaultExpenseCategory,
            ),
            expenseDate: resolveDraftDate(getRecordString(item, "expenseDate"), today),
            requesterName,
            description,
            amountRaw,
          };
        })
        .filter((entry): entry is ContinueEntry => Boolean(entry));

      if (
        hasContinueDraftContent({
          entries: nextEntries,
          projectId: nextProjectId,
          requesterName: nextRequester,
          description: nextDescription,
          amountRaw: nextAmountRaw,
        })
      ) {
        setMode(CONTINUE_MODE);
        setContinueEntries(nextEntries);
        setContinueProjectId(nextProjectId);
        setContinueCategory(nextCategory);
        setContinueDate(nextDate);
        setContinueRequester(nextRequester);
        setContinueDescription(nextDescription);
        setContinueAmountRaw(nextAmountRaw);
        setContinueDraftSavedAt(savedAt);
        setContinueDraftNotice("Draft mode continue dipulihkan dari perangkat ini.");
        if (nextProjectId) {
          window.requestAnimationFrame(() => {
            window.dispatchEvent(
              new CustomEvent(PROJECT_AUTOCOMPLETE_SELECT_EVENT, {
                detail: { projectId: nextProjectId },
              }),
            );
          });
        }
      }
    } catch {
      window.localStorage.removeItem(EXPENSE_CONTINUE_DRAFT_STORAGE_KEY);
    } finally {
      setContinueDraftReady(true);
    }
  }, [
    continueDraftClearToken,
    continueDraftReady,
    defaultExpenseCategory,
    errorMessage,
    expenseDraftClearToken,
    expenseDraftReady,
    expenseSavedMode,
    expenseCategoryValues,
    mode,
    projects,
    resetExpenseDraftAfterSave,
    successMessage,
    today,
  ]);

  useEffect(() => {
    if (hasLoadedExpenseDraftRef.current) {
      return;
    }
    if (expenseDraftClearToken || continueDraftClearToken) {
      hasLoadedExpenseDraftRef.current = true;
      setExpenseDraftReady(true);
      return;
    }

    let isCancelled = false;
    hasLoadedExpenseDraftRef.current = true;
    getExpenseInputDraftAction()
      .then((draft) => {
        if (isCancelled) {
          return;
        }
        draftServerUpdatedAtRef.current = draft?.updatedAt ?? null;
        if (draft?.isCleared) {
          serverDraftIsClearedRef.current = true;
          clearStaleLocalDraftCache();
          return;
        }
        if (draft?.payload) {
          applyExpenseDraftPayload(draft.payload, draft.updatedAt);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setExpenseDraftNotice("Draft akun belum bisa dibaca.");
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setExpenseDraftReady(true);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    applyExpenseDraftPayload,
    clearStaleLocalDraftCache,
    continueDraftClearToken,
    expenseDraftClearToken,
  ]);

  useEffect(() => {
    if (!expenseDraftReady) {
      return;
    }

    let isChecking = false;
    const checkServerDraftStatus = () => {
      if (isChecking) {
        return;
      }
      isChecking = true;
      getExpenseInputDraftAction()
        .then((draft) => {
          if (
            draft?.isCleared &&
            toTimestamp(draft.updatedAt) > toTimestamp(draftServerUpdatedAtRef.current)
          ) {
            draftServerUpdatedAtRef.current = draft.updatedAt;
            serverDraftIsClearedRef.current = true;
            if (hasUserEditedDraftRef.current) {
              clearStaleLocalDraftCache();
              setExpenseDraftNotice("Draft lama sudah kosong di akun. Input aktif ini akan disimpan sebagai draft baru.");
              setContinueDraftNotice("");
              return;
            }
            resetExpenseDraftAfterSave(mode);
            setExpenseDraftNotice("Draft akun dikosongkan karena data sudah disimpan di perangkat lain.");
            setContinueDraftNotice("");
          }
        })
        .catch(() => undefined)
        .finally(() => {
          isChecking = false;
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkServerDraftStatus();
      }
    };

    window.addEventListener("focus", checkServerDraftStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(checkServerDraftStatus, 30000);

    return () => {
      window.removeEventListener("focus", checkServerDraftStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [clearStaleLocalDraftCache, expenseDraftReady, mode, resetExpenseDraftAfterSave]);

  useEffect(() => {
    if (!continueDraftReady) {
      return;
    }

    const hasDraftContent = hasContinueDraftContent({
      entries: continueEntries,
      projectId: continueProjectId,
      requesterName: continueRequester,
      description: continueDescription,
      amountRaw: continueAmountRaw,
    });

    if (continueDraftClearInProgressRef.current) {
      window.localStorage.removeItem(EXPENSE_CONTINUE_DRAFT_STORAGE_KEY);
      setContinueDraftSavedAt(null);
      if (!hasDraftContent) {
        continueDraftClearInProgressRef.current = false;
      }
      return;
    }

    if (!hasDraftContent) {
      window.localStorage.removeItem(EXPENSE_CONTINUE_DRAFT_STORAGE_KEY);
      setContinueDraftSavedAt(null);
      return;
    }

    const savedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(
        EXPENSE_CONTINUE_DRAFT_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          savedAt,
          current: {
            projectId: continueProjectId,
            category: continueCategory,
            expenseDate: continueDate,
            requesterName: continueRequester,
            description: continueDescription,
            amountRaw: normalizeDigits(continueAmountRaw),
          },
          entries: continueEntries,
        }),
      );
      setContinueDraftSavedAt(savedAt);
      setContinueDraftNotice("");
    } catch {
      setContinueDraftNotice("Draft belum bisa disimpan di browser ini.");
    }
  }, [
    continueAmountRaw,
    continueCategory,
    continueDate,
    continueDescription,
    continueDraftReady,
    continueDraftClearVersion,
    continueEntries,
    continueProjectId,
    continueRequester,
  ]);

  const expenseDraftPayload = useMemo<ExpenseDraftPayload>(
    () => ({
      version: 2,
      mode,
      savedAt: new Date().toISOString(),
      standard: {
        projectId: standardProjectId,
        additionalProjectIds: standardAdditionalProjectIds,
        category: standardCategory,
        categoryCustom: standardCategoryCustom,
        expenseDate: standardDate,
        requesterName: standardRequester,
        description: standardDescription,
        amountRaw: standardAmountRaw,
        recipientName: standardRecipientName,
        usageInfo: standardUsageInfo,
        specialistType: standardSpecialistType,
        specialistTypeCustom: standardSpecialistTypeCustom,
        quantity: standardQuantity,
        unitLabel: standardUnitLabel,
        unitPriceRaw: standardUnitPriceRaw,
      },
      scraper: {
        category: scraperCategory,
        expenseDate: scraperDate,
        requesterName: scraperRequester,
        description: scraperDescription,
        rows: scraperRows,
      },
      continueMode: {
        entries: continueEntries,
        projectId: continueProjectId,
        category: continueCategory,
        expenseDate: continueDate,
        requesterName: continueRequester,
        description: continueDescription,
        amountRaw: continueAmountRaw,
      },
      hok: {
        expenseDate: hokDate,
        pasteText: hokPasteText,
        rows: hokRows.map((row) => ({
          projectId: row.projectId,
          requesterName: row.requesterName === row.defaultRequesterName ? "" : row.requesterName,
          amountRaw: row.amountRaw,
          selected: row.selected,
        })),
      },
    }),
    [
      continueAmountRaw,
      continueCategory,
      continueDate,
      continueDescription,
      continueEntries,
      continueProjectId,
      continueRequester,
      hokDate,
      hokPasteText,
      hokRows,
      mode,
      scraperCategory,
      scraperDate,
      scraperDescription,
      scraperRequester,
      scraperRows,
      standardAdditionalProjectIds,
      standardAmountRaw,
      standardCategory,
      standardCategoryCustom,
      standardDate,
      standardDescription,
      standardProjectId,
      standardQuantity,
      standardRecipientName,
      standardRequester,
      standardSpecialistType,
      standardSpecialistTypeCustom,
      standardUnitLabel,
      standardUnitPriceRaw,
      standardUsageInfo,
    ],
  );

  useEffect(() => {
    if (!expenseDraftReady || continueDraftClearInProgressRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (continueDraftClearInProgressRef.current) {
        return;
      }
      if (
        !hasExpenseInputDraftContent(
          expenseDraftPayload,
          defaultExpenseCategory,
          today,
          initialProjectId ?? "",
        )
      ) {
        if (!serverDraftIsClearedRef.current) {
          serverDraftIsClearedRef.current = true;
          clearExpenseInputDraftAction()
            .then((result) => {
              if (result?.updatedAt) {
                draftServerUpdatedAtRef.current = result.updatedAt;
              }
              if (result?.isCleared) {
                serverDraftIsClearedRef.current = true;
              }
            })
            .catch(() => {
              serverDraftIsClearedRef.current = false;
            });
        }
        setExpenseDraftSavedAt(null);
        return;
      }

      saveExpenseInputDraftAction({
        ...expenseDraftPayload,
        serverKnownUpdatedAt: draftServerUpdatedAtRef.current,
      })
        .then((result) => {
          if (result?.isCleared) {
            draftServerUpdatedAtRef.current = result.updatedAt ?? null;
            serverDraftIsClearedRef.current = true;
            setExpenseDraftNotice("Draft lama sudah kosong di akun. Lanjutkan input, perubahan berikutnya akan menjadi draft baru.");
            return;
          }
          serverDraftIsClearedRef.current = false;
          if (result?.updatedAt) {
            draftServerUpdatedAtRef.current = result.updatedAt;
          }
          setExpenseDraftSavedAt(new Date().toISOString());
          setExpenseDraftNotice("");
        })
        .catch(() => {
          setExpenseDraftNotice("Draft akun belum bisa disimpan.");
        });
    }, EXPENSE_INPUT_DRAFT_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    defaultExpenseCategory,
    expenseDraftPayload,
    expenseDraftReady,
    initialProjectId,
    resetExpenseDraftAfterSave,
    today,
  ]);

  const clearContinueDraft = useCallback(() => {
    resetExpenseDraftAfterSave(mode);
    setContinueDraftNotice("Draft mode continue dihapus.");
  }, [mode, resetExpenseDraftAfterSave]);

  const validateHokRows = useCallback(() => {
    const selectedRows = hokRows.filter((row) => row.selected);
    if (selectedRows.length === 0) {
      return "Pilih minimal satu project HOK yang ingin disimpan.";
    }

    const missingRequesterRows = selectedRows.filter((row) => row.requesterName.trim().length === 0);
    if (missingRequesterRows.length > 0) {
      return `Nama pengajuan wajib diisi untuk ${missingRequesterRows.length} project terpilih.`;
    }

    const incompleteRows = selectedRows.filter((row) => {
      const amount = Number(normalizeDigits(row.amountRaw));
      return !Number.isFinite(amount) || amount <= 0;
    });
    if (incompleteRows.length > 0) {
      return `Nominal HOK wajib diisi untuk ${incompleteRows.length} project terpilih.`;
    }

    return "";
  }, [hokRows]);

  const validateScraperRows = useCallback(() => {
    const activeRows = scraperRows.filter(
      (row) => row.projectId.trim().length > 0 || normalizeDigits(row.amountRaw).length > 0,
    );
    if (activeRows.length === 0) {
      return "Tambahkan minimal satu project pada mode scraper.";
    }

    const incompleteRows = activeRows.filter((row) => {
      const amount = Number(normalizeDigits(row.amountRaw));
      return !row.projectId.trim() || !Number.isFinite(amount) || amount <= 0;
    });
    if (incompleteRows.length > 0) {
      return "Setiap baris scraper wajib berisi project dan nominal yang valid.";
    }

    return "";
  }, [scraperRows]);

  const saveScraperExpense = useCallback(() => {
    if (isScraperSaving) {
      return;
    }

    const validationMessage = validateScraperRows();
    if (validationMessage) {
      setScraperError(validationMessage);
      setHokError("");
      return;
    }

    const form = rootRef.current?.closest("form");
    if (!(form instanceof HTMLFormElement)) {
      setScraperError("Form input scraper tidak ditemukan. Muat ulang halaman lalu coba lagi.");
      return;
    }

    setHokError("");
    setScraperError("");
    setContinueError("");
    setScraperSuccessMessage("");
    setIsScraperSaving(true);
    const pendingExpenses = scraperRows.flatMap<ExpenseEntry>((row) => {
      const amount = Number(normalizeDigits(row.amountRaw));
      if (!row.projectId.trim() || !Number.isFinite(amount) || amount <= 0) {
        return [];
      }
      return [{
        id: `pending-expense-${crypto.randomUUID()}`,
        projectId: row.projectId,
        projectName: projects.find((project) => project.id === row.projectId)?.name,
        category: scraperCategory,
        specialistType: null,
        requesterName: scraperRequester || null,
        description: scraperDescription || null,
        recipientName: null,
        quantity: 0,
        unitLabel: null,
        usageInfo: "Menyimpan data scraper ke database...",
        unitPrice: 0,
        amount,
        expenseDate: scraperDate,
        createdAt: new Date().toISOString(),
      }];
    });
    const pendingExpenseIds = pendingExpenses.map((row) => row.id);
    addPendingExpenses(pendingExpenses);
    let timeoutId: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error("SCRAPER_SAVE_TIMEOUT")),
        SCRAPER_SAVE_TIMEOUT_MS,
      );
    });
    void Promise.race([
      createScraperExpenseQuickAction(new FormData(form)),
      timeout,
    ])
      .then((result) => {
        if (!result.ok) {
          removePendingExpenseIds(pendingExpenseIds);
          setScraperError(result.message);
          return;
        }

        resetExpenseDraftAfterSave(SCRAPER_MODE);
        setScraperSuccessMessage(result.message);
        void clearExpenseInputDraftAction().catch(() => undefined);
        router.refresh();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.message === "SCRAPER_SAVE_TIMEOUT")) {
          removePendingExpenseIds(pendingExpenseIds);
        }
        setScraperError(
          error instanceof Error && error.message === "SCRAPER_SAVE_TIMEOUT"
            ? "Respons server terlalu lama. Data mungkin sudah tersimpan. Periksa rekap sebelum mencoba simpan ulang."
            : "Gagal menyimpan data scraper. Silakan coba lagi.",
        );
      })
      .finally(() => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        setIsScraperSaving(false);
      });
  }, [
    addPendingExpenses,
    isScraperSaving,
    projects,
    removePendingExpenseIds,
    resetExpenseDraftAfterSave,
    router,
    scraperCategory,
    scraperDate,
    scraperDescription,
    scraperRequester,
    scraperRows,
    validateScraperRows,
  ]);

  useEffect(() => {
    if (!hokError || mode !== HOK_MODE) {
      return;
    }

    const nextError = validateHokRows();
    if (!nextError) {
      setHokError("");
    }
  }, [hokError, mode, validateHokRows]);

  useEffect(() => {
    if (!scraperError || mode !== SCRAPER_MODE) {
      return;
    }

    const nextError = validateScraperRows();
    if (!nextError) {
      setScraperError("");
    }
  }, [mode, scraperError, validateScraperRows]);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const handleSubmit = (event: Event) => {
      if (mode === STANDARD_MODE) {
        setHokError("");
        setScraperError("");
        setContinueError("");
        window.sessionStorage.setItem(EXPENSE_DRAFT_PENDING_CLEAR_KEY, "1");
        window.sessionStorage.removeItem(EXPENSE_CONTINUE_DRAFT_PENDING_CLEAR_KEY);
        window.sessionStorage.setItem(EXPENSE_PROJECT_REFOCUS_KEY, "1");
        return;
      }

      if (mode === CONTINUE_MODE) {
        if (continueEntries.length === 0) {
          event.preventDefault();
          setContinueError("Tambahkan minimal satu entry biaya sebelum menyimpan.");
          return;
        }
        setHokError("");
        setScraperError("");
        setContinueError("");
        window.sessionStorage.setItem(EXPENSE_DRAFT_PENDING_CLEAR_KEY, "1");
        window.sessionStorage.setItem(EXPENSE_CONTINUE_DRAFT_PENDING_CLEAR_KEY, "1");
        window.sessionStorage.setItem(EXPENSE_PROJECT_REFOCUS_KEY, "1");
        return;
      }

      if (mode === SCRAPER_MODE) {
        event.preventDefault();
        saveScraperExpense();
        return;
      }

      const validationMessage =
        mode === HOK_MODE ? validateHokRows() : "";
      if (!validationMessage) {
        setHokError("");
        setScraperError("");
        setContinueError("");
        window.sessionStorage.setItem(EXPENSE_DRAFT_PENDING_CLEAR_KEY, "1");
        window.sessionStorage.removeItem(EXPENSE_CONTINUE_DRAFT_PENDING_CLEAR_KEY);
        window.sessionStorage.setItem(EXPENSE_PROJECT_REFOCUS_KEY, "1");
        return;
      }

      event.preventDefault();
      if (mode === HOK_MODE) {
        setHokError(validationMessage);
        setScraperError("");
        return;
      }
      setScraperError(validationMessage);
      setHokError("");
    };

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [
    continueEntries.length,
    mode,
    saveScraperExpense,
    validateHokRows,
  ]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }
    if (window.sessionStorage.getItem(EXPENSE_PROJECT_REFOCUS_KEY) !== "1") {
      return;
    }

    window.sessionStorage.removeItem(EXPENSE_PROJECT_REFOCUS_KEY);

    const frameId = window.requestAnimationFrame(() => {
      focusProjectInput();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [focusProjectInput, successMessage]);

  useEffect(() => {
    if (!successMessage || expenseSavedMode !== SCRAPER_MODE) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      focusScraperRequesterInput();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [expenseSavedMode, focusScraperRequesterInput, successMessage]);

  const normalizedHokQuery = normalizeText(hokQuery);
  const visibleHokRows = useMemo(() => {
    if (!normalizedHokQuery) {
      return hokRows;
    }

    return hokRows.filter((row) =>
      normalizeText([row.projectName, row.requesterName, row.defaultRequesterName, row.clientName].join(" ")).includes(
        normalizedHokQuery,
      ),
    );
  }, [hokRows, normalizedHokQuery]);

  const selectedHokRows = useMemo(() => hokRows.filter((row) => row.selected), [hokRows]);
  const hokRowsMissingRequester = useMemo(
    () => selectedHokRows.filter((row) => row.requesterName.trim().length === 0),
    [selectedHokRows],
  );
  const hokRowsMissingAmount = useMemo(
    () =>
      selectedHokRows.filter((row) => {
        const amount = Number(normalizeDigits(row.amountRaw));
        return !Number.isFinite(amount) || amount <= 0;
      }),
    [selectedHokRows],
  );
  const selectedHokTotalAmount = useMemo(
    () =>
      selectedHokRows.reduce((sum, row) => {
        const amount = Number(normalizeDigits(row.amountRaw));
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [selectedHokRows],
  );
  const hokPayload = useMemo(
    () =>
      JSON.stringify(
        selectedHokRows.map((row) => ({
          projectId: row.projectId,
          projectName: row.projectName,
          requesterName: row.requesterName,
          amount: normalizeDigits(row.amountRaw),
        })),
      ),
    [selectedHokRows],
  );
  const isHokSubmitDisabled =
    mode === HOK_MODE &&
    (
      selectedHokRows.length === 0 ||
      hokRowsMissingRequester.length > 0 ||
      hokRowsMissingAmount.length > 0 ||
      hokProjectPresets.length === 0
    );
  const activeScraperRows = useMemo(
    () =>
      scraperRows.filter(
        (row) => row.projectId.trim().length > 0 || normalizeDigits(row.amountRaw).length > 0,
      ),
    [scraperRows],
  );
  const completedScraperRows = useMemo(
    () =>
      activeScraperRows.filter((row) => {
        const amount = Number(normalizeDigits(row.amountRaw));
        return row.projectId.trim().length > 0 && Number.isFinite(amount) && amount > 0;
      }),
    [activeScraperRows],
  );
  const scraperRowsInvalid = useMemo(
    () =>
      activeScraperRows.filter((row) => {
        const amount = Number(normalizeDigits(row.amountRaw));
        return !row.projectId.trim() || !Number.isFinite(amount) || amount <= 0;
      }),
    [activeScraperRows],
  );
  const scraperPayload = useMemo(
    () =>
      JSON.stringify(
        completedScraperRows.map((row) => ({
          id: row.id,
          projectId: row.projectId,
          projectName: projects.find((project) => project.id === row.projectId)?.name ?? "",
          amount: normalizeDigits(row.amountRaw),
        })),
      ),
    [completedScraperRows, projects],
  );
  const isScraperSubmitDisabled =
    mode === SCRAPER_MODE && (completedScraperRows.length === 0 || scraperRowsInvalid.length > 0);

  const updateHokRow = (
    projectId: string,
    patch: Partial<Pick<HokProjectRow, "selected" | "amountRaw" | "requesterName" | "isRequesterEditable">>,
  ) => {
    setHokRows((prev) =>
      prev.map((row) => (row.projectId === projectId ? { ...row, ...patch } : row)),
    );
  };

  const updateScraperRow = (rowId: string, patch: Partial<Pick<ScraperRow, "projectId" | "amountRaw">>) => {
    setScraperRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const appendScraperRow = useCallback((focusField: "project" | "amount" = "project") => {
    const nextRow = createScraperRow();
    pendingScraperFocusRef.current = { rowId: nextRow.id, field: focusField };
    setScraperRows((prev) => [...prev, nextRow]);
  }, []);

  const removeScraperRow = (rowId: string) => {
    setScraperRows((prev) => {
      if (prev.length <= 1) {
        return [createScraperRow()];
      }
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const focusNextScraperProjectRow = useCallback(
    (currentRowId: string) => {
      const currentIndex = scraperRows.findIndex((row) => row.id === currentRowId);
      const nextRow = currentIndex >= 0 ? scraperRows[currentIndex + 1] : null;
      if (nextRow) {
        if (!focusScraperField(nextRow.id, "project")) {
          pendingScraperFocusRef.current = { rowId: nextRow.id, field: "project" };
        }
        return;
      }
      appendScraperRow("project");
    },
    [appendScraperRow, focusScraperField, scraperRows],
  );

  const handleScraperRequesterEnter = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      window.requestAnimationFrame(() => {
        scraperDescriptionInputRef.current?.focus();
        scraperDescriptionInputRef.current?.select();
      });
    },
    [],
  );

  const handleScraperDescriptionEnter = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const firstRow = scraperRows[0];
      if (!firstRow) {
        appendScraperRow("project");
        return;
      }

      window.requestAnimationFrame(() => {
        if (!focusScraperField(firstRow.id, "project")) {
          pendingScraperFocusRef.current = { rowId: firstRow.id, field: "project" };
        }
      });
    },
    [appendScraperRow, focusScraperField, scraperRows],
  );

  const handleScraperAmountEnter = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>, row: ScraperRow) => {
      if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const amount = Number(normalizeDigits(row.amountRaw));
      if (!row.projectId.trim() || !Number.isFinite(amount) || amount <= 0) {
        setScraperError("Lengkapi project dan nominal yang valid sebelum pindah ke baris berikutnya.");
        if (!row.projectId.trim()) {
          window.requestAnimationFrame(() => {
            focusScraperField(row.id, "project");
          });
        }
        return;
      }

      setScraperError("");
      window.requestAnimationFrame(() => {
        focusNextScraperProjectRow(row.id);
      });
    },
    [focusNextScraperProjectRow, focusScraperField],
  );

  const toggleAllVisibleHokRows = (selected: boolean) => {
    const visibleIds = new Set(visibleHokRows.map((row) => row.projectId));
    setHokRows((prev) =>
      prev.map((row) =>
        visibleIds.has(row.projectId)
          ? {
              ...row,
              selected,
            }
          : row,
      ),
    );
  };

  const applyHokImportResult = useCallback((result: HokImportResult, sourceLabel: string) => {
    const feedback = buildHokImportFeedback(result, sourceLabel);
    if (result.matchedRows.length > 0) {
      const matchedRowByProjectId = new Map(result.matchedRows.map((row) => [row.projectId, row] as const));
      setHokRows((prev) =>
        prev.map((row) => {
          const matchedRow = matchedRowByProjectId.get(row.projectId);
          if (!matchedRow) {
            return row;
          }
          return {
            ...row,
            selected: true,
            amountRaw: matchedRow.amountRaw,
            requesterName: result.headerDetected && matchedRow.requesterName.trim() 
                             ? matchedRow.requesterName.trim() 
                             : row.requesterName,
            isRequesterEditable: false,
          };
        }),
      );
      setHokError("");
    }
    setHokImportFeedback(feedback);
  }, []);

  const applyHokClipboardImport = useCallback(
    (text: string, sourceLabel: string) => {
      if (hokProjectPresets.length === 0) {
        setHokImportFeedback({
          tone: "error",
          title: "Mode HOK belum punya project yang bisa dipakai.",
          details: ["Tambahkan project klien KMP Cianjur terlebih dahulu."],
        });
        return;
      }

      if (!text.trim()) {
        setHokImportFeedback({
          tone: "error",
          title: `Data ${sourceLabel} masih kosong.`,
          details: ["Paste data Excel dulu, lalu jalankan proses impor HOK."],
        });
        return;
      }

      const result = parseHokClipboardText(text, hokProjectPresets);
      applyHokImportResult(result, sourceLabel);
    },
    [applyHokImportResult, hokProjectPresets],
  );

  const handleHokPasteAreaPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedText = event.clipboardData.getData("text");
      if (!pastedText.trim()) {
        return;
      }
      event.preventDefault();
      setHokPasteText(pastedText);
      applyHokClipboardImport(pastedText, "paste Excel");
    },
    [applyHokClipboardImport],
  );

  const handleReadHokClipboard = useCallback(async () => {
    if (!navigator.clipboard?.readText) {
      setHokImportFeedback({
        tone: "error",
        title: "Clipboard browser tidak tersedia.",
        details: ["Gunakan Ctrl+V pada area paste jika tombol clipboard tidak bisa dipakai."],
      });
      return;
    }

    setIsReadingHokClipboard(true);
    try {
      const clipboardText = await navigator.clipboard.readText();
      setHokPasteText(clipboardText);
      applyHokClipboardImport(clipboardText, "clipboard");
    } catch {
      setHokImportFeedback({
        tone: "error",
        title: "Gagal membaca clipboard.",
        details: ["Izin clipboard mungkin ditolak. Gunakan Ctrl+V pada area paste."],
      });
    } finally {
      setIsReadingHokClipboard(false);
    }
  }, [applyHokClipboardImport]);

  const handleHokExcelFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (!file) {
        return;
      }

      setIsHokFileImporting(true);
      try {
        const [XLSX, fileBuffer] = await Promise.all([import("xlsx/xlsx.mjs"), file.arrayBuffer()]);
        const workbook = XLSX.read(fileBuffer, {
          type: "array",
          cellDates: false,
          raw: false,
        });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setHokImportFeedback({
            tone: "error",
            title: `File ${file.name} tidak memiliki sheet yang bisa dibaca.`,
            details: ["Pastikan file .xlsx berisi minimal satu sheet tabel HOK."],
          });
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<Array<unknown>>(worksheet, {
          header: 1,
          defval: "",
          raw: false,
        });
        const result = parseHokImportRows(rows, hokProjectPresets);
        applyHokImportResult(result, file.name);
      } catch (error) {
        const message = error instanceof Error && error.message.trim() ? error.message.trim() : "File tidak valid.";
        setHokImportFeedback({
          tone: "error",
          title: `Gagal membaca file ${file.name}.`,
          details: [message],
        });
      } finally {
        event.currentTarget.value = "";
        setIsHokFileImporting(false);
      }
    },
    [applyHokImportResult, hokProjectPresets],
  );


  const handleContinueAdd = useCallback(() => {
    const projectId = continueProjectId.trim();
    const requesterName = continueRequester.trim();
    const description = continueDescription.trim();
    const amount = Number(normalizeDigits(continueAmountRaw));
    if (!projectId) { setContinueError("Pilih project terlebih dahulu."); return; }
    if (!requesterName) { setContinueError("Nama pengajuan wajib diisi."); return; }
    if (!description) { setContinueError("Keterangan wajib diisi."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setContinueError("Nominal harus lebih dari 0."); return; }

    const projectName = projects.find((p) => p.id === projectId)?.name ?? projectId;
    const entry: ContinueEntry = {
      id: createContinueEntryId(),
      projectId,
      projectName,
      category: continueCategory,
      expenseDate: continueDate,
      requesterName,
      description,
      amountRaw: normalizeDigits(continueAmountRaw),
    };
    setContinueEntries((prev) => [...prev, entry]);
    resetContinueDraft();
    setContinueError("");
    window.requestAnimationFrame(() => {
      focusProjectInput();
    });
  }, [
    continueProjectId,
    continueCategory,
    continueDate,
    continueRequester,
    continueDescription,
    continueAmountRaw,
    focusProjectInput,
    projects,
    resetContinueDraft,
  ]);

  const removeContinueEntry = (entryId: string) => {
    setContinueEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  const continuePayload = useMemo(
    () =>
      JSON.stringify(
        continueEntries.map((entry) => ({
          id: entry.id,
          projectId: entry.projectId,
          projectName: entry.projectName,
          category: entry.category,
          expenseDate: entry.expenseDate,
          requesterName: entry.requesterName,
          description: entry.description,
          amount: entry.amountRaw,
        })),
      ),
    [continueEntries],
  );
  const isContinueSubmitDisabled = mode === CONTINUE_MODE && continueEntries.length === 0;
  const continueTotalAmount = useMemo(
    () => continueEntries.reduce((sum, e) => sum + Number(e.amountRaw), 0),
    [continueEntries],
  );
  const kmpDuplicateMessage = useMemo(() => {
    if (!kmpDuplicateInfo) {
      return "";
    }
    if (kmpDuplicateInfo.detectedAmount <= 0) {
      return `Material ${kmpDuplicateInfo.materialName} belum pernah diinput pada project ini.`;
    }
    if (kmpDuplicateInfo.minimumAmount > 0 && kmpDuplicateInfo.isFulfilled) {
      return `Material ${kmpDuplicateInfo.materialName} sudah pernah diinput pada project ini dan nominalnya sudah memenuhi minimal deteksi ${formatCurrency(kmpDuplicateInfo.minimumAmount)}.`;
    }
    if (kmpDuplicateInfo.minimumAmount > 0) {
      return `Material ${kmpDuplicateInfo.materialName} sudah pernah diinput, tetapi total nominal saat ini baru ${formatCurrency(kmpDuplicateInfo.detectedAmount)} dari minimal ${formatCurrency(kmpDuplicateInfo.minimumAmount)}.`;
    }
    return `Material ${kmpDuplicateInfo.materialName} sudah pernah diinput pada project ini dengan total ${formatCurrency(kmpDuplicateInfo.detectedAmount)}.`;
  }, [kmpDuplicateInfo]);
  const kmpDuplicateToneClass = kmpDuplicateInfo?.detectedAmount
    ? kmpDuplicateInfo.isFulfilled
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-blue-200 bg-blue-50 text-blue-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const hasActiveContinueDraft = hasContinueDraftContent({
    entries: continueEntries,
    projectId: continueProjectId,
    requesterName: continueRequester,
    description: continueDescription,
    amountRaw: continueAmountRaw,
  });
  const continueDraftSavedAtLabel = formatContinueDraftSavedAt(continueDraftSavedAt);

  return (
    <div
      ref={rootRef}
      className="space-y-3"
      onChange={markUserDraftInteraction}
      onClick={markUserDraftInteraction}
      onInput={markUserDraftInteraction}
    >
      <SuccessToast message={scraperSuccessMessage} />
      <EnterToNextField formId={formId} />
      <input type="hidden" name="expense_submission_token" value={submissionToken} />
      <input type="hidden" name="expense_input_mode" value={mode} />
      {mode === CONTINUE_MODE && (
        <input type="hidden" name="continue_rows_json" value={continuePayload} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">Draft akun otomatis</p>
          <p className="text-[11px] text-slate-500">
            Draft semua mode tersimpan di akun yang sama
            {formatContinueDraftSavedAt(expenseDraftSavedAt) ? `, terakhir ${formatContinueDraftSavedAt(expenseDraftSavedAt)}` : ""}.
            {expenseDraftNotice ? ` ${expenseDraftNotice}` : ""}
          </p>
        </div>
        {hasExpenseInputDraftContent(
          expenseDraftPayload,
          defaultExpenseCategory,
          today,
          initialProjectId ?? "",
        ) || expenseDraftSavedAt ? (
          <button
            type="button"
            data-ui-button="true"
            onClick={clearContinueDraft}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Hapus Draft
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-700">Mode input biaya</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            data-ui-button="true"
            onClick={() => setMode(STANDARD_MODE)}
            className={`inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold ${
              mode === STANDARD_MODE
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            Form Biasa
          </button>
          <button
            type="button"
            data-ui-button="true"
            onClick={() => setMode(HOK_MODE)}
            disabled={hokProjectPresets.length === 0}
            className={`inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold ${
              mode === HOK_MODE
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Mode HOK KMP Cianjur
          </button>
          <button
            type="button"
            data-ui-button="true"
            onClick={() => setMode(SCRAPER_MODE)}
            className={`inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold ${
              mode === SCRAPER_MODE
                ? "border-amber-700 bg-amber-700 text-white"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            Mode Input Scraper
          </button>
          <button
            type="button"
            data-ui-button="true"
            onClick={() => setMode(CONTINUE_MODE)}
            className={`inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold ${
              mode === CONTINUE_MODE
                ? "border-violet-700 bg-violet-700 text-white"
                : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
            }`}
          >
            Mode Continue
          </button>
        </div>
        {hokProjectPresets.length > 0 ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Mode HOK menyiapkan project klien KMP Cianjur dengan kategori <strong>Upah / Kasbon
            Tukang</strong> dan keterangan <strong>HOK</strong>.
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-amber-700">
            Belum ada project KMP Cianjur yang siap dipakai untuk mode HOK.
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          Mode scraper memakai <strong>nama pengajuan</strong>, <strong>tanggal</strong>,
          <strong> kategori</strong>, dan <strong>keterangan</strong> yang sama, lalu project dan
          nominal diisi manual per baris. Project yang sama boleh diinput lebih dari sekali.
        </p>
        <p className="mt-2 text-[11px] text-violet-700">
          <strong>Mode Continue:</strong> isi form berulang, data dikumpulkan dulu. Tekan{" "}
          <kbd className="rounded border border-violet-300 bg-violet-100 px-1 font-mono text-[10px]">Enter</kbd>{" "}
          di nominal untuk tambah entry. Simpan semua sekaligus di akhir.
        </p>
      </div>

      {mode === STANDARD_MODE ? (
        <>

          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            Field wajib
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
            <ProjectAutocomplete
              projects={projects}
              initialProjectId={standardProjectId}
              autoFocus
              inputRef={projectInputRef}
              onProjectIdChange={setStandardProjectId}
            />
            <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                Masukkan data yang sama ke project lain (opsional)
              </summary>
              <p className="mt-2 text-[11px] text-slate-500">
                Data akan disimpan ke project utama di atas, plus project tambahan yang Anda centang.
                Anda bisa filter berdasarkan klien lalu pilih semua project yang sedang tampil.
              </p>
              <ProjectChecklistSearch
                projects={projects}
                inputName="project_ids"
                selectedProjectIds={standardAdditionalProjectIds}
                onSelectedProjectIdsChange={setStandardAdditionalProjectIds}
              />
            </details>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Kategori</label>
              <select
                name="category"
                value={standardCategory}
                onChange={(event) => setStandardCategory(event.currentTarget.value)}
                required
              >
                {expenseCategories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal</label>
              <input
                type="date"
                name="expense_date"
                value={standardDate}
                onChange={(event) => setStandardDate(event.currentTarget.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Nama pengajuan
              </label>
              <RequesterProjectAutocompleteInput
                name="requester_name"
                placeholder="Contoh: Mandor Lapangan"
                required
                suggestions={requesterHistorySuggestions}
                projectClientNameById={projectClientNameById}
                currentProjectId={standardProjectId}
                value={standardRequester}
                onValueChange={setStandardRequester}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
            <ProjectScopedAutocompleteInput
              name="description"
              placeholder="Contoh: KAS / MATERIAL / OPERASIONAL"
              required
              suggestionsByProject={descriptionSuggestionsForProjects}
              projectClientNameById={projectClientNameById}
              currentProjectId={standardProjectId}
              value={standardDescription}
              onValueChange={setStandardDescription}
            />
            {isCheckingKmpDuplicate ? (
              <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                Memeriksa histori material KMP...
              </p>
            ) : kmpDuplicateMessage ? (
              <p className={`mt-2 rounded-xl border px-3 py-2 text-[11px] font-semibold ${kmpDuplicateToneClass}`}>
                {kmpDuplicateMessage}
              </p>
            ) : kmpDuplicateError ? (
              <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
                {kmpDuplicateError}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <input type="hidden" name="amount_mode" value="tambah" />
              <label className="mb-1 block text-xs font-medium text-slate-500">Mode transaksi</label>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Otomatis <strong>Tambah</strong>.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Nominal biaya total
              </label>
              <RupiahInput
                name="amount"
                value={standardAmountRaw}
                onValueChange={setStandardAmountRaw}
                required
                placeholder="Contoh: 1.000.000"
                submitOnEnter
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            Field opsional
          </div>
          <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
              Rincian Baru (opsional)
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Kategori baru (opsional)
                </label>
                <input
                  name="category_custom"
                  value={standardCategoryCustom}
                  onChange={(event) => setStandardCategoryCustom(event.currentTarget.value)}
                  placeholder="Isi jika ingin menambah kategori baru"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Penerima / vendor
                </label>
                <input
                  name="recipient_name"
                  value={standardRecipientName}
                  onChange={(event) => setStandardRecipientName(event.currentTarget.value)}
                  placeholder="Opsional"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Informasi penggunaan
                </label>
                <input
                  name="usage_info"
                  value={standardUsageInfo}
                  onChange={(event) => setStandardUsageInfo(event.currentTarget.value)}
                  placeholder="Contoh: OPS bensin lapangan"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Spesialis (preset)
                  </label>
                  <select
                    name="specialist_type"
                    value={standardSpecialistType}
                    onChange={(event) => setStandardSpecialistType(event.currentTarget.value)}
                  >
                    <option value="">Pilih jika kategori Upah Tim Spesialis</option>
                    {SPECIALIST_COST_PRESETS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Spesialis (custom)
                  </label>
                  <input
                    name="specialist_type_custom"
                    value={standardSpecialistTypeCustom}
                    onChange={(event) => setStandardSpecialistTypeCustom(event.currentTarget.value)}
                    placeholder="Contoh: Plumbing, Finishing, Mekanikal"
                  />
                </div>
              </div>
            </div>
          </details>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Qty</label>
              <input
                type="number"
                min={0}
                step={1}
                name="quantity"
                value={standardQuantity}
                onChange={(event) => setStandardQuantity(normalizeDigits(event.currentTarget.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Satuan</label>
              <input
                name="unit_label"
                value={standardUnitLabel}
                onChange={(event) => setStandardUnitLabel(event.currentTarget.value)}
                placeholder="PCS / LTR / BH"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Harga satuan
              </label>
              <RupiahInput
                name="unit_price"
                value={standardUnitPriceRaw}
                onValueChange={setStandardUnitPriceRaw}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Catatan mode
            </label>
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Mode transaksi untuk form ini otomatis <strong>Tambah</strong>.
            </p>
          </div>
        </>
      ) : mode === CONTINUE_MODE ? (
        <>
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">
            Mode Continue aktif. Isi field di bawah, tekan{" "}
            <kbd className="rounded border border-violet-300 bg-violet-100 px-1 font-mono text-[10px]">Enter</kbd>{" "}
            di nominal atau klik <strong>Tambah Entry</strong>. Setelah semua selesai, klik{" "}
            <strong>Simpan Semua</strong>.
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-slate-700">Draft otomatis aktif</p>
              <p className="text-[11px] text-slate-500">
                Data mode continue disimpan ke draft akun
                {continueDraftSavedAtLabel ? `, terakhir ${continueDraftSavedAtLabel}` : ""}.
                {continueDraftNotice ? ` ${continueDraftNotice}` : ""}
              </p>
            </div>
            {(hasActiveContinueDraft || continueDraftSavedAt) && (
              <button
                type="button"
                data-ui-button="true"
                onClick={clearContinueDraft}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Hapus Draft
              </button>
            )}
          </div>

          {/* Form input continue */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
              <ProjectAutocomplete
                projects={projects}
                initialProjectId={continueProjectId}
                inputRef={projectInputRef}
                onProjectIdChange={setContinueProjectId}
                hiddenInputName={null}
                required={false}
                resetSignal={continueProjectResetSignal}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Kategori</label>
                <select
                  value={continueCategory}
                  onChange={(e) => setContinueCategory(e.currentTarget.value)}
                >
                  {expenseCategories.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal</label>
                <input
                  type="date"
                  value={continueDate}
                  onChange={(e) => setContinueDate(e.currentTarget.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Nama pengajuan</label>
                <RequesterProjectAutocompleteInput
                  name="continue_requester_name_preview"
                  placeholder="Contoh: Mandor Lapangan"
                  suggestions={requesterHistorySuggestions}
                  projectClientNameById={projectClientNameById}
                  currentProjectId={continueProjectId}
                  value={continueRequester}
                  onValueChange={setContinueRequester}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
                <ProjectScopedAutocompleteInput
                  name="continue_description_preview"
                  placeholder="Contoh: Material / Operasional"
                  suggestionsByProject={descriptionSuggestionsForProjects}
                  projectClientNameById={projectClientNameById}
                  currentProjectId={continueProjectId}
                  value={continueDescription}
                  onValueChange={setContinueDescription}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Nominal biaya total</label>
              <div className="flex gap-2">
                <div className="flex flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-violet-700 focus-within:shadow-[0_0_0_3px_rgba(109,40,217,0.14)]">
                  <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={continueAmountRaw ? formatThousands(continueAmountRaw) : ""}
                    onChange={(e) => setContinueAmountRaw(normalizeDigits(e.currentTarget.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleContinueAdd();
                      }
                    }}
                    placeholder="Contoh: 1.000.000"
                    className="!rounded-none !border-0 !shadow-none focus:!border-0 focus:!shadow-none w-full"
                  />
                </div>
                <button
                  type="button"
                  data-ui-button="true"
                  onClick={handleContinueAdd}
                  className="inline-flex items-center justify-center rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 whitespace-nowrap"
                >
                  + Tambah Entry
                </button>
              </div>
            </div>

            {continueError && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {continueError}
              </p>
            )}
          </div>

          {/* Daftar entry yang sudah ditambahkan */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-700">
                Daftar Entry ({continueEntries.length})
              </p>
              {continueEntries.length > 0 && (
                <p className="text-xs font-semibold text-violet-700">
                  Total: Rp {formatThousands(String(continueTotalAmount))}
                </p>
              )}
            </div>
            {continueEntries.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">
                Belum ada entry. Isi form di atas lalu tekan Tambah Entry.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {continueEntries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 truncate">{entry.projectName}</p>
                      <p className="text-[11px] text-slate-500">
                        {entry.requesterName} - {entry.description} - {entry.expenseDate}
                      </p>
                    </div>
                    <p className="text-xs font-bold text-emerald-700 whitespace-nowrap">
                      Rp {formatThousands(entry.amountRaw)}
                    </p>
                    <button
                      type="button"
                      data-ui-button="true"
                      onClick={() => removeContinueEntry(entry.id)}
                      className="text-[10px] font-semibold text-rose-500 hover:text-rose-700 whitespace-nowrap mt-0.5"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : mode === SCRAPER_MODE ? (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            Mode scraper aktif. Nama pengajuan, tanggal, kategori, dan keterangan akan sama untuk
            semua baris yang Anda input.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Kategori</label>
              <select
                name="category"
                value={scraperCategory}
                onChange={(event) => setScraperCategory(event.currentTarget.value)}
                required
              >
                {expenseCategories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal</label>
              <input
                type="date"
                name="expense_date"
                value={scraperDate}
                onChange={(event) => setScraperDate(event.currentTarget.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Nama pengajuan
              </label>
              <input
                ref={scraperRequesterInputRef}
                name="requester_name"
                value={scraperRequester}
                onChange={(event) => setScraperRequester(event.currentTarget.value)}
                placeholder="Contoh: Admin Scraper"
                required
                onKeyDown={handleScraperRequesterEnter}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
              <input
                ref={scraperDescriptionInputRef}
                name="description"
                value={scraperDescription}
                onChange={(event) => setScraperDescription(event.currentTarget.value)}
                placeholder="Contoh: Hasil input scraper"
                required
                onKeyDown={handleScraperDescriptionEnter}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-700">Daftar project mode scraper</p>
                <p className="text-[11px] text-slate-500">
                  Tekan Enter dari project untuk pindah ke nominal. Enter di nominal akan
                  menambah baris berikutnya dan fokus ke project baru.
                </p>
              </div>
              <button
                type="button"
                data-ui-button="true"
                className="button-soft button-xs"
                onClick={() => appendScraperRow("project")}
              >
                Tambah Baris
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {scraperRows.map((row, index) => {
                const amountDisplay = row.amountRaw ? formatThousands(row.amountRaw) : "";
                return (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(0,1.5fr)_180px_auto]"
                  >
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Project #{index + 1}
                      </label>
                      <ProjectAutocomplete
                        projects={projects}
                        initialProjectId={row.projectId}
                        inputRef={(node) => registerScraperProjectInputRef(row.id, node)}
                        onProjectIdChange={(projectId) => updateScraperRow(row.id, { projectId })}
                        hiddenInputName={null}
                        placeholder="Ketik nama / kode / klien project..."
                        required={false}
                        enterTargetFieldName={null}
                        showStatusText={false}
                      />
                      {row.projectId ? (
                        <p className="mt-1 text-[11px] font-medium text-emerald-700">
                          {projects.find((project) => project.id === row.projectId)?.clientName ?? "Tanpa klien"}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Pilih project lalu tekan Enter untuk lanjut ke nominal.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Nominal</label>
                      <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-amber-700 focus-within:shadow-[0_0_0_3px_rgba(217,119,6,0.14)]">
                        <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                          Rp
                        </span>
                        <input
                          ref={(node) => registerScraperAmountInputRef(row.id, node)}
                          type="text"
                          inputMode="numeric"
                          value={amountDisplay}
                          onChange={(event) =>
                            updateScraperRow(row.id, {
                              amountRaw: normalizeDigits(event.currentTarget.value),
                            })
                          }
                          onKeyDown={(event) => handleScraperAmountEnter(event, row)}
                          placeholder="Masukkan nominal"
                          className="w-full !rounded-none !border-0 !shadow-none focus:!border-0 focus:!shadow-none"
                        />
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        data-ui-button="true"
                        onClick={() => removeScraperRow(row.id)}
                        className="inline-flex w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Hapus Baris
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {completedScraperRows.length} data siap disimpan
              </p>
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {scraperRowsInvalid.length} baris perlu dicek
              </p>
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                Total baris: {scraperRows.length}
              </p>
            </div>
          </div>

          <input type="hidden" name="scraper_rows_json" value={scraperPayload} />
          {scraperError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {scraperError}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            Mode HOK aktif. Tanggal sama untuk semua project, kategori otomatis Upah / Kasbon Tukang,
            keterangan tetap HOK, dan nama pengajuan bisa diedit per project.
          </div>
          <div className="grid gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal HOK</label>
              <input
                type="date"
                name="expense_date"
                value={hokDate}
                onChange={(event) => setHokDate(event.currentTarget.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Kategori</label>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Upah / Kasbon Tukang
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                HOK
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">Import cepat dari Excel</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Dukungan format paling umum: <strong>Project | Nama Pengajuan | Nominal</strong> atau{" "}
                  <strong>Project | Nominal</strong>. Jika kolom nama pengajuan tidak ada, sistem
                  akan memakai nilai yang sudah tersimpan di daftar HOK.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={hokExcelInputRef}
                  type="file"
                  accept={HOK_EXCEL_ACCEPT}
                  className="sr-only"
                  onChange={handleHokExcelFileChange}
                />
                <button
                  type="button"
                  data-ui-button="true"
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => hokExcelInputRef.current?.click()}
                  disabled={isHokFileImporting}
                >
                  <span className="btn-icon bg-emerald-100 text-emerald-700">
                    <ExcelIcon />
                  </span>
                  {isHokFileImporting ? "Membaca File..." : "Import File Excel"}
                </button>
                <button
                  type="button"
                  data-ui-button="true"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleReadHokClipboard}
                  disabled={isReadingHokClipboard}
                >
                  <span className="btn-icon bg-slate-100 text-slate-700">
                    <ClipboardIcon />
                  </span>
                  {isReadingHokClipboard ? "Membaca Clipboard..." : "Baca Clipboard"}
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Paste data copy dari Excel
                </label>
                <textarea
                  value={hokPasteText}
                  onChange={(event) => setHokPasteText(event.currentTarget.value)}
                  onPaste={handleHokPasteAreaPaste}
                  rows={5}
                  placeholder={"Paste di sini, misalnya:\nProject Alpha\tMandor A\t1500000"}
                  className="min-h-[132px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-700 focus:shadow-[0_0_0_3px_rgba(5,150,105,0.14)]"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-ui-button="true"
                    className="button-soft button-xs"
                    onClick={() => applyHokClipboardImport(hokPasteText, "paste manual")}
                  >
                    Proses Data Paste
                  </button>
                  <button
                    type="button"
                    data-ui-button="true"
                    className="button-soft button-xs"
                    onClick={() => setHokPasteText("")}
                  >
                    Bersihkan Paste
                  </button>
                </div>
              </div>

            </div>

            {hokImportFeedback ? (
              <div
                className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                  hokImportFeedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : hokImportFeedback.tone === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                <p className="font-semibold">{hokImportFeedback.title}</p>
                {hokImportFeedback.details.length > 0 ? (
                  <div className="mt-1 space-y-1">
                    {hokImportFeedback.details.map((detail) => (
                      <p key={detail}>{detail}</p>
                    ))}
                  </div>
                ) : null}

                {(hokImportFeedback.issues?.unmatchedRows && hokImportFeedback.issues.unmatchedRows.length > 0) ? (
                  <details className="mt-2 group">
                    <summary className="cursor-pointer font-semibold opacity-80 hover:opacity-100 flex items-center gap-1">
                      <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Daftar Project Tidak Dikenali ({hokImportFeedback.issues.unmatchedRows.length})
                    </summary>
                    <ul className="mt-1 ml-6 list-disc space-y-0.5 opacity-90 max-h-40 overflow-y-auto pr-2">
                      {hokImportFeedback.issues.unmatchedRows.map((r, idx) => (
                        <li key={idx}>Baris {r.rowNumber}: &quot;{r.sourceProjectName || "Tanpa Nama"}&quot;</li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {(hokImportFeedback.issues?.invalidRows && hokImportFeedback.issues.invalidRows.length > 0) ? (
                  <details className="mt-2 group">
                    <summary className="cursor-pointer font-semibold opacity-80 hover:opacity-100 flex items-center gap-1">
                      <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Daftar Baris Tidak Valid ({hokImportFeedback.issues.invalidRows.length})
                    </summary>
                    <ul className="mt-1 ml-6 list-disc space-y-0.5 opacity-90 max-h-40 overflow-y-auto pr-2">
                      {hokImportFeedback.issues.invalidRows.map((r, idx) => (
                        <li key={idx}>Baris {r.rowNumber}: &quot;{r.sourceProjectName || "Tanpa Nama"}&quot; - {r.reason === "missing_project" ? "Project kosong" : "Nominal kosong/tidak valid"}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {(hokImportFeedback.issues?.duplicateRows && hokImportFeedback.issues.duplicateRows.length > 0) ? (
                  <details className="mt-2 group">
                    <summary className="cursor-pointer font-semibold opacity-80 hover:opacity-100 flex items-center gap-1">
                      <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Daftar Duplikasi Project ({hokImportFeedback.issues.duplicateRows.length})
                    </summary>
                    <ul className="mt-1 ml-6 list-disc space-y-0.5 opacity-90 max-h-40 overflow-y-auto pr-2">
                      {hokImportFeedback.issues.duplicateRows.map((r, idx) => (
                        <li key={idx}>Baris {r.rowNumber}: &quot;{r.sourceProjectName}&quot; (Project ditimpa nominal baru)</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-700">Daftar project HOK KMP Cianjur</p>
                <p className="text-[11px] text-slate-500">
                  Centang project yang ikut HOK, edit nama pengajuan bila perlu, lalu isi nominal
                  total masing-masing project.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-ui-button="true"
                  className="button-soft button-xs"
                  onClick={() => toggleAllVisibleHokRows(true)}
                >
                  Pilih Semua Tampil
                </button>
                <button
                  type="button"
                  data-ui-button="true"
                  className="button-soft button-xs"
                  onClick={() => toggleAllVisibleHokRows(false)}
                >
                  Lepas Semua Tampil
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
              <input
                type="text"
                value={hokQuery}
                onChange={(event) => setHokQuery(event.currentTarget.value)}
                placeholder="Cari project / nama pengajuan HOK..."
                autoComplete="off"
              />
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {selectedHokRows.length} project terpilih
              </p>
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {hokRowsMissingAmount.length} nominal belum diisi
              </p>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {hokRowsMissingRequester.length} nama pengajuan kosong
              </p>
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {visibleHokRows.length} project tampil
              </p>
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                Total terpilih: Rp {formatThousands(String(selectedHokTotalAmount))}
              </p>
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                Default client: KMP Cianjur
              </p>
            </div>

            <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <div className="grid grid-cols-[24px_minmax(120px,1.2fr)_minmax(120px,1fr)_180px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <span></span>
                <span>Project</span>
                <span>Nama Pengajuan</span>
                <span>Nominal HOK</span>
              </div>
              <div className="divide-y divide-slate-100">
                {visibleHokRows.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-slate-500">Project tidak ditemukan.</div>
                ) : (
                  visibleHokRows.map((row) => {
                    const amountDisplay = row.amountRaw ? formatThousands(row.amountRaw) : "";
                    return (
                      <div
                        key={row.projectId}
                        className={`grid grid-cols-[24px_minmax(120px,1.2fr)_minmax(120px,1fr)_180px] items-start gap-3 px-3 py-3 ${
                          row.selected ? "bg-white" : "bg-slate-50/70"
                        }`}
                      >
                        <label className="mt-1 inline-flex items-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(event) =>
                              updateHokRow(row.projectId, { selected: event.currentTarget.checked })
                            }
                          />
                        </label>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{row.projectName}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {row.clientName ?? "Tanpa klien"}
                          </p>
                        </div>
                        <div>
                          {!row.isRequesterEditable ? (
                            <div className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 min-h-[34px]">
                              <span className="text-xs font-semibold text-slate-800 truncate mr-2" title={row.requesterName || row.defaultRequesterName || "Nama pengajuan kosong"}>
                                {row.requesterName || row.defaultRequesterName || "-"}
                              </span>
                              <button
                                type="button"
                                data-ui-button="true"
                                onClick={() => updateHokRow(row.projectId, { isRequesterEditable: true })}
                                className="flex-shrink-0 text-slate-400 hover:text-emerald-700 transition"
                                title="Edit nama pengajuan"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M2.695 14.763l-1.262 3.152a.5.5 0 00.65.65l3.152-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={row.requesterName}
                              onChange={(event) =>
                                updateHokRow(row.projectId, { requesterName: event.currentTarget.value })
                              }
                              onBlur={() => {
                                updateHokRow(row.projectId, { 
                                  requesterName: row.requesterName.trim() || row.defaultRequesterName,
                                  isRequesterEditable: false 
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  updateHokRow(row.projectId, { 
                                    requesterName: row.requesterName.trim() || row.defaultRequesterName,
                                    isRequesterEditable: false 
                                  });
                                }
                              }}
                              autoFocus
                              placeholder="Isi nama pengajuan"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none transition focus:border-emerald-700 focus:shadow-[0_0_0_3px_rgba(5,150,105,0.14)]"
                            />
                          )}
                          <p className="mt-1 text-[11px] text-slate-500">
                            Default: {row.defaultRequesterName} | {getRequesterSourceLabel(row.requesterSource)}
                          </p>
                        </div>
                        <div>
                          <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-emerald-700 focus-within:shadow-[0_0_0_3px_rgba(5,150,105,0.14)]">
                            <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                              Rp
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={amountDisplay}
                              disabled={!row.selected}
                              onChange={(event) =>
                                updateHokRow(row.projectId, {
                                  amountRaw: normalizeDigits(event.currentTarget.value),
                                })
                              }
                              placeholder={row.selected ? "Masukkan nominal" : "Project tidak dipilih"}
                              className="w-full !rounded-none !border-0 !shadow-none focus:!border-0 focus:!shadow-none disabled:cursor-not-allowed disabled:bg-slate-100"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <input type="hidden" name="hok_rows_json" value={hokPayload} />
          {hokError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {hokError}
            </p>
          ) : null}
        </>
      )}

      <ExpenseSubmitButton
        disabled={isHokSubmitDisabled || isScraperSubmitDisabled || isContinueSubmitDisabled}
        mode={mode}
        selectedHokRowCount={selectedHokRows.length}
        selectedScraperRowCount={completedScraperRows.length}
        continueEntryCount={continueEntries.length}
        isScraperSaving={isScraperSaving}
        onScraperSave={saveScraperExpense}
      />
    </div>
  );
}
