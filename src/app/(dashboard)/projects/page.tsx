import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createExpenseAction,
  createProjectAction,
  deleteExpenseAction,
  deleteProjectAction,
  deleteSelectedProjectsAction,
  importExcelTemplateAction,
  updateManyProjectsAction,
} from "@/app/actions";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { ExpenseDetailSearchForm } from "@/components/expense-detail-search-form";
import { ExpenseDetailSearchResults } from "@/components/expense-detail-search-results";
import {
  CashInIcon,
  CloseIcon,
  EditIcon,
  EyeIcon,
  ImportIcon,
  PlusIcon,
  ProjectIcon,
  SaveIcon,
  SearchIcon,
  TrashIcon,
  WalletIcon,
} from "@/components/icons";
import { ExcelDropInput } from "@/components/excel-drop-input";
import { EnterToNextField } from "@/components/enter-to-next-field";
import { ProjectChecklistSearch } from "@/components/project-checklist-search";
import { ProjectAutocomplete } from "@/components/project-autocomplete";
import { ProjectScopedAutocompleteInput } from "@/components/project-scoped-autocomplete-input";
import { RequesterProjectAutocompleteInput } from "@/components/requester-project-autocomplete-input";
import { ReportDownloadPreviewButton } from "@/components/report-download-preview-button";
import { ProjectsSelectionToggle } from "@/components/projects-selection-toggle";
import { ProjectsSearchInput } from "@/components/projects-search-input";
import { RupiahInput } from "@/components/rupiah-input";
import { SuccessToast } from "@/components/success-toast";
import {
  COST_CATEGORIES,
  getCostCategoryLabel,
  getCostCategoryStyle,
  mergeExpenseCategoryOptions,
  PROJECT_STATUSES,
  PROJECT_STATUS_STYLE,
  resolveSummaryCostCategory,
  SPECIALIST_COST_PRESETS,
} from "@/lib/constants";
import {
  getDescriptionSuggestionsByProject,
  getExpenseCategories,
  getProjectDetail,
  getProjects,
  getRequesterSuggestionsByProject,
  searchExpenseDetails,
} from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  canAccessProjects,
  canExportReports,
  canImportData,
  canManageProjects,
  requireAuthUser,
} from "@/lib/auth";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

type ModalType = "project-new" | "expense-new" | "excel-import" | "detail-search";
type ProjectView = "list" | "rekap";

type ProjectPageProps = {
  searchParams: Promise<{
    project?: string;
    modal?: string;
    q?: string;
    detail_q?: string;
    detail_from?: string;
    detail_to?: string;
    detail_year?: string;
    success?: string;
    view?: string;
  }>;
};

