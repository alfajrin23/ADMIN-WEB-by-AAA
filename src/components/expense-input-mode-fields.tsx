"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { EnterToNextField } from "@/components/enter-to-next-field";
import { ProjectAutocomplete } from "@/components/project-autocomplete";
import { ProjectChecklistSearch } from "@/components/project-checklist-search";
import { ProjectScopedAutocompleteInput } from "@/components/project-scoped-autocomplete-input";
import { RequesterProjectAutocompleteInput } from "@/components/requester-project-autocomplete-input";
import { RupiahInput } from "@/components/rupiah-input";
import { SaveIcon } from "@/components/icons";
import { SPECIALIST_COST_PRESETS } from "@/lib/constants";

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
  amountRaw: string;
  selected: boolean;
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

const STANDARD_MODE = "standard";
const HOK_MODE = "hok_kmp_cianjur";
const SCRAPER_MODE = "scraper";
const CONTINUE_MODE = "continue";
const EXPENSE_PROJECT_REFOCUS_KEY = "expense-modal-refocus-project";
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
    amountRaw: "",
    selected: row.defaultSelected,
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

function buildProjectOptionLabel(project: ProjectOption) {
  const segments = [project.name];
  if (project.code?.trim()) {
    segments.push(project.code.trim());
  }
  if (project.clientName?.trim()) {
    segments.push(project.clientName.trim());
  }
  return segments.join(" | ");
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

function ExpenseSubmitButton({
  disabled,
  mode,
  selectedHokRowCount,
  selectedScraperRowCount,
  continueEntryCount,
}: {
  disabled: boolean;
  mode: ExpenseInputMode;
  selectedHokRowCount: number;
  selectedScraperRowCount: number;
  continueEntryCount: number;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={pending}
    >
      <span className="btn-icon icon-float-soft bg-white/20 text-white">
        <SaveIcon />
      </span>
      {pending
        ? "Menyimpan..."
        : mode === HOK_MODE
          ? `Simpan HOK ${selectedHokRowCount > 0 ? `(${selectedHokRowCount} project)` : ""}`
          : mode === SCRAPER_MODE
            ? `Simpan Scraper ${selectedScraperRowCount > 0 ? `(${selectedScraperRowCount} project)` : ""}`
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
  const rootRef = useRef<HTMLDivElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [submissionToken] = useState(createExpenseSubmissionToken);
  const [mode, setMode] = useState<ExpenseInputMode>(STANDARD_MODE);
  const [hokQuery, setHokQuery] = useState("");
  const [hokRows, setHokRows] = useState<HokProjectRow[]>(() => createInitialHokRows(hokProjectPresets));
  const [hokError, setHokError] = useState("");
  const [scraperRows, setScraperRows] = useState<ScraperRow[]>(() =>
    createInitialScraperRows(initialProjectId),
  );
  const [scraperError, setScraperError] = useState("");

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

  useEffect(() => {
    setHokRows(createInitialHokRows(hokProjectPresets));
  }, [hokProjectPresets]);

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

  const resetContinueDraft = useCallback(() => {
    setContinueProjectId("");
    setContinueCategory(defaultExpenseCategory);
    setContinueDate(today);
    setContinueRequester("");
    setContinueDescription("");
    setContinueAmountRaw("");
    setContinueProjectResetSignal((prev) => prev + 1);
  }, [defaultExpenseCategory, today]);

  const validateHokRows = useCallback(() => {
    const selectedRows = hokRows.filter((row) => row.selected);
    if (selectedRows.length === 0) {
      return "Pilih minimal satu project HOK yang ingin disimpan.";
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

    const duplicateProjectIds = Array.from(
      activeRows.reduce((duplicates, row, index) => {
        if (activeRows.findIndex((item) => item.projectId === row.projectId) !== index) {
          duplicates.add(row.projectId);
        }
        return duplicates;
      }, new Set<string>()),
    );
    if (duplicateProjectIds.length > 0) {
      return "Project scraper tidak boleh dipilih lebih dari satu kali.";
    }

    return "";
  }, [scraperRows]);

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
        window.sessionStorage.setItem(EXPENSE_PROJECT_REFOCUS_KEY, "1");
        return;
      }

      const validationMessage =
        mode === HOK_MODE ? validateHokRows() : mode === SCRAPER_MODE ? validateScraperRows() : "";
      if (!validationMessage) {
        setHokError("");
        setScraperError("");
        setContinueError("");
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
  }, [continueEntries.length, mode, validateHokRows, validateScraperRows]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const successMessage = url.searchParams.get("success")?.trim() ?? "";
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
  }, [focusProjectInput]);

  const normalizedHokQuery = normalizeText(hokQuery);
  const visibleHokRows = useMemo(() => {
    if (!normalizedHokQuery) {
      return hokRows;
    }

    return hokRows.filter((row) =>
      normalizeText([row.projectName, row.requesterName, row.clientName].join(" ")).includes(
        normalizedHokQuery,
      ),
    );
  }, [hokRows, normalizedHokQuery]);

  const selectedHokRows = useMemo(() => hokRows.filter((row) => row.selected), [hokRows]);
  const hokRowsMissingAmount = useMemo(
    () =>
      selectedHokRows.filter((row) => {
        const amount = Number(normalizeDigits(row.amountRaw));
        return !Number.isFinite(amount) || amount <= 0;
      }),
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
    (selectedHokRows.length === 0 || hokRowsMissingAmount.length > 0 || hokProjectPresets.length === 0);
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
  const scraperHasDuplicateProjects = useMemo(() => {
    return activeScraperRows.some(
      (row, index) => activeScraperRows.findIndex((item) => item.projectId === row.projectId) !== index,
    );
  }, [activeScraperRows]);
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
    mode === SCRAPER_MODE &&
    (completedScraperRows.length === 0 || scraperRowsInvalid.length > 0 || scraperHasDuplicateProjects);

  const updateHokRow = (projectId: string, patch: Partial<Pick<HokProjectRow, "selected" | "amountRaw">>) => {
    setHokRows((prev) =>
      prev.map((row) => (row.projectId === projectId ? { ...row, ...patch } : row)),
    );
  };

  const updateScraperRow = (rowId: string, patch: Partial<Pick<ScraperRow, "projectId" | "amountRaw">>) => {
    setScraperRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const appendScraperRow = () => {
    setScraperRows((prev) => [...prev, createScraperRow()]);
  };

  const removeScraperRow = (rowId: string) => {
    setScraperRows((prev) => {
      if (prev.length <= 1) {
        return [createScraperRow()];
      }
      return prev.filter((row) => row.id !== rowId);
    });
  };

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
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `ce-${Date.now()}-${Math.random().toString(16).slice(2)}`,
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

  return (
    <div ref={rootRef} className="space-y-3">
      <EnterToNextField formId={formId} />
      <input type="hidden" name="expense_submission_token" value={submissionToken} />
      <input type="hidden" name="expense_input_mode" value={mode} />
      {mode === CONTINUE_MODE && (
        <input type="hidden" name="continue_rows_json" value={continuePayload} />
      )}

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
          nominal diisi manual per baris.
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
              initialProjectId={initialProjectId}
              autoFocus
              inputRef={projectInputRef}
            />
            <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                Masukkan data yang sama ke project lain (opsional)
              </summary>
              <p className="mt-2 text-[11px] text-slate-500">
                Data akan disimpan ke project utama di atas, plus project tambahan yang Anda centang.
              </p>
              <ProjectChecklistSearch projects={projects} inputName="project_ids" />
            </details>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Kategori</label>
              <select name="category" defaultValue={defaultExpenseCategory} required>
                {expenseCategories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal</label>
              <input type="date" name="expense_date" defaultValue={today} required />
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
            />
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
                  placeholder="Isi jika ingin menambah kategori baru"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Penerima / vendor
                </label>
                <input name="recipient_name" placeholder="Opsional" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Informasi penggunaan
                </label>
                <input name="usage_info" placeholder="Contoh: OPS bensin lapangan" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Spesialis (preset)
                  </label>
                  <select name="specialist_type" defaultValue="">
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
                    placeholder="Contoh: Plumbing, Finishing, Mekanikal"
                  />
                </div>
              </div>
            </div>
          </details>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Qty</label>
              <input type="number" min={0} step={1} name="quantity" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Satuan</label>
              <input name="unit_label" placeholder="PCS / LTR / BH" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Harga satuan
              </label>
              <RupiahInput name="unit_price" placeholder="0" />
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

          {/* Form input continue */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
              <ProjectAutocomplete
                projects={projects}
                initialProjectId={initialProjectId}
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
              <select name="category" defaultValue={defaultExpenseCategory} required>
                {expenseCategories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal</label>
              <input type="date" name="expense_date" defaultValue={today} required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Nama pengajuan
              </label>
              <input name="requester_name" placeholder="Contoh: Admin Scraper" required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
              <input name="description" placeholder="Contoh: Hasil input scraper" required />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-700">Daftar project mode scraper</p>
                <p className="text-[11px] text-slate-500">
                  Isi project dan nominal per baris. Satu project hanya boleh muncul sekali.
                </p>
              </div>
              <button
                type="button"
                data-ui-button="true"
                className="button-soft button-xs"
                onClick={appendScraperRow}
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
                      <select
                        value={row.projectId}
                        onChange={(event) =>
                          updateScraperRow(row.id, { projectId: event.currentTarget.value })
                        }
                      >
                        <option value="">Pilih project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {buildProjectOptionLabel(project)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Nominal</label>
                      <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-amber-700 focus-within:shadow-[0_0_0_3px_rgba(217,119,6,0.14)]">
                        <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                          Rp
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={amountDisplay}
                          onChange={(event) =>
                            updateScraperRow(row.id, {
                              amountRaw: normalizeDigits(event.currentTarget.value),
                            })
                          }
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
                {completedScraperRows.length} project siap disimpan
              </p>
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {scraperRowsInvalid.length} baris perlu dicek
              </p>
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                Total baris: {scraperRows.length}
              </p>
            </div>
            {scraperHasDuplicateProjects ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Ada project yang dipilih lebih dari satu kali. Sisakan satu baris per project.
              </p>
            ) : null}
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
            dan keterangan otomatis HOK.
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal HOK</label>
              <input type="date" name="expense_date" defaultValue={today} required />
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-700">Daftar project HOK KMP Cianjur</p>
                <p className="text-[11px] text-slate-500">
                  Centang project yang ikut HOK, lalu isi nominal total masing-masing project.
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

            <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <div className="grid min-w-[760px] grid-cols-[auto_minmax(220px,1.3fr)_minmax(220px,1fr)_180px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <span>Pilih</span>
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
                        className={`grid min-w-[760px] grid-cols-[auto_minmax(220px,1.3fr)_minmax(220px,1fr)_180px] items-start gap-3 px-3 py-3 ${
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
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{row.requesterName}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {getRequesterSourceLabel(row.requesterSource)}
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
      />
    </div>
  );
}
