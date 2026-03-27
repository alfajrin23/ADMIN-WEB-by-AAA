import Link from "next/link";
import { redirect } from "next/navigation";
import { createAttendanceAction, deleteAttendanceAction } from "@/app/actions";
import { AttendanceReportExportButtons } from "@/components/attendance-report-export-buttons";
import { AttendanceProjectSelectionToggle } from "@/components/attendance-project-selection-toggle";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import {
  CloseIcon,
  EditIcon,
  EyeIcon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
} from "@/components/icons";
import { ReimburseLinesInput } from "@/components/reimburse-lines-input";
import { RupiahInput } from "@/components/rupiah-input";
import { WORKER_TEAM_LABEL, WORKER_TEAMS } from "@/lib/constants";
import {
  canAccessAttendance,
  canExportReports,
  canManageAttendance,
  requireAuthUser,
} from "@/lib/auth";
import { getProjects, getWageRecap } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

type ModalType = "rekap-export" | "attendance-new";

type AttendancePageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    project?: string;
    selected?: string | string[];
    modal?: string;
  }>;
};

function isDateString(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getMonthStartDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function parseSelectedIds(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.map((item) => item.trim()).filter((item) => item.length > 0);
  return Array.from(new Set(normalized));
}

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  return Number.isInteger(value) ? String(value) : value.toLocaleString("id-ID");
}