function normalizeSearchText(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function resolveClientScopeName(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || "Tanpa Klien";
}

function resolveClientScopeKey(value: string | null | undefined) {
  return resolveClientScopeName(value).toLowerCase();
}

function isDateString(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function parseFilterYear(value: string | undefined) {
  if (!value || !/^\d{4}$/.test(value.trim())) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 9999) {
    return null;
  }
  return parsed;
}

function createProjectsHref(params: {
  projectId?: string;
  modal?: ModalType;
  searchText?: string;
  detailSearchQuery?: string;
  detailDateFrom?: string;
  detailDateTo?: string;
  detailYear?: number | null;
  view?: ProjectView;
}) {
  const query = new URLSearchParams();
  if (params.projectId) {
    query.set("project", params.projectId);
  }
  if (params.modal) {
    query.set("modal", params.modal);
  }
  if (params.view) {
    query.set("view", params.view);
  }
  const trimmedSearch = params.searchText?.trim();
  if (trimmedSearch) {
    query.set("q", trimmedSearch);
  }
  const trimmedDetailSearch = params.detailSearchQuery?.trim();
  if (trimmedDetailSearch) {
    query.set("detail_q", trimmedDetailSearch);
  }
  if (params.detailDateFrom) {
    query.set("detail_from", params.detailDateFrom);
  }
  if (params.detailDateTo) {
    query.set("detail_to", params.detailDateTo);
  }
  if (params.detailYear) {
    query.set("detail_year", String(params.detailYear));
  }
  const queryText = query.toString();
  return queryText ? `/projects?${queryText}` : "/projects";
}

export default async function ProjectsPage({ searchParams }: ProjectPageProps) {
  const user = await requireAuthUser();
  const canEdit = canManageProjects(user);
  if (!canAccessProjects(user)) {
    redirect("/");
  }
  const canImport = canImportData(user);
  const canExport = canExportReports(user);
  const params = await searchParams;
  const [projects, expenseCategories, requesterSuggestionsByProject, descriptionSuggestionsByProject] =
    await Promise.all([
      getProjects(),
      getExpenseCategories(),
      getRequesterSuggestionsByProject(),
      getDescriptionSuggestionsByProject(),
    ]);
  const today = new Date().toISOString().slice(0, 10);
  const defaultExpenseCategory = expenseCategories[0]?.value ?? COST_CATEGORIES[0].value;

  const requestedProjectId = typeof params.project === "string" ? params.project : undefined;
  const hasRequestedProjectId =
    typeof requestedProjectId === "string" &&
    projects.some((item) => item.id === requestedProjectId);
  const currentProjectQueryId = hasRequestedProjectId ? requestedProjectId : undefined;
  const selectedProjectId = currentProjectQueryId ?? projects[0]?.id;
  const viewParam = typeof params.view === "string" ? params.view : "";
  const activeView: ProjectView = viewParam === "rekap" ? "rekap" : "list";
  const selectedProject =
    activeView === "rekap" && selectedProjectId
      ? await getProjectDetail(selectedProjectId)
      : null;
  const scopedReportProjectIds =
    activeView === "rekap" && selectedProject?.project.id && currentProjectQueryId
      ? [selectedProject.project.id]
      : undefined;
  const reportScopeLabel =
    scopedReportProjectIds && selectedProject
      ? `Filter laporan aktif: ${selectedProject.project.name}`
      : "Filter laporan aktif: Semua project";
  const recapExpenses = selectedProject
    ? selectedProject.expenses
        .slice()
        .sort((a, b) => {
          if (a.expenseDate !== b.expenseDate) {
            return a.expenseDate.localeCompare(b.expenseDate);
          }
          return (a.requesterName ?? "").localeCompare(b.requesterName ?? "");
        })
    : [];
  const recapCategoryTotals = selectedProject
    ? (() => {
        const totalsByCategory = new Map<string, number>();
        for (const expense of recapExpenses) {
          const category = resolveSummaryCostCategory({
            category: expense.category,
            description: expense.description,
            usageInfo: expense.usageInfo,
          });
          if (!category) {
            continue;
          }
          totalsByCategory.set(
            category,
            (totalsByCategory.get(category) ?? 0) + expense.amount,
          );
        }

        return mergeExpenseCategoryOptions(
          expenseCategories,
          recapExpenses.map((item) =>
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
      })()
    : [];

  const searchText = typeof params.q === "string" ? params.q.trim() : "";
  const searchKeyword = normalizeSearchText(searchText);
  const filteredProjects = searchKeyword
    ? projects.filter((project) => {
        const haystack = [
          project.name,
          project.code ?? "",
          project.clientName ?? "",
          project.status,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchKeyword);
      })
    : projects;
  const projectInfoById = new Map(
    projects.map((project) => [project.id, project] as const),
  );
  const projectClientNameById = Object.fromEntries(
    projects.map((project) => [project.id, project.clientName ?? null] as const),
  );
  const projectClientScopeKeyById = new Map(
    projects.map((project) => [project.id, resolveClientScopeKey(project.clientName)] as const),
  );
  const requesterHistorySuggestions = Object.entries(requesterSuggestionsByProject)
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
  for (const [projectId, suggestionRows] of Object.entries(descriptionSuggestionsByProject)) {
    const scopeKey = projectClientScopeKeyById.get(projectId) ?? `project:${projectId.toLowerCase()}`;
    const current = descriptionSuggestionsByClientScope.get(scopeKey) ?? new Set<string>();
    for (const item of suggestionRows) {
      const trimmedValue = item.trim();
      if (!trimmedValue) {
        continue;
      }
      current.add(trimmedValue);
    }
    descriptionSuggestionsByClientScope.set(scopeKey, current);
  }
  const descriptionSuggestionsForProjects = Object.fromEntries(
    projects.map((project) => {
      const scopeKey =
        projectClientScopeKeyById.get(project.id) ?? `project:${project.id.toLowerCase()}`;
      return [
        project.id,
        Array.from(descriptionSuggestionsByClientScope.get(scopeKey) ?? []).sort((a, b) =>
          a.localeCompare(b, "id-ID"),
        ),
      ] as const;
    }),
  );

  const modalParam = typeof params.modal === "string" ? params.modal : "";
  const detailSearchQuery = typeof params.detail_q === "string" ? params.detail_q.trim() : "";
  const detailDateFrom = isDateString(params.detail_from) ? String(params.detail_from) : "";
  const detailDateTo = isDateString(params.detail_to) ? String(params.detail_to) : "";
  const detailYear = parseFilterYear(
    typeof params.detail_year === "string" ? params.detail_year : undefined,
  );
  const hasDetailSearchCriteria = Boolean(detailSearchQuery || detailDateFrom || detailDateTo || detailYear);
  const success = typeof params.success === "string" ? params.success : "";
  const requestedModal: ModalType | null =
    modalParam === "project-new" ||
    modalParam === "expense-new" ||
    modalParam === "excel-import" ||
    modalParam === "detail-search"
      ? modalParam
      : null;
  let activeModal = requestedModal;
  let blockedModalMessage = "";
  if (!canEdit && (requestedModal === "project-new" || requestedModal === "expense-new")) {
    activeModal = null;
    blockedModalMessage = "Role viewer hanya bisa melihat data. Tambah/edit dinonaktifkan.";
  }
  if (!canImport && requestedModal === "excel-import") {
    activeModal = null;
    blockedModalMessage = "Import Excel hanya tersedia untuk role developer.";
  }
  const detailSearchResults =
    activeModal === "detail-search" && hasDetailSearchCriteria
      ? await searchExpenseDetails(detailSearchQuery, 1200, {
          from: detailDateFrom || undefined,
          to: detailDateTo || undefined,
          year: detailYear ?? undefined,
        })
      : [];
  const closeModalHref = createProjectsHref({
    projectId: currentProjectQueryId,
    searchText,
    view: activeView,
  });
  const openProjectModalHref = createProjectsHref({
    projectId: currentProjectQueryId,
    modal: "project-new",
    searchText,
    view: activeView,
  });
  const openExpenseModalHref = createProjectsHref({
    projectId: currentProjectQueryId,
    modal: "expense-new",
    searchText,
    view: activeView,
  });
  const expenseModalReturnHref = createProjectsHref({
    projectId: currentProjectQueryId,
    modal: "expense-new",
    searchText,
    view: activeView,
  });
  const openImportModalHref = createProjectsHref({
    projectId: currentProjectQueryId,
    modal: "excel-import",
    searchText,
    view: activeView,
  });
  const openDetailSearchModalHref = createProjectsHref({
    projectId: currentProjectQueryId,
    modal: "detail-search",
    searchText,
    view: activeView,
  });
  const listViewHref = createProjectsHref({
    projectId: currentProjectQueryId,
    searchText,
    view: "list",
  });
  const recapViewHref = createProjectsHref({
    projectId: currentProjectQueryId,
    searchText,
    view: "rekap",
  });
  const detailSearchReturnHref = createProjectsHref({
    projectId: currentProjectQueryId,
    modal: "detail-search",
    searchText,
    detailSearchQuery,
    detailDateFrom,
    detailDateTo,
    detailYear,
    view: activeView,
  });

  return (
    <div className="space-y-4">
      <SuccessToast message={success} />
      {activeDataSource === "demo" ? (
        <section className="panel border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-700">
            Mode demo aktif. Form tetap tampil, tetapi tidak menyimpan ke database.
          </p>
        </section>
      ) : null}
      {activeDataSource === "excel" ? (
        <section className="panel border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">Sumber data aktif: {getStorageLabel()}</p>
        </section>
      ) : null}
      {blockedModalMessage ? (
        <section className="panel border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-700">{blockedModalMessage}</p>
        </section>
      ) : null}

      <section className="soft-card p-4 md:p-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
          <div>
            <h2 className="section-title">Manajemen Project</h2>
            <p className="section-description">
              Semua aksi utama tersedia dalam toolbar yang lebih ringkas, sementara form input tetap
              memakai modal agar layar utama tidak penuh.
            </p>
          </div>
          <div className="section-actions xl:justify-end">
            {canEdit ? (
              <>
                <Link
                  href={openProjectModalHref}
                  data-ui-button="true"
                  className="button-primary button-sm"
                >
                  <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                    <PlusIcon />
                  </span>
                  Tambah Project
                </Link>
                <Link
                  href={openExpenseModalHref}
                  data-ui-button="true"
                  className="button-sm inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <span className="btn-icon icon-float-soft bg-emerald-100 text-emerald-700">
                    <CashInIcon />
                  </span>
                  Input Biaya
                </Link>
              </>
            ) : null}
            <Link
              href={openDetailSearchModalHref}
              data-ui-button="true"
              className="button-soft button-sm"
            >
              <span className="btn-icon bg-slate-100 text-slate-700">
                <SearchIcon />
              </span>
              Cari Rincian
            </Link>
            {activeDataSource !== "demo" && canImport ? (
              <Link
                href={openImportModalHref}
                data-ui-button="true"
                className="button-sm inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                <span className="btn-icon icon-wiggle-soft bg-amber-100 text-amber-700">
                  <ImportIcon />
                </span>
                Import Data Excel
              </Link>
            ) : null}
          </div>

          {canExport ? (
          <div className="info-banner xl:col-span-2">
            <p className="info-banner__title">Export Laporan</p>
            <p className="info-banner__text">{reportScopeLabel}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <ReportDownloadPreviewButton
                label="PDF Rekapan Project"
                iconType="pdf"
                downloadPath="/api/reports/expenses/all"
                projectIds={scopedReportProjectIds}
                className="button-primary button-sm"
              />
              <ReportDownloadPreviewButton
                label="Excel Rekapan Project"
                iconType="excel"
                downloadPath="/api/reports/expenses/all/excel"
                previewPath="/api/reports/expenses/all"
                projectIds={scopedReportProjectIds}
                className="button-secondary button-sm"
              />
              <ReportDownloadPreviewButton
                label="PDF Rincian Biaya"
                iconType="detail"
                downloadPath="/api/reports/expenses/all/detail"
                projectIds={scopedReportProjectIds}
                className="button-soft button-sm"
              />
              <ReportDownloadPreviewButton
                label="Excel Rincian Biaya"
                iconType="excel"
                downloadPath="/api/reports/expenses/all/detail/excel"
                previewPath="/api/reports/expenses/all/detail"
                projectIds={scopedReportProjectIds}
                className="button-soft button-sm"
              />
            </div>
          </div>
          ) : null}
        </div>
      </section>

      <section className="soft-card p-4 md:p-5">
        <div className="button-stack">
          <Link
            href={listViewHref}
            data-ui-button="true"
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
              activeView === "list"
                ? "border-transparent bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span
              className={`btn-icon ${
                activeView === "list" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              <ProjectIcon />
            </span>
            Daftar Project
          </Link>
          <Link
            href={recapViewHref}
            data-ui-button="true"
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
              activeView === "rekap"
                ? "border-transparent bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span
              className={`btn-icon ${
                activeView === "rekap" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              <WalletIcon />
            </span>
            Rekap Biaya
          </Link>
        </div>
      </section>

      {activeView === "list" ? (
        <section className="soft-card p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title">Daftar Project</h2>
            <p className="section-description">
              Menampilkan {filteredProjects.length} dari {projects.length} project
            </p>
          </div>
          <ProjectsSearchInput initialValue={searchText} />
          <div className="toolbar-card toolbar-card--dense mt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ProjectsSelectionToggle formId="selected-projects-report-form" />
              <Link
                href={openDetailSearchModalHref}
                data-ui-button="true"
                className="button-soft button-sm"
              >
                <span className="btn-icon bg-slate-100 text-slate-700">
                  <SearchIcon />
                </span>
                Cari Rincian Semua Project
              </Link>
            </div>
            <form
              id="selected-projects-report-form"
              action={deleteSelectedProjectsAction}
              className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-5"
            >
              <input
                type="hidden"
                name="return_to"
                value={createProjectsHref({
                  projectId: currentProjectQueryId,
                  searchText,
                  view: "list",
                })}
              />
              {canExport ? (
              <ReportDownloadPreviewButton
                label="PDF Rekapan Terpilih"
                iconType="pdf"
                downloadPath="/api/reports/expenses/all"
                selectedFormId="selected-projects-report-form"
                selectedOnly
                className="button-primary button-sm"
              />
              ) : null}
              {canExport ? (
              <ReportDownloadPreviewButton
                label="Excel Rekapan Terpilih"
                iconType="excel"
                downloadPath="/api/reports/expenses/all/excel"
                previewPath="/api/reports/expenses/all"
                selectedFormId="selected-projects-report-form"
                selectedOnly
                className="button-secondary button-sm"
              />
              ) : null}
              {canExport ? (
              <ReportDownloadPreviewButton
                label="PDF Rincian Biaya Terpilih"
                iconType="detail"
                downloadPath="/api/reports/expenses/all/detail"
                selectedFormId="selected-projects-report-form"
                selectedOnly
                className="button-soft button-sm"
              />
              ) : null}
              {canExport ? (
              <ReportDownloadPreviewButton
                label="Excel Rincian Biaya Terpilih"
                iconType="excel"
                downloadPath="/api/reports/expenses/all/detail/excel"
                previewPath="/api/reports/expenses/all/detail"
                selectedFormId="selected-projects-report-form"
                selectedOnly
                className="button-soft button-sm"
              />
              ) : null}
              {canEdit ? (
                <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2 xl:col-span-5">
                  <summary className="cursor-pointer text-xs font-semibold text-amber-700">
                    Edit Project Terpilih
                  </summary>
                  <p className="mt-2 text-[11px] text-amber-700/90">
                    Checklist project di tabel, lalu centang field yang ingin diubah massal.
                  </p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <label className="space-y-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" name="apply_status" value="1" />
                        Ubah status
                      </span>
                      <select name="status" defaultValue="aktif">
                        {PROJECT_STATUSES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" name="apply_client_name" value="1" />
                        Ubah klien
                      </span>
                      <input name="client_name" placeholder="Kosongkan untuk hapus klien" />
                    </label>
                    <label className="space-y-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" name="apply_start_date" value="1" />
                        Ubah tanggal mulai
                      </span>
                      <input type="date" name="start_date" />
                    </label>
                  </div>
                  <button
                    formAction={updateManyProjectsAction}
                    className="button-primary button-sm mt-3"
                  >
                    <span className="btn-icon bg-white/20 text-white">
                      <EditIcon />
                    </span>
                    Simpan Edit Project Terpilih
                  </button>
                </details>
              ) : null}
              {canEdit ? (
                <ConfirmActionButton
                  className="button-danger button-sm"
                  modalDescription="Yakin ingin menghapus semua project yang dipilih beserta data biaya dan absensinya?"
                  confirmLabel="Ya, Hapus Semua"
                >
                  <span className="btn-icon bg-rose-100 text-rose-700">
                    <TrashIcon />
                  </span>
                  Hapus Project Terpilih
                </ConfirmActionButton>
              ) : null}
            </form>
          </div>
          </div>

          <div className="mt-4 table-card">
            <div className="data-table-shell">
            <table className="data-table data-table--sticky data-table--compact min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th>Nama</th>
                  <th>Klien</th>
                  <th>Status</th>
                  <th>Mulai</th>
                  <th className="text-center">Pilih</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project.id}>
                    <td className="font-medium text-slate-900">
                      <p>{project.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{project.code ?? "-"}</p>
                    </td>
                    <td>{project.clientName ?? "-"}</td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${PROJECT_STATUS_STYLE[project.status]}`}
                      >
                        {project.status}
                      </span>
                    </td>
                    <td>{project.startDate ? formatDate(project.startDate) : "-"}</td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        name="project"
                        value={project.id}
                        form="selected-projects-report-form"
                        data-project-selection="true"
                        aria-label={`Pilih ${project.name} untuk aksi massal`}
                      />
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link
                          href={createProjectsHref({
                            projectId: project.id,
                            searchText,
                            view: "rekap",
                          })}
                          className="button-secondary button-xs"
                        >
                          <span className="btn-icon bg-blue-100 text-blue-700">
                            <EyeIcon />
                          </span>
                          Lihat
                        </Link>
                        {canEdit ? (
                          <>
                            <Link
                              href={`/projects/edit?id=${project.id}`}
                              className="button-soft button-xs"
                            >
                              <span className="btn-icon bg-emerald-100 text-emerald-700">
                                <EditIcon />
                              </span>
                              Edit
                            </Link>
                            <form action={deleteProjectAction}>
                              <input type="hidden" name="project_id" value={project.id} />
                              <input
                                type="hidden"
                                  name="return_to"
                                  value={createProjectsHref({
                                    projectId:
                                      currentProjectQueryId && currentProjectQueryId !== project.id
                                        ? currentProjectQueryId
                                        : undefined,
                                    searchText,
                                    view: "list",
                                  })}
                                />
                              <ConfirmActionButton
                                className="button-danger button-xs"
                                modalDescription={`Yakin ingin menghapus project "${project.name}" beserta semua datanya?`}
                              >
                                <span className="btn-icon bg-rose-100 text-rose-700">
                                  <TrashIcon />
                                </span>
                                Hapus
                              </ConfirmActionButton>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Project tidak ditemukan untuk kata kunci &quot;{searchText}&quot;.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      ) : (
        <section className="soft-card p-4 md:p-5">
          <div className="section-header">
            <div>
            <h2 className="section-title text-lg">
              <span className="typing-title">Rekap Proyek</span>
              <span className="ml-1 text-slate-600">- {selectedProject?.project.name ?? "Project"}</span>
            </h2>
            <p className="section-description">
              Rincian biaya per project tetap sama, tetapi ditata dalam kartu dan tabel yang lebih
              mudah dipindai.
            </p>
            </div>
            {selectedProject && canExport ? (
              <ReportDownloadPreviewButton
                label="Download PDF Biaya Project"
                iconType="pdf"
                downloadPath={`/api/reports/expenses?project=${selectedProject.project.id}`}
                className="button-primary button-sm"
              />
            ) : null}
          </div>
          {!selectedProject ? (
            <p className="mt-3 text-sm text-slate-500">Data project belum tersedia.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {recapCategoryTotals.map((item) => (
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
                {recapExpenses.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
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
                        <dd className="mt-1 break-words text-sm text-slate-700">
                          {item.description ?? "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Vendor
                        </dt>
                        <dd className="mt-1 break-words text-sm text-slate-700">
                          {item.recipientName ?? "-"}
                        </dd>
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
                                projectId: selectedProject.project.id,
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
                {recapExpenses.length === 0 ? (
                  <p className="rounded-2xl border border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
                    Belum ada transaksi biaya.
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
                      <th className="w-[8%] text-right">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recapExpenses.map((item) => (
                      <tr key={item.id}>
                        <td className="align-top text-[11px] whitespace-nowrap">
                          {formatDate(item.expenseDate)}
                        </td>
                        <td className="align-top break-words">
                          {item.requesterName ?? "-"}
                        </td>
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
                        <td className="align-top break-words">
                          {item.recipientName ?? "-"}
                        </td>
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
                                      projectId: selectedProject.project.id,
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
                    {recapExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                          Belum ada transaksi biaya.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {activeModal ? (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <Link
            href={closeModalHref}
            aria-label="Tutup modal"
            className="absolute inset-0 bg-slate-950/45"
          />
          <section className="modal-card panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                {activeModal === "detail-search"
                  ? "Cari Rincian Semua Project"
                  : activeModal === "project-new"
                  ? "Tambah Project Baru"
                  : activeModal === "expense-new"
                    ? "Input Biaya Project"
                    : "Import File Excel"}
              </h2>
              <Link
                href={closeModalHref}
                data-ui-button="true"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                <span className="btn-icon bg-slate-100 text-slate-600">
                  <CloseIcon />
                </span>
                Tutup
              </Link>
            </div>

            {activeModal === "detail-search" ? (
              <div className="mt-4 space-y-4">
                <ExpenseDetailSearchForm
                  currentProjectId={currentProjectQueryId}
                  projectSearchText={searchText}
                  activeView={activeView}
                  initialQuery={detailSearchQuery}
                  initialFrom={detailDateFrom}
                  initialTo={detailDateTo}
                  initialYear={detailYear}
                  hasCriteria={hasDetailSearchCriteria}
                  resetHref={openDetailSearchModalHref}
                />

                {!hasDetailSearchCriteria ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                    Isi kata kunci rincian atau gunakan filter tanggal/tahun untuk mencari data di semua
                    project.
                  </p>
                ) : detailSearchResults.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-700">
                    Data tidak ditemukan untuk filter rincian yang dipilih.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      Ditemukan {detailSearchResults.length} data sesuai filter rincian.
                    </p>
                    <ExpenseDetailSearchResults
                      results={detailSearchResults}
                      projectSearchText={searchText}
                      canEdit={canEdit}
                      expenseCategories={expenseCategories}
                      bulkEditReturnTo={detailSearchReturnHref}
                    />
                  </div>
                )}
              </div>
            ) : activeModal === "project-new" ? (
              <form action={createProjectAction} className="mt-4 space-y-3">
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
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700">
                  <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                    <SaveIcon />
                  </span>
                  Simpan Project
                </button>
              </form>
            ) : activeModal === "excel-import" ? (
              activeDataSource === "demo" ? (
                <p className="mt-4 text-sm text-slate-500">
                  Import Excel tidak tersedia pada mode demo karena tidak ada database aktif.
                </p>
              ) : (
                <form action={importExcelTemplateAction} className="mt-4 space-y-4">
                  <input type="hidden" name="return_to" value={closeModalHref} />
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    Data hasil import akan masuk ke sumber data aktif: <strong>{getStorageLabel()}</strong>
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
            ) : projects.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">Belum ada project. Buat project dulu.</p>
            ) : (
              <form id="expense-modal-form" action={createExpenseAction} className="mt-4 space-y-3">
                <EnterToNextField formId="expense-modal-form" />
                <input type="hidden" name="return_to" value={expenseModalReturnHref} />
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                  Field wajib
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
                  <ProjectAutocomplete
                    projects={projects}
                    initialProjectId={currentProjectQueryId}
                    autoFocus
                  />
                  <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                      Masukkan data yang sama ke project lain (opsional)
                    </summary>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Data akan disimpan ke project utama di atas, plus project tambahan yang Anda centang.
                    </p>
                    <ProjectChecklistSearch
                      projects={projects}
                      inputName="project_ids"
                    />
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
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600">
                  <span className="btn-icon icon-float-soft bg-white/20 text-white">
                    <SaveIcon />
                  </span>
                  Simpan Biaya
                </button>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
