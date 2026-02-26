import Link from "next/link";
import {
  createExpenseAction,
  createProjectAction,
  deleteExpenseAction,
  deleteProjectAction,
  deleteSelectedProjectsAction,
  importExcelTemplateAction,
} from "@/app/actions";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import {
  CashInIcon,
  CloseIcon,
  EditIcon,
  EyeIcon,
  ImportIcon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
} from "@/components/icons";
import { ExcelDropInput } from "@/components/excel-drop-input";
import { EnterToNextField } from "@/components/enter-to-next-field";
import { ProjectChecklistSearch } from "@/components/project-checklist-search";
import { ProjectAutocomplete } from "@/components/project-autocomplete";
import { ReportDownloadPreviewButton } from "@/components/report-download-preview-button";
import { ProjectsSelectionToggle } from "@/components/projects-selection-toggle";
import { ProjectsSearchInput } from "@/components/projects-search-input";
import { RupiahInput } from "@/components/rupiah-input";
import {
  COST_CATEGORIES,
  getCostCategoryLabel,
  getCostCategoryStyle,
  PROJECT_STATUSES,
  PROJECT_STATUS_STYLE,
  SPECIALIST_COST_PRESETS,
} from "@/lib/constants";
import {
  getExpenseCategories,
  getProjectDetail,
  getProjects,
  searchExpenseDetails,
} from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

type ModalType = "project-new" | "expense-new" | "excel-import" | "detail-search";
type ProjectView = "list" | "rekap";

type ProjectPageProps = {
  searchParams: Promise<{
    project?: string;
    modal?: string;
    q?: string;
    detail_q?: string;
    view?: string;
  }>;
};

