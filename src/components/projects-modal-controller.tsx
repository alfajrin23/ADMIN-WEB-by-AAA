"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createExpenseAction,
  getExpenseCreateModalDataAction,
  getExpenseDetailSearchModalDataAction,
  getKmpMaterialReportModalDataAction,
} from "@/app/actions/expense.action";
import { importExcelTemplateAction } from "@/app/actions/import.action";
import { createProjectAction } from "@/app/actions/project.action";
import { ExcelDropInput } from "@/components/excel-drop-input";
import { ExpenseDetailSearchResults } from "@/components/expense-detail-search-results";
import { ExpenseInputModeFields } from "@/components/expense-input-mode-fields";
import { CloseIcon, ImportIcon, SaveIcon, SearchIcon } from "@/components/icons";
import { KmpMaterialMonitorPanel } from "@/components/kmp-material-monitor-panel";
import { MutationSubmitButton } from "@/components/mutation-submit-button";
import {
  OptimisticExpenseCreateForm,
  OptimisticProjectCreateForm,
} from "@/components/optimistic-create-forms";
import { COST_CATEGORIES, mergeExpenseCategoryOptions, PROJECT_STATUSES } from "@/lib/constants";
import { KMP_CIANJUR_MATERIAL_CHECKLIST } from "@/lib/kmp-materials";
import type { Project } from "@/lib/types";

type ModalType =
  | "project-new"
  | "expense-new"
  | "excel-import"
  | "detail-search"
  | "kmp-material-check";
type ProjectView = "list" | "rekap";

type ProjectsModalControllerProps = {
  initialModal: ModalType | null;
  projects: Project[];
  canEdit: boolean;
  activeDataSource: string;
  storageLabel: string;
  closeModalHref: string;
  openExpenseModalHref: string;
  expenseModalErrorReturnHref: string;
  openKmpMaterialReportHref: string;
  detailSearchReturnHref: string;
  currentProjectQueryId?: string;
  searchText: string;
  detailSearchQuery: string;
  detailDateFrom: string;
  detailDateTo: string;
  detailYear: number | null;
  hasDetailSearchCriteria: boolean;
  today: string;
  expenseActionToken: string;
  success: string;
  error: string;
};

type ExpenseCreateModalData = Awaited<ReturnType<typeof getExpenseCreateModalDataAction>>;
type DetailSearchModalData = Awaited<ReturnType<typeof getExpenseDetailSearchModalDataAction>>;
type KmpMaterialReport = Awaited<ReturnType<typeof getKmpMaterialReportModalDataAction>>;

type DetailSearchState = {
  query: string;
  from: string;
  to: string;
  year: number | null;
  hasCriteria: boolean;
};

const EVENT_NAME = "admin-web:open-project-modal";

function createProjectsHref(params: {
  projectId?: string;
  searchText?: string;
  view?: ProjectView;
}) {
  const query = new URLSearchParams();
  if (params.projectId) {
    query.set("project", params.projectId);
  }
  const trimmedSearch = params.searchText?.trim();
  if (trimmedSearch) {
    query.set("q", trimmedSearch);
  }
  if (params.view) {
    query.set("view", params.view);
  }
  const queryText = query.toString();
  return queryText ? `/projects?${queryText}` : "/projects";
}

function parseModalFromHref(href: string): ModalType | null {
  const url = new URL(href, window.location.origin);
  const modal = url.searchParams.get("modal");
  return modal === "project-new" ||
    modal === "expense-new" ||
    modal === "excel-import" ||
    modal === "detail-search" ||
    modal === "kmp-material-check"
    ? modal
    : null;
}

function buildDetailStateFromUrl(href: string, fallback: DetailSearchState): DetailSearchState {
  const url = new URL(href, window.location.origin);
  const yearRaw = url.searchParams.get("detail_year") ?? "";
  const parsedYear = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
  return {
    query: url.searchParams.get("detail_q")?.trim() ?? fallback.query,
    from: /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("detail_from") ?? "")
      ? url.searchParams.get("detail_from") ?? ""
      : fallback.from,
    to: /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("detail_to") ?? "")
      ? url.searchParams.get("detail_to") ?? ""
      : fallback.to,
    year: parsedYear,
    hasCriteria: Boolean(
      url.searchParams.get("detail_q")?.trim() ||
        url.searchParams.get("detail_from") ||
        url.searchParams.get("detail_to") ||
        parsedYear,
    ),
  };
}

