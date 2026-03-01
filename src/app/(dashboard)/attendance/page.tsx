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
import { canManageData, requireAuthUser } from "@/lib/auth";
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
  const canEdit = canManageData(user.role);
  if (!canEdit) {
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
  const activeModal: ModalType | null =
    modalParam === "rekap-export" || modalParam === "attendance-new" ? modalParam : null;

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
  const selectedProjectLabels = Array.from(
    new Set(
      selectedRows
        .filter((row) => row.teamType !== "spesialis")
        .map((row) => row.projectName ?? "Tanpa Project"),
    ),
  );
  const selectedSpecialistLabels = Array.from(
    new Set(
      selectedRows
        .filter((row) => row.teamType === "spesialis")
        .map((row) => row.specialistTeamName ?? "Tim Spesialis"),
    ),
  );

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

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Daftar Data Absensi</h2>
            <p className="text-xs text-slate-500">
              Data reguler dipisah per project, tim spesialis dipisah lintas project.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={openAttendanceModalHref}
              data-ui-button="true"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 sm:w-auto"
            >
              <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                <PlusIcon />
              </span>
              Input Absensi
            </Link>
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
            <button
              form="attendance-recap-selection-form"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 sm:w-auto"
            >
              Rekap / Export
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {groupedAttendance.map((group) => (
            <article key={group.projectId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-900">{group.projectName}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-slate-500">{group.rows.length} data</p>
                  <AttendanceProjectSelectionToggle
                    formId="attendance-recap-selection-form"
                    scopeKey={`project:${group.projectId}`}
                  />
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[1080px] text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pb-2 text-center font-medium">Pilih</th>
                      <th className="pb-2 font-medium">Pekerja</th>
                      <th className="pb-2 font-medium">Tim</th>
                      <th className="pb-2 text-right font-medium">Hari Kerja</th>
                      <th className="pb-2 text-right font-medium">Upah/Hari</th>
                      <th className="pb-2 text-right font-medium">Lembur (Jam)</th>
                      <th className="pb-2 text-right font-medium">Upah Lembur/Jam</th>
                      <th className="pb-2 text-right font-medium">Kasbon</th>
                      <th className="pb-2 text-right font-medium">Harus Dibayar</th>
                      <th className="pb-2 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((item) => {
                      return (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="py-2 text-center">
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
                          <td className="py-2 font-medium text-slate-900">{item.workerName}</td>
                          <td className="py-2">
                            {item.teamType === "spesialis"
                              ? `Spesialis - ${item.specialistTeamName ?? "Lainnya"}`
                              : WORKER_TEAM_LABEL[item.teamType]}
                          </td>
                          <td className="py-2 text-right">{item.workDays}</td>
                          <td className="py-2 text-right">{formatCurrency(item.dailyWage)}</td>
                          <td className="py-2 text-right">{formatHours(item.overtimeHours)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.overtimeWage)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.kasbonAmount)}</td>
                          <td className="py-2 text-right font-semibold text-emerald-700">
                            {formatCurrency(item.netPay)}
                          </td>
                          <td className="py-2">
                            <div className="flex items-center justify-end gap-3">
                              <Link
                                href={`/attendance/view?id=${item.id}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-900"
                              >
                                <span className="btn-icon bg-blue-100 text-blue-700">
                                  <EyeIcon />
                                </span>
                                Lihat
                              </Link>
                              <Link
                                href={`/attendance/edit?id=${item.id}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
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
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 hover:text-rose-900"
                                  modalDescription="Yakin ingin menghapus data absensi ini?"
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          ))}

          {groupedSpecialistAttendance.map((group) => (
            <article
              key={group.teamKey}
              className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-cyan-900">
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

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[1200px] text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pb-2 text-center font-medium">Pilih</th>
                      <th className="pb-2 font-medium">Pekerja</th>
                      <th className="pb-2 font-medium">Tim Spesialis</th>
                      <th className="pb-2 font-medium">Project</th>
                      <th className="pb-2 text-right font-medium">Hari Kerja</th>
                      <th className="pb-2 text-right font-medium">Upah/Hari</th>
                      <th className="pb-2 text-right font-medium">Lembur (Jam)</th>
                      <th className="pb-2 text-right font-medium">Upah Lembur/Jam</th>
                      <th className="pb-2 text-right font-medium">Kasbon</th>
                      <th className="pb-2 text-right font-medium">Harus Dibayar</th>
                      <th className="pb-2 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((item) => (
                      <tr key={item.id} className="border-t border-cyan-100 align-top">
                        <td className="py-2 text-center">
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
                        <td className="py-2 font-medium text-slate-900">{item.workerName}</td>
                        <td className="py-2">{item.specialistTeamName ?? "Tim Spesialis"}</td>
                        <td className="py-2 text-slate-700">{item.projectName ?? "Tanpa Project"}</td>
                        <td className="py-2 text-right">{item.workDays}</td>
                        <td className="py-2 text-right">{formatCurrency(item.dailyWage)}</td>
                        <td className="py-2 text-right">{formatHours(item.overtimeHours)}</td>
                        <td className="py-2 text-right">{formatCurrency(item.overtimeWage)}</td>
                        <td className="py-2 text-right">{formatCurrency(item.kasbonAmount)}</td>
                        <td className="py-2 text-right font-semibold text-emerald-700">
                          {formatCurrency(item.netPay)}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center justify-end gap-3">
                            <Link
                              href={`/attendance/view?id=${item.id}`}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-900"
                            >
                              <span className="btn-icon bg-blue-100 text-blue-700">
                                <EyeIcon />
                              </span>
                              Lihat
                            </Link>
                            <Link
                              href={`/attendance/edit?id=${item.id}`}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
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
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 hover:text-rose-900"
                                modalDescription="Yakin ingin menghapus data absensi ini?"
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
                  </tbody>
                </table>
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

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Filter Rekap</h2>
            <p className="text-xs text-slate-500">
              Pilih periode dan project untuk menyesuaikan daftar absensi.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">
              Total Upah: {formatCurrency(wageRecap.totalDailyWage)}
            </span>
            <span className="rounded-lg bg-cyan-100 px-3 py-2 text-cyan-700">
              Total Lembur: {formatCurrency(wageRecap.totalOvertimePay)}
            </span>
            <span className="rounded-lg bg-amber-100 px-3 py-2 text-amber-700">
              Total Kasbon: {formatCurrency(wageRecap.totalKasbon)}
            </span>
            <span className="rounded-lg bg-emerald-100 px-3 py-2 text-emerald-700">
              Harus Dibayar: {formatCurrency(wageRecap.totalNetPay)}
            </span>
          </div>
        </div>

        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Dari</label>
            <input type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Sampai</label>
            <input type="date" name="to" defaultValue={to} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
            <select name="project" defaultValue={projectFilter}>
              <option value="">Semua Project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <button className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 sm:col-span-3 sm:w-max">
            Terapkan Filter
          </button>
        </form>
      </section>

      {activeModal ? (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <Link
            href={closeModalHref}
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
                  <p className="mt-1 text-xs text-slate-600">
                    Project terpilih:{" "}
                    {selectedProjectLabels.length > 0 ? selectedProjectLabels.join(", ") : "-"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Tim spesialis terpilih:{" "}
                    {selectedSpecialistLabels.length > 0 ? selectedSpecialistLabels.join(", ") : "-"}
                  </p>
                  <p className="mt-1 text-sm text-slate-800">
                    {selectedRowLabels.length > 0 ? selectedRowLabels.join(", ") : "-"}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Mode rekap</label>
                    <select name="export_mode" defaultValue={selectedRows.length > 0 ? "project" : "selected"}>
                      <option value="selected">Sesuai checklist pekerja</option>
                      <option value="project">Checklist project (otomatis)</option>
                      <option value="specialist">Checklist tim spesialis (lintas project)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Judul custom (opsional)
                    </label>
                    <input name="report_title_custom" placeholder="Contoh: Rekap Upah Minggu Ke-2" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Tim spesialis (jika mode spesialis)
                    </label>
                    <input
                      name="scope_specialist_team_name"
                      placeholder="Contoh: Baja / Listrik / Sipil"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Nama project tim spesialis (opsional)
                    </label>
                    <input
                      name="scope_project_name"
                      placeholder="Kosongkan untuk auto dari data project kerja"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Reimburse (bisa tambah lebih dari satu)</p>
                  <ReimburseLinesInput />
                </div>

                <AttendanceReportExportButtons formId="attendance-export-form" />
              </form>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