function createAttendanceHref(params: {
  from: string;
  to: string;
  project?: string;
  selectedIds?: string[];
  modal?: ModalType;
}) {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
  });
  if (params.project) {
    query.set("project", params.project);
  }
  if (params.modal) {
    query.set("modal", params.modal);
  }
  for (const selectedId of params.selectedIds ?? []) {
    query.append("selected", selectedId);
  }
  return `/attendance?${query.toString()}`;
}

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const user = await requireAuthUser();
  const canEdit = canManageAttendance(user);
  const canExport = canExportReports(user);
  if (!canAccessAttendance(user)) {
    redirect("/");
  }

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = isDateString(params.from) ? String(params.from) : getMonthStartDate();
  const to = isDateString(params.to) ? String(params.to) : today;
  const projectFilter = typeof params.project === "string" ? params.project : "";
  const selectedIds = parseSelectedIds(params.selected);
  const selectedSet = new Set(selectedIds);

  const modalParam = typeof params.modal === "string" ? params.modal : "";
  let activeModal: ModalType | null =
    modalParam === "rekap-export" || modalParam === "attendance-new" ? modalParam : null;
  if (activeModal === "rekap-export" && !canExport) {
    activeModal = null;
  }
  if (activeModal === "attendance-new" && !canEdit) {
    activeModal = null;
  }

  const [projects, wageRecap] = await Promise.all([
    getProjects(),
    getWageRecap({
      from,
      to,
      projectId: projectFilter || undefined,
      includePaid: true,
      recapMode: "gabung",
    }),
  ]);

  const hasProjects = projects.length > 0;
  const hasProjectFilter = projects.some((project) => project.id === projectFilter);
  const createDefaultProjectId = hasProjectFilter ? projectFilter : projects[0]?.id;

  const regularRows = wageRecap.rows.filter((row) => row.teamType !== "spesialis");
  const specialistRows = wageRecap.rows.filter((row) => row.teamType === "spesialis");

  const attendanceByProject = new Map<
    string,
    { projectId: string; projectName: string; rows: typeof wageRecap.rows }
  >();
  for (const row of regularRows) {
    const key = row.projectId || "unknown-project";
    if (!attendanceByProject.has(key)) {
      attendanceByProject.set(key, {
        projectId: key,
        projectName: row.projectName ?? "Tanpa Project",
        rows: [],
      });
    }
    attendanceByProject.get(key)?.rows.push(row);
  }
  const groupedAttendance = Array.from(attendanceByProject.values()).sort((a, b) =>
    a.projectName.localeCompare(b.projectName),
  );
  const attendanceBySpecialistTeam = new Map<
    string,
    { teamKey: string; teamLabel: string; rows: typeof wageRecap.rows }
  >();
  for (const row of specialistRows) {
    const teamLabel = row.specialistTeamName?.trim() || "Tim Spesialis";
    const teamKey = teamLabel.toLowerCase();
    if (!attendanceBySpecialistTeam.has(teamKey)) {
      attendanceBySpecialistTeam.set(teamKey, {
        teamKey,
        teamLabel,
        rows: [],
      });
    }
    attendanceBySpecialistTeam.get(teamKey)?.rows.push(row);
  }
  const groupedSpecialistAttendance = Array.from(attendanceBySpecialistTeam.values()).sort((a, b) =>
    a.teamLabel.localeCompare(b.teamLabel),
  );

  const selectedRows = wageRecap.rows.filter((row) => selectedSet.has(row.id));
  const selectedRowLabels = selectedRows.map(
    (row) => `${row.workerName} (${row.projectName ?? "Tanpa Project"})`,
  );
  const selectedRegularRows = selectedRows.filter((row) => row.teamType !== "spesialis");
  const selectedSpecialistRows = selectedRows.filter((row) => row.teamType === "spesialis");
  const selectedProjectLabels = Array.from(
    new Set(
      selectedRegularRows.map((row) => row.projectName ?? "Tanpa Project"),
    ),
  );
  const selectedSpecialistLabels = Array.from(
    new Set(
      selectedSpecialistRows.map((row) => row.specialistTeamName ?? "Tim Spesialis"),
    ),
  );
  const inferredExportMode =
    selectedRegularRows.length > 0
      ? "project"
      : selectedSpecialistRows.length > 0
        ? "specialist"
        : null;
  const selectedRowPreviewLabels = selectedRowLabels.slice(0, 5);

  const closeModalHref = createAttendanceHref({
    from,
    to,
    project: projectFilter || undefined,
    selectedIds,
  });
  const openAttendanceModalHref = createAttendanceHref({
    from,
    to,
    project: projectFilter || undefined,
    selectedIds,
    modal: "attendance-new",
  });
  const returnToAttendance = closeModalHref;

  return (
    <div className="space-y-4">
      {activeDataSource === "demo" ? (
        <section className="panel border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-700">
            Mode demo aktif. Data absensi dan gaji tidak disimpan permanen.
          </p>
        </section>
      ) : null}
      {activeDataSource === "excel" ? (
        <section className="panel border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">Sumber data aktif: {getStorageLabel()}</p>
        </section>
      ) : null}

      <section className="soft-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Filter Rekap</h2>
            <p className="section-description">
              Pilih periode dan project untuk menyesuaikan daftar absensi.
            </p>
          </div>
          <div className="summary-strip summary-strip--compact sm:min-w-[420px]">
            <article className="soft-card-muted summary-card">
              <span className="summary-label">Total Upah</span>
              <span className="summary-note mt-1 block text-sm font-semibold text-slate-900">
                Total Upah: {formatCurrency(wageRecap.totalDailyWage)}
              </span>
            </article>
            <article className="soft-card-muted summary-card">
              <span className="summary-label">Lembur</span>
              <span className="summary-note mt-1 block text-sm font-semibold text-slate-900">
                Total Lembur: {formatCurrency(wageRecap.totalOvertimePay)}
              </span>
            </article>
            <article className="soft-card-muted summary-card">
              <span className="summary-label">Kasbon</span>
              <span className="summary-note mt-1 block text-sm font-semibold text-slate-900">
                Total Kasbon: {formatCurrency(wageRecap.totalKasbon)}
              </span>
            </article>
            <article className="soft-card-muted summary-card">
              <span className="summary-label">Net Pay</span>
              <span className="summary-note mt-1 block text-sm font-semibold text-slate-900">
                Harus Dibayar: {formatCurrency(wageRecap.totalNetPay)}
              </span>
            </article>
          </div>
        </div>

        <form method="get" className="toolbar-card toolbar-card--dense mt-4 filter-grid sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Dari</label>
            <input type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Sampai</label>
            <input type="date" name="to" defaultValue={to} />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project</label>
            <select name="project" defaultValue={projectFilter}>
              <option value="">Semua Project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <button className="button-primary button-sm sm:col-span-3 sm:w-max">
            Terapkan Filter
          </button>
        </form>
      </section>

      <section className="soft-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Daftar Data Absensi</h2>
            <p className="section-description">
              Data reguler dipisah per project, tim spesialis dipisah lintas project.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <Link
                href={openAttendanceModalHref}
                prefetch
                scroll={false}
                data-ui-button="true"
                className="button-primary button-sm sm:w-auto"
              >
                <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                  <PlusIcon />
                </span>
                Input Absensi
              </Link>
            ) : null}
            <form
              id="attendance-recap-selection-form"
              action="/attendance"
              method="get"
              className="hidden"
            >
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <input type="hidden" name="project" value={projectFilter} />
              <input type="hidden" name="modal" value="rekap-export" />
            </form>
            {canExport ? (
              <button
                form="attendance-recap-selection-form"
                className="button-secondary button-sm sm:w-auto"
              >
                Rekap / Export
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {groupedAttendance.map((group) => (
            <article key={group.projectId} className="soft-card p-3.5 md:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{group.projectName}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-slate-500">{group.rows.length} data</p>
                  <AttendanceProjectSelectionToggle
                    formId="attendance-recap-selection-form"
                    scopeKey={`project:${group.projectId}`}
                  />
                </div>
              </div>

              <div className="mt-3 table-card">
                <div className="data-table-shell">
                <table className="data-table data-table--sticky data-table--compact min-w-[860px] table-fixed text-[11px] leading-5 sm:text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="w-10 text-center">Pilih</th>
                      <th>Pekerja</th>
                      <th>Kehadiran</th>
                      <th>Tarif</th>
                      <th>Pembayaran</th>
                      <th className="w-48 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((item) => {
                      return (
                        <tr key={item.id} className="align-top">
                          <td className="w-10 text-center">
                            <input
                              type="checkbox"
                              name="selected"
                              value={item.id}
                              form="attendance-recap-selection-form"
                              data-attendance-selection="true"
                              data-attendance-scope={`project:${group.projectId}`}
                              defaultChecked={selectedSet.has(item.id)}
                              aria-label={`Pilih ${item.workerName}`}
                            />
                          </td>
                          <td>
                            <p className="font-semibold text-slate-900">{item.workerName}</p>
                            <p className="text-slate-600">
                              {item.teamType === "spesialis"
                                ? `Spesialis - ${item.specialistTeamName ?? "Lainnya"}`
                                : WORKER_TEAM_LABEL[item.teamType]}
                            </p>
                          </td>
                          <td className="text-slate-700">
                            <p>Hari kerja: {item.workDays}</p>
                            <p>Lembur: {formatHours(item.overtimeHours)} jam</p>
                          </td>
                          <td className="text-slate-700">
                            <p>Harian: {formatCurrency(item.dailyWage)}</p>
                            <p>Lembur/Jam: {formatCurrency(item.overtimeWage)}</p>
                          </td>
                          <td className="text-slate-700">
                            <p>Kasbon: {formatCurrency(item.kasbonAmount)}</p>
                            <p className="font-semibold text-emerald-700">
                              Net: {formatCurrency(item.netPay)}
                            </p>
                          </td>
                          <td className="w-48">
                            <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                              <Link
                                href={`/attendance/view?id=${item.id}`}
                                className="button-secondary button-xs sm:min-w-[96px] sm:justify-start"
                              >
                                <span className="btn-icon bg-blue-100 text-blue-700">
                                  <EyeIcon />
                                </span>
                                Lihat
                              </Link>
                              {canEdit ? (
                                <>
                                  <Link
                                    href={`/attendance/edit?id=${item.id}`}
                                    className="button-soft button-xs sm:min-w-[96px] sm:justify-start"
                                  >
                                    <span className="btn-icon bg-emerald-100 text-emerald-700">
                                      <EditIcon />
                                    </span>
                                    Edit
                                  </Link>
                                  <form action={deleteAttendanceAction}>
                                    <input type="hidden" name="attendance_id" value={item.id} />
                                    <input type="hidden" name="return_to" value={returnToAttendance} />
                                    <ConfirmActionButton
                                      className="button-danger button-xs sm:min-w-[96px] sm:justify-start"
                                      modalDescription="Yakin ingin menghapus data absensi ini?"
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
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </article>
          ))}

          {groupedSpecialistAttendance.map((group) => (
            <article
              key={group.teamKey}
              className="soft-card p-3.5 md:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-cyan-900">
                  Tim Spesialis - {group.teamLabel}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-cyan-700">{group.rows.length} data</p>
                  <AttendanceProjectSelectionToggle
                    formId="attendance-recap-selection-form"
                    scopeKey={`specialist:${group.teamKey}`}
                  />
                </div>
              </div>

              <div className="mt-3 table-card">
                <div className="data-table-shell">
                <table className="data-table data-table--sticky data-table--compact min-w-[860px] table-fixed text-[11px] leading-5 sm:text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="w-10 text-center">Pilih</th>
                      <th>Pekerja</th>
                      <th>Kehadiran</th>
                      <th>Tarif</th>
                      <th>Pembayaran</th>
                      <th className="w-48 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="w-10 text-center">
                          <input
                            type="checkbox"
                            name="selected"
                            value={item.id}
                            form="attendance-recap-selection-form"
                            data-attendance-selection="true"
                            data-attendance-scope={`specialist:${group.teamKey}`}
                            defaultChecked={selectedSet.has(item.id)}
                            aria-label={`Pilih ${item.workerName}`}
                          />
                        </td>
                        <td>
                          <p className="font-semibold text-slate-900">{item.workerName}</p>
                          <p className="text-cyan-800">
                            Tim: {item.specialistTeamName ?? "Tim Spesialis"}
                          </p>
                          <p className="text-slate-600">
                            Project: {item.projectName ?? "Tanpa Project"}
                          </p>
                        </td>
                        <td className="text-slate-700">
                          <p>Hari kerja: {item.workDays}</p>
                          <p>Lembur: {formatHours(item.overtimeHours)} jam</p>
                        </td>
                        <td className="text-slate-700">
                          <p>Harian: {formatCurrency(item.dailyWage)}</p>
                          <p>Lembur/Jam: {formatCurrency(item.overtimeWage)}</p>
                        </td>
                        <td className="text-slate-700">
                          <p>Kasbon: {formatCurrency(item.kasbonAmount)}</p>
                          <p className="font-semibold text-emerald-700">
                            Net: {formatCurrency(item.netPay)}
                          </p>
                        </td>
                        <td className="w-48">
                          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                            <Link
                              href={`/attendance/view?id=${item.id}`}
                              className="button-secondary button-xs sm:min-w-[96px] sm:justify-start"
                            >
                              <span className="btn-icon bg-blue-100 text-blue-700">
                                <EyeIcon />
                              </span>
                              Lihat
                            </Link>
                            {canEdit ? (
                              <>
                                <Link
                                  href={`/attendance/edit?id=${item.id}`}
                                  className="button-soft button-xs sm:min-w-[96px] sm:justify-start"
                                >
                                  <span className="btn-icon bg-emerald-100 text-emerald-700">
                                    <EditIcon />
                                  </span>
                                  Edit
                                </Link>
                                <form action={deleteAttendanceAction}>
                                  <input type="hidden" name="attendance_id" value={item.id} />
                                  <input type="hidden" name="return_to" value={returnToAttendance} />
                                  <ConfirmActionButton
                                    className="button-danger button-xs sm:min-w-[96px] sm:justify-start"
                                    modalDescription="Yakin ingin menghapus data absensi ini?"
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
                  </tbody>
                </table>
                </div>
              </div>
            </article>
          ))}

          {groupedAttendance.length === 0 && groupedSpecialistAttendance.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
              Belum ada data absensi pada filter ini.
            </p>
          ) : null}
        </div>
      </section>

      {activeModal ? (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <Link
            href={closeModalHref}
            prefetch
            scroll={false}
            aria-label="Tutup modal"
            className="absolute inset-0 bg-slate-950/45"
          />
          <section className="modal-card panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                {activeModal === "attendance-new" ? "Input Absensi" : "Rekap & Export Pekerja"}
              </h2>
              <Link
                href={closeModalHref}
                prefetch
                scroll={false}
                data-ui-button="true"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                <span className="btn-icon bg-slate-100 text-slate-600">
                  <CloseIcon />
                </span>
                Tutup
              </Link>
            </div>

            {activeModal === "attendance-new" ? (
              <form action={createAttendanceAction} className="mt-4 space-y-3">
                <input type="hidden" name="return_to" value={closeModalHref} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
                  {hasProjects ? (
                    <select name="project_id" defaultValue={createDefaultProjectId}>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      Buat project dahulu di menu Proyek & Biaya.
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Nama pekerja</label>
                  <input name="worker_name" required placeholder="Contoh: Andi" autoFocus />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Tim</label>
                    <select name="team_type" defaultValue="tukang">
                      {WORKER_TEAMS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Tim spesialis (opsional)
                    </label>
                    <input
                      name="specialist_team_name"
                      placeholder="Contoh: Baja / Listrik / Sipil"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Jumlah hari kerja
                    </label>
                    <input type="number" name="work_days" min={1} max={31} defaultValue={1} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Upah harian</label>
                    <RupiahInput name="daily_wage" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Lembur (jam)
                    </label>
                    <input type="number" name="overtime_hours" min={0} step="0.5" defaultValue={0} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Upah lembur / jam
                    </label>
                    <RupiahInput name="overtime_wage" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Kasbon</label>
                  <RupiahInput name="kasbon_amount" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
                  <textarea name="notes" rows={3} placeholder="Opsional" />
                </div>
                <button
                  disabled={!hasProjects}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                    <SaveIcon />
                  </span>
                  Simpan Absensi
                </button>
              </form>
            ) : (
              <form id="attendance-export-form" method="get" className="mt-4 space-y-4">
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <input type="hidden" name="project" value={projectFilter} />
                {selectedIds.map((selectedId) => (
                  <input key={selectedId} type="hidden" name="selected" value={selectedId} />
                ))}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-600">
                    Data terpilih via checklist: {selectedRows.length}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">
                    Mode otomatis:{" "}
                    {inferredExportMode === "project"
                      ? "Rekap Project"
                      : inferredExportMode === "specialist"
                        ? "Rekap Tim Spesialis"
                        : "Belum ada checklist"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Project terpilih:{" "}
                    {selectedProjectLabels.length > 0 ? selectedProjectLabels.join(", ") : "-"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Tim spesialis terpilih:{" "}
                    {selectedSpecialistLabels.length > 0 ? selectedSpecialistLabels.join(", ") : "-"}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    Jika checklist project, sistem otomatis export seluruh pekerja non-spesialis pada
                    project tersebut. Jika hanya checklist tim spesialis, sistem otomatis menampilkan
                    tim spesialis beserta project tempat mereka bekerja.
                  </p>
                  {selectedRowPreviewLabels.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-700">
                      Contoh data dipilih: {selectedRowPreviewLabels.join(", ")}
                      {selectedRowLabels.length > selectedRowPreviewLabels.length
                        ? ` +${selectedRowLabels.length - selectedRowPreviewLabels.length} lainnya`
                        : ""}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Judul custom (opsional)
                  </label>
                  <input name="report_title_custom" placeholder="Contoh: Rekap Upah Minggu Ke-2" />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Reimburse (bisa tambah lebih dari satu)</p>
                  <ReimburseLinesInput />
                </div>

                {selectedRows.length > 0 ? (
                  <AttendanceReportExportButtons formId="attendance-export-form" />
                ) : (
                  <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    Checklist data absensi dulu sebelum export.
                  </p>
                )}
              </form>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