function hasDetailCriteria(state: DetailSearchState) {
  return Boolean(state.query.trim() || state.from || state.to || state.year);
}

function ModalDataError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
      <p className="font-semibold">{message}</p>
      <button
        type="button"
        data-ui-button="true"
        onClick={onRetry}
        className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
      >
        Muat Ulang Data
      </button>
    </div>
  );
}

function KmpMaterialQuickPreview() {
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold text-amber-900">Master material KMP Cianjur</p>
        <p className="mt-1 text-xs text-amber-800">
          Daftar material tampil dulu. Status nominal per project sedang dihitung di background.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {KMP_CIANJUR_MATERIAL_CHECKLIST.map((item) => (
          <span
            key={item.key}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProjectsModalController({
  initialModal,
  projects,
  canEdit,
  activeDataSource,
  storageLabel,
  closeModalHref,
  openExpenseModalHref,
  expenseModalErrorReturnHref,
  openKmpMaterialReportHref,
  detailSearchReturnHref,
  currentProjectQueryId,
  searchText,
  detailSearchQuery,
  detailDateFrom,
  detailDateTo,
  detailYear,
  hasDetailSearchCriteria,
  today,
  expenseActionToken,
  success,
  error,
}: ProjectsModalControllerProps) {
  const initialDetailState = useMemo<DetailSearchState>(
    () => ({
      query: detailSearchQuery,
      from: detailDateFrom,
      to: detailDateTo,
      year: detailYear,
      hasCriteria: hasDetailSearchCriteria,
    }),
    [detailDateFrom, detailDateTo, detailSearchQuery, detailYear, hasDetailSearchCriteria],
  );
  const [activeModal, setActiveModal] = useState<ModalType | null>(initialModal);
  const [detailState, setDetailState] = useState<DetailSearchState>(initialDetailState);
  const [detailDraft, setDetailDraft] = useState<DetailSearchState>(initialDetailState);
  const [expenseData, setExpenseData] = useState<ExpenseCreateModalData | null>(null);
  const [expenseError, setExpenseError] = useState("");
  const [isExpenseLoading, setIsExpenseLoading] = useState(false);
  const [detailDataCache, setDetailDataCache] = useState<Record<string, DetailSearchModalData>>({});
  const [detailError, setDetailError] = useState("");
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [kmpReport, setKmpReport] = useState<KmpMaterialReport | null>(null);
  const [kmpError, setKmpError] = useState("");
  const [isKmpLoading, setIsKmpLoading] = useState(false);
  const expenseRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const kmpRequestRef = useRef(0);
  const detailDebounceRef = useRef<number | null>(null);

  const openModal = useCallback((modal: ModalType, href?: string) => {
    setActiveModal(modal);
    if (modal === "detail-search" && href) {
      const next = buildDetailStateFromUrl(href, detailDraft);
      setDetailDraft(next);
      setDetailState(next);
    }
  }, [detailDraft]);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    window.history.pushState({}, "", closeModalHref);
  }, [closeModalHref]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      if (!href) {
        return;
      }
      const modal = parseModalFromHref(href);
      if (modal) {
        openModal(modal, href);
      }
    };

    const handlePopState = () => {
      const modal = parseModalFromHref(window.location.href);
      setActiveModal(modal);
      if (modal === "detail-search") {
        const next = buildDetailStateFromUrl(window.location.href, detailDraft);
        setDetailDraft(next);
        setDetailState(next);
      }
    };

    window.addEventListener(EVENT_NAME, handleOpen);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener(EVENT_NAME, handleOpen);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [detailDraft, openModal]);

  const loadExpenseData = useCallback((force = false) => {
    if (expenseData && !force) {
      return;
    }
    const requestId = expenseRequestRef.current + 1;
    expenseRequestRef.current = requestId;
    setIsExpenseLoading(true);
    setExpenseError("");
    getExpenseCreateModalDataAction()
      .then((data) => {
        if (expenseRequestRef.current === requestId) {
          setExpenseData(data);
        }
      })
      .catch(() => {
        if (expenseRequestRef.current === requestId) {
          setExpenseError("Gagal memuat data form input biaya.");
        }
      })
      .finally(() => {
        if (expenseRequestRef.current === requestId) {
          setIsExpenseLoading(false);
        }
      });
  }, [expenseData]);

  const detailCacheKey = useMemo(
    () =>
      JSON.stringify({
        query: detailState.query,
        from: detailState.from,
        to: detailState.to,
        year: detailState.year,
        hasCriteria: detailState.hasCriteria,
      }),
    [detailState],
  );

  const commitDetailSearch = useCallback((nextState: DetailSearchState) => {
    const normalizedState = {
      ...nextState,
      query: nextState.query.trim(),
      hasCriteria: hasDetailCriteria(nextState),
    };
    setDetailState(normalizedState);
  }, []);

  const updateDetailDraft = useCallback(
    (patch: Partial<DetailSearchState>) => {
      setDetailDraft((current) => {
        const nextState = {
          ...current,
          ...patch,
        };
        nextState.hasCriteria = hasDetailCriteria(nextState);
        if (detailDebounceRef.current) {
          window.clearTimeout(detailDebounceRef.current);
        }
        detailDebounceRef.current = window.setTimeout(() => {
          commitDetailSearch(nextState);
        }, 650);
        return nextState;
      });
    },
    [commitDetailSearch],
  );

  const resetDetailSearch = useCallback(() => {
    if (detailDebounceRef.current) {
      window.clearTimeout(detailDebounceRef.current);
    }
    const emptyState: DetailSearchState = {
      query: "",
      from: "",
      to: "",
      year: null,
      hasCriteria: false,
    };
    setDetailDraft(emptyState);
    setDetailState(emptyState);
  }, []);

  const loadDetailData = useCallback((force = false) => {
    if (!hasDetailCriteria(detailState)) {
      setIsDetailLoading(false);
      setDetailError("");
      return;
    }
    if (detailDataCache[detailCacheKey] && !force) {
      return;
    }
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setIsDetailLoading(true);
    setDetailError("");
    getExpenseDetailSearchModalDataAction({
      query: detailState.query,
      from: detailState.from,
      to: detailState.to,
      year: detailState.year,
      hasCriteria: detailState.hasCriteria,
    })
      .then((data) => {
        if (detailRequestRef.current === requestId) {
          setDetailDataCache((current) => ({
            ...current,
            [detailCacheKey]: data,
          }));
        }
      })
      .catch(() => {
        if (detailRequestRef.current === requestId) {
          setDetailError("Gagal memuat data pencarian rincian.");
        }
      })
      .finally(() => {
        if (detailRequestRef.current === requestId) {
          setIsDetailLoading(false);
        }
      });
  }, [detailCacheKey, detailDataCache, detailState]);

  useEffect(
    () => () => {
      if (detailDebounceRef.current) {
        window.clearTimeout(detailDebounceRef.current);
      }
    },
    [],
  );

  const loadKmpReport = useCallback((force = false) => {
    if (kmpReport && !force) {
      return Promise.resolve();
    }
    const requestId = kmpRequestRef.current + 1;
    kmpRequestRef.current = requestId;
    setKmpError("");
    setIsKmpLoading(true);
    return getKmpMaterialReportModalDataAction()
      .then((data) => {
        if (kmpRequestRef.current === requestId) {
          setKmpReport(data);
        }
      })
      .catch(() => {
        if (kmpRequestRef.current === requestId) {
          setKmpError("Gagal memuat monitoring material KMP.");
        }
      })
      .finally(() => {
        if (kmpRequestRef.current === requestId) {
          setIsKmpLoading(false);
        }
      });
  }, [kmpReport]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (activeModal === "expense-new") {
        loadExpenseData();
      }
      if (activeModal === "detail-search" && hasDetailCriteria(detailState)) {
        loadDetailData();
      }
      if (activeModal === "kmp-material-check") {
        loadKmpReport();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeModal, detailState, loadDetailData, loadExpenseData, loadKmpReport]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadExpenseData(), 1200);
    return () => window.clearTimeout(timer);
  }, [loadExpenseData]);

  const projectClientNameById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.clientName ?? null] as const)),
    [projects],
  );

  const modalTitle =
    activeModal === "detail-search"
      ? "Cari Rincian Semua Project"
      : activeModal === "kmp-material-check"
        ? "Monitoring Material KMP Cianjur"
        : activeModal === "project-new"
          ? "Tambah Project Baru"
          : activeModal === "expense-new"
            ? "Input Biaya Project"
            : "Import File Excel";

  if (!activeModal) {
    return null;
  }

  const renderExpenseContent = () => {
    if (projects.length === 0) {
      return <p className="mt-4 text-sm text-slate-500">Belum ada project. Buat project dulu.</p>;
    }

    const expenseCategories =
      expenseData?.expenseCategories && expenseData.expenseCategories.length > 0
        ? expenseData.expenseCategories
        : mergeExpenseCategoryOptions();
    const defaultExpenseCategory = expenseCategories[0]?.value ?? COST_CATEGORIES[0].value;
    const projectInfoById = new Map(projects.map((project) => [project.id, project] as const));
    const projectClientScopeKeyById = new Map(
      projects.map((project) => [project.id, (project.clientName ?? "Tanpa Klien").trim().toLowerCase()] as const),
    );
    const requesterHistorySuggestions = Object.entries(expenseData?.requesterSuggestionsByProject ?? {})
      .flatMap(([projectId, requesterNames]) => {
        const project = projectInfoById.get(projectId);
        return requesterNames.map((requesterName) => ({
          requesterName,
          projectId,
          projectName: project?.name ?? "Project",
          projectCode: project?.code ?? null,
          clientName: project?.clientName ?? null,
        }));
      })
      .sort((a, b) => {
        if (a.requesterName !== b.requesterName) {
          return a.requesterName.localeCompare(b.requesterName, "id-ID");
        }
        return a.projectName.localeCompare(b.projectName, "id-ID");
    });
    const descriptionSuggestionsByClientScope = new Map<string, Set<string>>();
    for (const [projectId, suggestionRows] of Object.entries(expenseData?.descriptionSuggestionsByProject ?? {})) {
      const scopeKey = projectClientScopeKeyById.get(projectId) ?? `project:${projectId.toLowerCase()}`;
      const current = descriptionSuggestionsByClientScope.get(scopeKey) ?? new Set<string>();
      for (const item of suggestionRows) {
        const trimmedValue = item.trim();
        if (trimmedValue) {
          current.add(trimmedValue);
        }
      }
      descriptionSuggestionsByClientScope.set(scopeKey, current);
    }
    const sortedDescriptionsByScopeKey = new Map<string, string[]>();
    for (const [scopeKey, set] of descriptionSuggestionsByClientScope.entries()) {
      sortedDescriptionsByScopeKey.set(
        scopeKey,
        Array.from(set).sort((a, b) => a.localeCompare(b, "id-ID")),
      );
    }
    const descriptionSuggestionsForProjects = Object.fromEntries(
      projects.map((project) => {
        const scopeKey = projectClientScopeKeyById.get(project.id) ?? `project:${project.id.toLowerCase()}`;
        return [project.id, sortedDescriptionsByScopeKey.get(scopeKey) ?? []] as const;
      }),
    );

    return (
      <>
      <OptimisticExpenseCreateForm
        key={`expense-modal-form-${expenseActionToken || success || error || "idle"}`}
        id="expense-modal-form"
        action={createExpenseAction}
        className="mt-4 space-y-3"
      >
        <input type="hidden" name="return_to" value={openExpenseModalHref} />
        <input type="hidden" name="error_return_to" value={expenseModalErrorReturnHref} />
        <ExpenseInputModeFields
          projects={projects}
          initialProjectId={currentProjectQueryId}
          today={today}
          defaultExpenseCategory={defaultExpenseCategory}
          expenseCategories={expenseCategories}
          requesterHistorySuggestions={requesterHistorySuggestions}
          projectClientNameById={projectClientNameById}
          descriptionSuggestionsForProjects={descriptionSuggestionsForProjects}
          hokProjectPresets={expenseData?.hokProjectPresets ?? []}
        />
      </OptimisticExpenseCreateForm>
      {isExpenseLoading && !expenseData ? (
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
          Data saran sedang dimuat di background. Form tetap bisa digunakan.
        </p>
      ) : expenseError ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          <p>{expenseError} Form tetap bisa dipakai tanpa data saran.</p>
          <button
            type="button"
            data-ui-button="true"
            onClick={() => loadExpenseData(true)}
            className="mt-2 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            Muat Ulang Data Saran
          </button>
        </div>
      ) : null}
      </>
    );
  };

  const renderDetailContent = () => {
    const detailData = detailDataCache[detailCacheKey];
    const isSearching = hasDetailCriteria(detailState) && isDetailLoading && !detailData;
    return (
      <div className="mt-4 space-y-4">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (detailDebounceRef.current) {
              window.clearTimeout(detailDebounceRef.current);
            }
            commitDetailSearch(detailDraft);
          }}
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              value={detailDraft.query}
              onChange={(event) => updateDetailDraft({ query: event.currentTarget.value })}
              placeholder="Contoh: hebel, proyek gudang, 1.500.000, 13/04/2026"
              autoFocus
              autoComplete="off"
            />
            <button
              type="submit"
              data-ui-button="true"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              <span className="btn-icon bg-white/15 text-white">
                <SearchIcon />
              </span>
              Search
            </button>
            {hasDetailCriteria(detailDraft) ? (
              <button
                type="button"
                data-ui-button="true"
                onClick={resetDetailSearch}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <span className="btn-icon bg-slate-100 text-slate-600">
                  <CloseIcon />
                </span>
                Reset Filter
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-slate-500">
            Pencarian berjalan setelah kata kunci atau filter diisi. Data besar tidak dimuat saat modal pertama dibuka.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Dari tanggal</label>
              <input
                type="date"
                value={detailDraft.from}
                onChange={(event) => updateDetailDraft({ from: event.currentTarget.value })}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Sampai tanggal</label>
              <input
                type="date"
                value={detailDraft.to}
                onChange={(event) => updateDetailDraft({ to: event.currentTarget.value })}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tahun</label>
              <input
                type="number"
                inputMode="numeric"
                min={1900}
                max={9999}
                step={1}
                value={detailDraft.year ? String(detailDraft.year) : ""}
                onChange={(event) => {
                  const value = event.currentTarget.value.trim();
                  updateDetailDraft({
                    year: /^\d{4}$/.test(value) ? Number(value) : null,
                  });
                }}
                placeholder="Contoh: 2026"
                autoComplete="off"
              />
            </div>
          </div>
        </form>
        {detailError ? (
          <ModalDataError message={detailError} onRetry={() => loadDetailData(true)} />
        ) : !hasDetailCriteria(detailState) ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
            Isi kata kunci rincian atau gunakan filter tanggal/tahun untuk mulai mencari.
          </p>
        ) : isSearching ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600">
            Mencari rincian...
          </p>
        ) : !detailData ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
            Ketik kata kunci lalu tekan Search untuk mencari rincian.
          </p>
        ) : !detailState.hasCriteria ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
            Isi kata kunci rincian atau gunakan filter tanggal/tahun untuk mencari data di semua project.
          </p>
        ) : detailData.results.length === 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-700">
            Data tidak ditemukan untuk filter rincian yang dipilih.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Ditemukan {detailData.results.length} data sesuai filter rincian.
            </p>
            <ExpenseDetailSearchResults
              results={detailData.results}
              projectSearchText={searchText}
              canEdit={canEdit}
              expenseCategories={detailData.expenseCategories}
              bulkEditReturnTo={detailSearchReturnHref}
            />
          </div>
        )}
      </div>
    );
  };

  const renderKmpContent = () => {
    if (kmpError) {
      return <ModalDataError message={kmpError} onRetry={() => loadKmpReport(true)} />;
    }
    if (!kmpReport) {
      return <KmpMaterialQuickPreview />;
    }
    if (kmpReport.projects.length === 0) {
      return (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-700">
          Belum ada project klien KMP Cianjur yang bisa dimonitor.
        </p>
      );
    }
    const projectsWithHref = kmpReport.projects.map((project) => ({
      ...project,
      recapHref: createProjectsHref({
        projectId: project.projectId,
        searchText,
        view: "rekap",
      }),
    }));

    return (
      <>
        {isKmpLoading ? (
          <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            Memperbarui monitoring material dari database...
          </p>
        ) : null}
        <KmpMaterialMonitorPanel
          checklistLabels={kmpReport.checklistLabels}
          totalProjects={kmpReport.totalProjects}
          completeProjectCount={kmpReport.completeProjectCount}
          incompleteProjectCount={kmpReport.incompleteProjectCount}
          projects={projectsWithHref}
          canEdit={canEdit}
          returnTo={openKmpMaterialReportHref}
          today={today}
          onDataChanged={() => loadKmpReport(true)}
        />
      </>
    );
  };

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        onClick={closeModal}
        aria-label="Tutup modal"
        className="absolute inset-0 bg-slate-950/45"
      />
      <section
        className={`modal-card panel relative z-10 max-h-[calc(100vh-2rem)] w-full overflow-y-auto p-5 ${
          activeModal === "detail-search"
            ? "max-w-6xl"
            : activeModal === "kmp-material-check"
              ? "max-w-5xl"
              : "max-w-3xl"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{modalTitle}</h2>
          <button
            type="button"
            onClick={closeModal}
            data-ui-button="true"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            <span className="btn-icon bg-slate-100 text-slate-600">
              <CloseIcon />
            </span>
            Tutup
          </button>
        </div>

        {activeModal === "detail-search" ? (
          renderDetailContent()
        ) : activeModal === "kmp-material-check" ? (
          renderKmpContent()
        ) : activeModal === "project-new" ? (
          <OptimisticProjectCreateForm action={createProjectAction} className="mt-4 space-y-3">
            <input type="hidden" name="return_to" value={closeModalHref} />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Nama project</label>
              <input name="name" placeholder="Contoh: Renovasi Lobby" required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Kode</label>
                <input name="code" placeholder="PRJ-001" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
                <select name="status" defaultValue="aktif">
                  {PROJECT_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Klien</label>
              <input name="client_name" placeholder="Nama klien / perusahaan" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal mulai</label>
              <input type="date" name="start_date" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Kategori tambahan (opsional)
              </label>
              <input
                name="initial_categories"
                placeholder="Pisah dengan koma, contoh: transport, akomodasi"
              />
            </div>
            <MutationSubmitButton
              pendingLabel="Menyimpan Project..."
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                <SaveIcon />
              </span>
              Simpan Project
            </MutationSubmitButton>
          </OptimisticProjectCreateForm>
        ) : activeModal === "excel-import" ? (
          activeDataSource === "demo" ? (
            <p className="mt-4 text-sm text-slate-500">
              Import Excel tidak tersedia pada mode demo karena tidak ada database aktif.
            </p>
          ) : (
            <form action={importExcelTemplateAction} className="mt-4 space-y-4">
              <input type="hidden" name="return_to" value={closeModalHref} />
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                Data hasil import akan masuk ke sumber data aktif: <strong>{storageLabel}</strong>
              </p>
              <ExcelDropInput name="template_file" />
              <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                <span className="btn-icon icon-wiggle-soft bg-white/20 text-white">
                  <ImportIcon />
                </span>
                Proses Import Excel
              </button>
            </form>
          )
        ) : (
          renderExpenseContent()
        )}
      </section>
    </div>
  );
}