function normalizeSearchText(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function createProjectsHref(params: {
  projectId?: string;
  modal?: ModalType;
  searchText?: string;
  detailSearchQuery?: string;
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
  const queryText = query.toString();
  return queryText ? `/projects?${queryText}` : "/projects";
}

export default async function ProjectsPage({ searchParams }: ProjectPageProps) {
  const params = await searchParams;
  const [projects, expenseCategories] = await Promise.all([getProjects(), getExpenseCategories()]);
  const today = new Date().toISOString().slice(0, 10);
  const defaultExpenseCategory = expenseCategories[0]?.value ?? COST_CATEGORIES[0].value;

  const requestedProjectId =
    typeof params.project === "string" ? params.project : undefined;
  const selectedProjectId =
    projects.find((item) => item.id === requestedProjectId)?.id ?? projects[0]?.id;
  const viewParam = typeof params.view === "string" ? params.view : "";
  const activeView: ProjectView = viewParam === "rekap" ? "rekap" : "list";
  const selectedProject =
    activeView === "rekap" && selectedProjectId
      ? await getProjectDetail(selectedProjectId)
      : null;
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

  const modalParam = typeof params.modal === "string" ? params.modal : "";
  const detailSearchQuery = typeof params.detail_q === "string" ? params.detail_q.trim() : "";
  const activeModal: ModalType | null =
    modalParam === "project-new" ||
    modalParam === "expense-new" ||
    modalParam === "excel-import" ||
    modalParam === "detail-search"
      ? modalParam
      : null;
  const detailSearchResults =
    activeModal === "detail-search" && detailSearchQuery
      ? await searchExpenseDetails(detailSearchQuery, 240)
      : [];
  const closeModalHref = createProjectsHref({
    projectId: selectedProjectId,
    searchText,
    view: activeView,
  });
  const openProjectModalHref = createProjectsHref({
    projectId: selectedProjectId,
    modal: "project-new",
    searchText,
    view: activeView,
  });
  const openExpenseModalHref = createProjectsHref({
    projectId: selectedProjectId,
    modal: "expense-new",
    searchText,
    view: activeView,
  });
  const openImportModalHref = createProjectsHref({
    projectId: selectedProjectId,
    modal: "excel-import",
    searchText,
    view: activeView,
  });
  const openDetailSearchModalHref = createProjectsHref({
    projectId: selectedProjectId,
    modal: "detail-search",
    searchText,
    view: activeView,
  });
  const listViewHref = createProjectsHref({
    projectId: selectedProjectId,
    searchText,
    view: "list",
  });
  const recapViewHref = createProjectsHref({
    projectId: selectedProjectId,
    searchText,
    view: "rekap",
  });

  return (
    <div className="space-y-4">
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

      <section className="panel p-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Manajemen Project</h2>
            <p className="text-xs text-slate-500">
              Form tambah project dan input biaya sekarang tampil sebagai modal overlay.
            </p>
          </div>
          <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
            <Link
              href={openProjectModalHref}
              data-ui-button="true"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                <PlusIcon />
              </span>
              Tambah Project
            </Link>
            <Link
              href={openExpenseModalHref}
              data-ui-button="true"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              <span className="btn-icon icon-float-soft bg-white/20 text-white">
                <CashInIcon />
              </span>
              Input Biaya
            </Link>
            <Link
              href={openDetailSearchModalHref}
              data-ui-button="true"
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-100"
            >
              Cari Rincian
            </Link>
            {activeDataSource !== "demo" ? (
              <Link
                href={openImportModalHref}
                data-ui-button="true"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <span className="btn-icon icon-wiggle-soft bg-emerald-100 text-emerald-700">
                  <ImportIcon />
                </span>
                Import Data Excel
              </Link>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 xl:col-span-2">
            <p className="mb-2 text-xs font-semibold text-slate-600">Export Laporan (Preview dulu)</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <ReportDownloadPreviewButton
                label="PDF Rekapan Project"
                iconType="pdf"
                downloadPath="/api/reports/expenses/all"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
              />
              <ReportDownloadPreviewButton
                label="Excel Rekapan Project"
                iconType="excel"
                downloadPath="/api/reports/expenses/all/excel"
                previewPath="/api/reports/expenses/all"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              />
              <ReportDownloadPreviewButton
                label="PDF Rincian Biaya"
                iconType="detail"
                downloadPath="/api/reports/expenses/all/detail"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
              />
              <ReportDownloadPreviewButton
                label="Excel Rincian Biaya"
                iconType="excel"
                downloadPath="/api/reports/expenses/all/detail/excel"
                previewPath="/api/reports/expenses/all/detail"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={listViewHref}
            data-ui-button="true"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
              activeView === "list"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            Daftar Project
          </Link>
          <Link
            href={recapViewHref}
            data-ui-button="true"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
              activeView === "rekap"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            Rekap Biaya
          </Link>
        </div>
      </section>

      {activeView === "list" ? (
        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Daftar Project</h2>
            <p className="text-xs text-slate-500">
              Menampilkan {filteredProjects.length} dari {projects.length} project
            </p>
          </div>
          <ProjectsSearchInput initialValue={searchText} />
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ProjectsSelectionToggle formId="selected-projects-report-form" />
              <Link
                href={openDetailSearchModalHref}
                data-ui-button="true"
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
              >
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
                  projectId: selectedProjectId,
                  searchText,
                  view: "list",
                })}
              />
              <ReportDownloadPreviewButton
                label="PDF Rekapan Terpilih"
                iconType="pdf"
                downloadPath="/api/reports/expenses/all"
                selectedFormId="selected-projects-report-form"
                selectedOnly
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-600"
              />
              <ReportDownloadPreviewButton
                label="Excel Rekapan Terpilih"
                iconType="excel"
                downloadPath="/api/reports/expenses/all/excel"
                previewPath="/api/reports/expenses/all"
                selectedFormId="selected-projects-report-form"
                selectedOnly
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
              />
              <ReportDownloadPreviewButton
                label="PDF Rincian Biaya Terpilih"
                iconType="detail"
                downloadPath="/api/reports/expenses/all/detail"
                selectedFormId="selected-projects-report-form"
                selectedOnly
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600"
              />
              <ReportDownloadPreviewButton
                label="Excel Rincian Biaya Terpilih"
                iconType="excel"
                downloadPath="/api/reports/expenses/all/detail/excel"
                previewPath="/api/reports/expenses/all/detail"
                selectedFormId="selected-projects-report-form"
                selectedOnly
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-600"
              />
              <ConfirmActionButton
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                modalDescription="Yakin ingin menghapus semua project yang dipilih beserta data biaya dan absensinya?"
                confirmLabel="Ya, Hapus Semua"
              >
                <span className="btn-icon bg-rose-100 text-rose-700">
                  <TrashIcon />
                </span>
                Hapus Project Terpilih
              </ConfirmActionButton>
            </form>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2 font-medium">Nama</th>
                  <th className="pb-2 font-medium">Klien</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Mulai</th>
                  <th className="pb-2 text-center font-medium">Pilih</th>
                  <th className="pb-2 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-900">
                      <p>{project.name}</p>
                      <p className="text-xs text-slate-500">{project.code ?? "-"}</p>
                    </td>
                    <td className="py-2">{project.clientName ?? "-"}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${PROJECT_STATUS_STYLE[project.status]}`}
                      >
                        {project.status}
                      </span>
                    </td>
                    <td className="py-2">{project.startDate ? formatDate(project.startDate) : "-"}</td>
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        name="project"
                        value={project.id}
                        form="selected-projects-report-form"
                        data-project-selection="true"
                        aria-label={`Pilih ${project.name} untuk laporan`}
                      />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={createProjectsHref({
                            projectId: project.id,
                            searchText,
                            view: "rekap",
                          })}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                        >
                          <span className="btn-icon bg-blue-100 text-blue-700">
                            <EyeIcon />
                          </span>
                          Lihat
                        </Link>
                        <Link
                          href={`/projects/edit?id=${project.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
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
                                selectedProjectId && selectedProjectId !== project.id
                                  ? selectedProjectId
                                  : undefined,
                              searchText,
                              view: "list",
                            })}
                          />
                          <ConfirmActionButton
                            className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-900"
                            modalDescription={`Yakin ingin menghapus project "${project.name}" beserta semua datanya?`}
                          >
                            <span className="btn-icon bg-rose-100 text-rose-700">
                              <TrashIcon />
                            </span>
                            Hapus
                          </ConfirmActionButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">
                      Project tidak ditemukan untuk kata kunci &quot;{searchText}&quot;.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              <span className="typing-title">Rekap Proyek</span>
              <span className="ml-1 text-slate-600">- {selectedProject?.project.name ?? "Project"}</span>
            </h2>
            {selectedProject ? (
              <ReportDownloadPreviewButton
                label="Download PDF Biaya Project"
                iconType="pdf"
                downloadPath={`/api/reports/expenses?project=${selectedProject.project.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-600"
              />
            ) : null}
          </div>
          {!selectedProject ? (
            <p className="mt-3 text-sm text-slate-500">Data project belum tersedia.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {selectedProject.categoryTotals.map((item) => (
                  <div key={item.category} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
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

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-600">
                      <th className="w-[130px] border border-slate-200 px-3 py-2 font-medium">Tanggal</th>
                      <th className="w-[170px] border border-slate-200 px-3 py-2 font-medium">Nama Pengaju</th>
                      <th className="w-[170px] border border-slate-200 px-3 py-2 font-medium">Kategori</th>
                      <th className="border border-slate-200 px-3 py-2 font-medium">Rincian</th>
                      <th className="w-[150px] border border-slate-200 px-3 py-2 font-medium">Vendor</th>
                      <th className="w-[140px] border border-slate-200 px-3 py-2 text-right font-medium">Nominal</th>
                      <th className="w-[140px] border border-slate-200 px-3 py-2 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recapExpenses.map((item) => (
                      <tr key={item.id} className="bg-white">
                        <td className="border border-slate-200 px-3 py-2 align-top">
                          {formatDate(item.expenseDate)}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 align-top">
                          {item.requesterName ?? "-"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 align-top">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${getCostCategoryStyle(item.category)}`}
                          >
                            {getCostCategoryLabel(item.category)}
                          </span>
                          {item.specialistType ? (
                            <p className="mt-1 text-[11px] font-medium text-cyan-700">
                              Spesialis: {item.specialistType}
                            </p>
                          ) : null}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 align-top">
                          <p>{item.description ?? "-"}</p>
                          <p className="text-xs text-slate-500">
                            {item.usageInfo ?? "-"} | {item.quantity} {item.unitLabel ?? "unit"} @{" "}
                            {formatCurrency(item.unitPrice)}
                          </p>
                        </td>
                        <td className="border border-slate-200 px-3 py-2 align-top">
                          {item.recipientName ?? "-"}
                        </td>
                        <td
                          className={`border border-slate-200 px-3 py-2 text-right font-semibold ${
                            item.amount < 0 ? "text-rose-700" : "text-emerald-700"
                          }`}
                        >
                          {item.amount < 0 ? "-" : "+"}
                          {formatCurrency(Math.abs(item.amount))}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 align-top">
                          <div className="flex justify-end gap-3">
                            <Link
                              href={`/projects/expenses/edit?id=${item.id}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
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
                                className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-900"
                                modalDescription="Yakin ingin menghapus data biaya ini?"
                              >
                                <span className="btn-icon bg-rose-100 text-rose-700">
                                  <TrashIcon />
                                </span>
                                Hapus
                              </ConfirmActionButton>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {recapExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="border border-slate-200 px-3 py-4 text-center text-slate-500">
                          Belum ada transaksi biaya.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
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
            <div className="flex items-center justify-between">
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
                <form method="get" className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  {selectedProjectId ? <input type="hidden" name="project" value={selectedProjectId} /> : null}
                  {searchText ? <input type="hidden" name="q" value={searchText} /> : null}
                  <input type="hidden" name="view" value={activeView} />
                  <input type="hidden" name="modal" value="detail-search" />
                  <input
                    name="detail_q"
                    defaultValue={detailSearchQuery}
                    placeholder="Contoh: hebel, baut, mesin bor"
                    autoFocus
                    autoComplete="off"
                  />
                  <button className="inline-flex items-center justify-center rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-600">
                    Cari Rincian
                  </button>
                </form>

                {!detailSearchQuery ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                    Isi kata kunci rincian untuk mencari data di semua project.
                  </p>
                ) : detailSearchResults.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-700">
                    Data rincian &quot;{detailSearchQuery}&quot; tidak ditemukan di semua project.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      Ditemukan {detailSearchResults.length} data rincian untuk kata kunci &quot;
                      {detailSearchQuery}&quot;.
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full min-w-[760px] border-collapse text-sm">
                        <thead className="bg-slate-50">
                          <tr className="text-left text-slate-500">
                            <th className="w-[120px] border border-slate-200 px-3 py-2 font-medium">Tanggal</th>
                            <th className="w-[180px] border border-slate-200 px-3 py-2 font-medium">Project</th>
                            <th className="w-[160px] border border-slate-200 px-3 py-2 font-medium">Nama Pengaju</th>
                            <th className="border border-slate-200 px-3 py-2 font-medium">Keterangan</th>
                            <th className="w-[140px] border border-slate-200 px-3 py-2 text-right font-medium">Nominal</th>
                            <th className="w-[120px] border border-slate-200 px-3 py-2 text-right font-medium">Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailSearchResults.map((item) => (
                            <tr key={item.expenseId}>
                              <td className="border border-slate-200 px-3 py-2 align-top">{formatDate(item.expenseDate)}</td>
                              <td className="border border-slate-200 px-3 py-2 align-top font-medium text-slate-900">{item.projectName}</td>
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
                                <Link
                                  href={createProjectsHref({
                                    projectId: item.projectId,
                                    searchText,
                                    view: "rekap",
                                  })}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                                >
                                  <span className="btn-icon bg-blue-100 text-blue-700">
                                    <EyeIcon />
                                  </span>
                                  Lihat Rekap
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
                <input type="hidden" name="return_to" value={closeModalHref} />
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                  Field wajib
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
                  <ProjectAutocomplete projects={projects} initialProjectId={selectedProjectId} />
                  <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                      Masukkan data yang sama ke project lain (opsional)
                    </summary>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Data akan disimpan ke project utama di atas, plus project tambahan yang Anda centang.
                    </p>
                    <ProjectChecklistSearch
                      projects={projects}
                      excludeProjectId={selectedProjectId}
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
                    <input name="requester_name" required />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
                  <input
                    name="description"
                    placeholder="Contoh: KAS / MATERIAL / OPERASIONAL"
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Mode transaksi
                    </label>
                    <select name="amount_mode" defaultValue="tambah">
                      <option value="tambah">Tambah</option>
                      <option value="kurangi">Kurangi</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Nominal biaya total
                    </label>
                    <RupiahInput name="amount" required placeholder="Contoh: 1.000.000" />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  Field opsional
                </div>
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
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Catatan mode
                  </label>
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Pilih <strong>Tambah</strong> untuk menambah biaya, pilih <strong>Kurangi</strong>{" "}
                    untuk pengurangan biaya/correksi.
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
