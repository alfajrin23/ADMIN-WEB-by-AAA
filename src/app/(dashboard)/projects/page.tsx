import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectsModalController } from "@/components/projects-modal-controller";
import { deleteProjectAction, deleteSelectedProjectsAction } from "@/app/actions/project.action";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { OptimisticDomMutationForm } from "@/components/optimistic-mutation-notice";
import { InstantModalLink } from "@/components/instant-modal-link";
import { ProjectRecapExpenseList } from "@/components/project-recap-expense-list";
import {
  CashInIcon,
  EditIcon,
  EyeIcon,
  ImportIcon,
  PlusIcon,
  ProjectIcon,
  SearchIcon,
  TrashIcon,
  WalletIcon,
} from "@/components/icons";
import { ReportCopyButton } from "@/components/report-copy-button";
import { ReportDownloadPreviewButton } from "@/components/report-download-preview-button";
import { ProjectsSelectionToggle } from "@/components/projects-selection-toggle";
import { OptimisticProjectsBulkEditButton } from "@/components/optimistic-projects-bulk-edit-button";
import { OptimisticPendingProjectRows } from "@/components/optimistic-pending-project-rows";
import { ProjectsSearchInput } from "@/components/projects-search-input";
import { SuccessToast } from "@/components/success-toast";
import {
  mergeExpenseCategoryOptions,
  PROJECT_STATUSES,
  PROJECT_STATUS_STYLE,
} from "@/lib/constants";
import {
  getProjectDetail,
  getProjects,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import {
  canAccessProjects,
  canExportReports,
  canImportData,
  canManageProjects,
  requireAuthUser,
} from "@/lib/auth";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

type ModalType =
  | "project-new"
  | "expense-new"
  | "excel-import"
  | "detail-search"
  | "kmp-material-check";
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
    error?: string;
    expense_action_token?: string;
    expense_draft_clear?: string;
    expense_continue_draft_clear?: string;
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
  const modalParam = typeof params.modal === "string" ? params.modal : "";
  const requestedModal: ModalType | null =
    modalParam === "project-new" ||
    modalParam === "expense-new" ||
    modalParam === "excel-import" ||
    modalParam === "detail-search" ||
    modalParam === "kmp-material-check"
      ? modalParam
      : null;
  const viewParam = typeof params.view === "string" ? params.view : "";
  const activeView: ProjectView = viewParam === "rekap" ? "rekap" : "list";
  const searchText = typeof params.q === "string" ? params.q.trim() : "";
  const detailSearchQuery = typeof params.detail_q === "string" ? params.detail_q.trim() : "";
  const detailDateFrom = isDateString(params.detail_from) ? String(params.detail_from) : "";
  const detailDateTo = isDateString(params.detail_to) ? String(params.detail_to) : "";
  const detailYear = parseFilterYear(
    typeof params.detail_year === "string" ? params.detail_year : undefined,
  );
  const hasDetailSearchCriteria = Boolean(detailSearchQuery || detailDateFrom || detailDateTo || detailYear);
  const success = typeof params.success === "string" ? params.success : "";
  const expenseActionToken = typeof params.expense_action_token === "string" ? params.expense_action_token : "";
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

  const projects = await getProjects();

  const requestedProjectId = typeof params.project === "string" ? params.project : undefined;
  const hasRequestedProjectId =
    typeof requestedProjectId === "string" &&
    projects.some((item) => item.id === requestedProjectId);
  const currentProjectQueryId = hasRequestedProjectId ? requestedProjectId : undefined;
  const selectedProjectId = currentProjectQueryId ?? projects[0]?.id;
  const selectedProject =
    activeView === "rekap" && selectedProjectId ? await getProjectDetail(selectedProjectId) : null;
  const recapExpenseCategories =
    activeView === "rekap" && selectedProject
      ? mergeExpenseCategoryOptions(selectedProject.expenses.map((item) => item.category))
      : mergeExpenseCategoryOptions();
  const today = new Date().toISOString().slice(0, 10);
  const scopedReportProjectIds =
    activeView === "rekap" && selectedProject?.project.id && currentProjectQueryId
      ? [selectedProject.project.id]
      : undefined;
  const reportScopeLabel =
    scopedReportProjectIds && selectedProject
      ? `Filter laporan aktif: ${selectedProject.project.name}`
      : "Filter laporan aktif: Semua project";

  const searchKeyword = normalizeSearchText(searchText);
  const kmpProjects = projects.filter((project) =>
    resolveClientScopeKey(project.clientName).includes("kmp cianjur"),
  );
  const kmpProjectCount = kmpProjects.length;
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
  const expenseModalErrorReturnHref = createProjectsHref({
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
  const openKmpMaterialReportHref = createProjectsHref({
    modal: "kmp-material-check",
    searchText,
    view: "list",
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
  const error = typeof params.error === "string" ? params.error : "";

  return (
    <div className="space-y-4">
      <SuccessToast message={success} />
      {error ? (
        <section className="panel border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700">{error}</p>
        </section>
      ) : null}
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
                <InstantModalLink
                  href={openProjectModalHref}
                  prefetch
                  scroll={false}
                  data-ui-button="true"
                  className="button-primary button-sm"
                >
                  <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                    <PlusIcon />
                  </span>
                  Tambah Project
                </InstantModalLink>
                <InstantModalLink
                  href={openExpenseModalHref}
                  prefetch
                  scroll={false}
                  data-ui-button="true"
                  className="button-sm inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <span className="btn-icon icon-float-soft bg-emerald-100 text-emerald-700">
                    <CashInIcon />
                  </span>
                  Input Biaya
                </InstantModalLink>
              </>
            ) : null}
            <InstantModalLink
              href={openDetailSearchModalHref}
              prefetch
              scroll={false}
              data-ui-button="true"
              className="button-soft button-sm"
            >
              <span className="btn-icon bg-slate-100 text-slate-700">
                <SearchIcon />
              </span>
              Cari Rincian
            </InstantModalLink>
            {activeDataSource !== "demo" && canImport ? (
              <InstantModalLink
                href={openImportModalHref}
                prefetch
                scroll={false}
                data-ui-button="true"
                className="button-sm inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                <span className="btn-icon icon-wiggle-soft bg-amber-100 text-amber-700">
                  <ImportIcon />
                </span>
                Import Data Excel
              </InstantModalLink>
            ) : null}
          </div>

          {canExport ? (
          <div className="info-banner xl:col-span-2">
            <p className="info-banner__title">Export Laporan</p>
            <p className="info-banner__text">{reportScopeLabel}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
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
              <ReportCopyButton
                label="Salin Rekapan Project"
                copyPath="/api/reports/expenses/all/text"
                projectIds={scopedReportProjectIds}
                className="button-secondary button-sm"
                successLabel="Rekapan Tersalin"
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
              <ReportCopyButton
                label="Salin Rincian Biaya"
                copyPath="/api/reports/expenses/all/detail/text"
                projectIds={scopedReportProjectIds}
                className="button-soft button-sm"
                successLabel="Rincian Tersalin"
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
          {kmpProjectCount > 0 ? (
            <InstantModalLink
              href={openKmpMaterialReportHref}
              prefetch
              scroll={false}
              data-ui-button="true"
              className="button-soft button-sm"
            >
              <span className="btn-icon bg-amber-100 text-amber-700">
                <SearchIcon />
              </span>
              Cek Material KMP
            </InstantModalLink>
          ) : null}
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
              <InstantModalLink
                href={openDetailSearchModalHref}
                prefetch
                scroll={false}
                data-ui-button="true"
                className="button-soft button-sm"
              >
                <span className="btn-icon bg-slate-100 text-slate-700">
                  <SearchIcon />
                </span>
                Cari Rincian Semua Project
              </InstantModalLink>
            </div>
            <OptimisticDomMutationForm
              id="selected-projects-report-form"
              action={deleteSelectedProjectsAction}
              className="grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-6"
              pendingMessage="Menghapus project terpilih..."
              targetAttribute="data-optimistic-project-id"
              targetField="project"
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
              <ReportCopyButton
                label="Salin Rekapan Terpilih"
                copyPath="/api/reports/expenses/all/text"
                selectedFormId="selected-projects-report-form"
                selectedOnly
                className="button-secondary button-sm"
                successLabel="Rekapan Tersalin"
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
              {canExport ? (
              <ReportCopyButton
                label="Salin Rincian Terpilih"
                copyPath="/api/reports/expenses/all/detail/text"
                selectedFormId="selected-projects-report-form"
                selectedOnly
                className="button-soft button-sm"
                successLabel="Rincian Tersalin"
              />
              ) : null}
              {canEdit ? (
                <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2 xl:col-span-6">
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
                  <OptimisticProjectsBulkEditButton formId="selected-projects-report-form" />
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
            </OptimisticDomMutationForm>
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
                  <tr key={project.id} data-optimistic-project-id={project.id}>
                    <td className="font-medium text-slate-900">
                      <p>{project.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{project.code ?? "-"}</p>
                    </td>
                    <td data-project-field="client_name">{project.clientName ?? "-"}</td>
                    <td>
                      <span
                        data-project-field="status"
                        className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${PROJECT_STATUS_STYLE[project.status]}`}
                      >
                        {project.status}
                      </span>
                    </td>
                    <td data-project-field="start_date">{project.startDate ? formatDate(project.startDate) : "-"}</td>
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
                            <OptimisticDomMutationForm
                              action={deleteProjectAction}
                              pendingMessage={`Menghapus project "${project.name}"...`}
                              targetAttribute="data-optimistic-project-id"
                              targetField="project_id"
                            >
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
                            </OptimisticDomMutationForm>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                <OptimisticPendingProjectRows storedProjects={projects} searchText={searchText} />
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
            <div className="mt-4">
              <ProjectRecapExpenseList
                projectId={selectedProject.project.id}
                expenses={selectedProject.expenses}
                expenseCategories={recapExpenseCategories}
                canEdit={canEdit}
                searchText={searchText}
              />
            </div>
          )}
        </section>
      )}

      <ProjectsModalController
        initialModal={activeModal}
        projects={projects}
        canEdit={canEdit}
        activeDataSource={activeDataSource}
        storageLabel={getStorageLabel()}
        closeModalHref={closeModalHref}
        openExpenseModalHref={openExpenseModalHref}
        expenseModalErrorReturnHref={expenseModalErrorReturnHref}
        openDetailSearchModalHref={openDetailSearchModalHref}
        openKmpMaterialReportHref={openKmpMaterialReportHref}
        detailSearchReturnHref={detailSearchReturnHref}
        currentProjectQueryId={currentProjectQueryId}
        searchText={searchText}
        activeView={activeView}
        detailSearchQuery={detailSearchQuery}
        detailDateFrom={detailDateFrom}
        detailDateTo={detailDateTo}
        detailYear={detailYear}
        hasDetailSearchCriteria={hasDetailSearchCriteria}
        today={today}
        expenseActionToken={expenseActionToken}
        success={success}
        error={error}
      />
    </div>
  );
}
