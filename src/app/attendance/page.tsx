import Link from "next/link";
import {
  confirmPayrollPaidAction,
  createAttendanceAction,
  deleteAttendanceAction,
} from "@/app/actions";
import {
  CashInIcon,
  CloseIcon,
  EditIcon,
  ExcelIcon,
  EyeIcon,
  PdfIcon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
} from "@/components/icons";
import { RupiahInput } from "@/components/rupiah-input";
import { ATTENDANCE_STATUSES, WORKER_TEAM_LABEL, WORKER_TEAMS } from "@/lib/constants";
import { getProjects, getWageRecap } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

type ModalType = "rekap-export" | "attendance-new" | "payroll-confirm";

type AttendancePageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    project?: string;
    worker?: string | string[];
    modal?: string;
    attendance?: string;
  }>;
};

function isDateString(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getMonthStartDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function parseWorkers(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.map((item) => item.trim()).filter((item) => item.length > 0);
  return Array.from(new Set(normalized));
}

function createAttendanceHref(params: {
  from: string;
  to: string;
  project?: string;
  workers?: string[];
  modal?: ModalType;
  attendanceId?: string;
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
  if (params.attendanceId) {
    query.set("attendance", params.attendanceId);
  }
  for (const worker of params.workers ?? []) {
    query.append("worker", worker);
  }
  return `/attendance?${query.toString()}`;
}

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = isDateString(params.from) ? String(params.from) : getMonthStartDate();
  const to = isDateString(params.to) ? String(params.to) : today;
  const projectFilter = typeof params.project === "string" ? params.project : "";
  const selectedWorkers = parseWorkers(params.worker);
  const selectedAttendanceId = typeof params.attendance === "string" ? params.attendance : "";
  const modalParam = typeof params.modal === "string" ? params.modal : "";
  const activeModal: ModalType | null =
    modalParam === "rekap-export" || modalParam === "attendance-new" || modalParam === "payroll-confirm"
      ? modalParam
      : null;

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
  const selectedWorkerSet = new Set(selectedWorkers.map((item) => item.trim().toLowerCase()));

  const attendanceByProject = new Map<
    string,
    { projectId: string; projectName: string; rows: typeof wageRecap.rows }
  >();
  for (const row of wageRecap.rows) {
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

  const payrollTarget =
    activeModal === "payroll-confirm"
      ? wageRecap.rows.find((item) => item.id === selectedAttendanceId) ?? null
      : null;

  const closeModalHref = createAttendanceHref({
    from,
    to,
    project: projectFilter || undefined,
    workers: selectedWorkers,
  });
  const openAttendanceModalHref = createAttendanceHref({
    from,
    to,
    project: projectFilter || undefined,
    workers: selectedWorkers,
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
            <h2 className="text-lg font-semibold text-slate-900">Daftar Data Absensi</h2>
            <p className="text-xs text-slate-500">
              Daftar dipisah per project dalam satu tampilan. Centang pekerja lalu rekap.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={openAttendanceModalHref}
              data-ui-button="true"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
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
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
            >
              Rekap Pekerja Terpilih
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {groupedAttendance.map((group) => (
            <article key={group.projectId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{group.projectName}</h3>
                <p className="text-xs text-slate-500">{group.rows.length} data</p>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[1020px] text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pb-2 text-center font-medium">Pilih</th>
                      <th className="pb-2 font-medium">Tanggal</th>
                      <th className="pb-2 font-medium">Pekerja</th>
                      <th className="pb-2 font-medium">Tim</th>
                      <th className="pb-2 text-right font-medium">Hari Kerja</th>
                      <th className="pb-2 text-right font-medium">Gaji/Hari</th>
                      <th className="pb-2 text-right font-medium">Kasbon</th>
                      <th className="pb-2 text-right font-medium">Harus Dibayar</th>
                      <th className="pb-2 font-medium">Status Gaji</th>
                      <th className="pb-2 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((item) => {
                      const workerKey = item.workerName.trim().toLowerCase();
                      const openPayrollModalHref = createAttendanceHref({
                        from,
                        to,
                        project: projectFilter || undefined,
                        workers: selectedWorkers,
                        modal: "payroll-confirm",
                        attendanceId: item.id,
                      });

                      return (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="py-2 text-center">
                            <input
                              type="checkbox"
                              name="worker"
                              value={item.workerName}
                              form="attendance-recap-selection-form"
                              defaultChecked={selectedWorkerSet.has(workerKey)}
                              aria-label={`Pilih ${item.workerName}`}
                            />
                          </td>
                          <td className="py-2">{formatDate(item.attendanceDate)}</td>
                          <td className="py-2 font-medium text-slate-900">{item.workerName}</td>
                          <td className="py-2">
                            {item.teamType === "spesialis"
                              ? `Spesialis - ${item.specialistTeamName ?? "Lainnya"}`
                              : WORKER_TEAM_LABEL[item.teamType]}
                          </td>
                          <td className="py-2 text-right">{item.workDays}</td>
                          <td className="py-2 text-right">{formatCurrency(item.dailyWage)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.kasbonAmount)}</td>
                          <td className="py-2 text-right font-semibold text-emerald-700">
                            {formatCurrency(item.netPay)}
                          </td>
                          <td className="py-2">
                            {item.payrollPaid ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                                Sudah Digaji
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                                Belum Digaji
                              </span>
                            )}
                          </td>
                          <td className="py-2">
                            <div className="flex items-center justify-end gap-3">
                              {!item.payrollPaid ? (
                                <Link
                                  href={openPayrollModalHref}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
                                >
                                  <span className="btn-icon bg-indigo-100 text-indigo-700">
                                    <CashInIcon />
                                  </span>
                                  Konfirmasi
                                </Link>
                              ) : null}
                              <Link
                                href={`/attendance/view?id=${item.id}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                              >
                                <span className="btn-icon bg-blue-100 text-blue-700">
                                  <EyeIcon />
                                </span>
                                Lihat
                              </Link>
                              <Link
                                href={`/attendance/edit?id=${item.id}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
                              >
                                <span className="btn-icon bg-emerald-100 text-emerald-700">
                                  <EditIcon />
                                </span>
                                Edit
                              </Link>
                              <form action={deleteAttendanceAction}>
                                <input type="hidden" name="attendance_id" value={item.id} />
                                <input type="hidden" name="return_to" value={returnToAttendance} />
                                <button className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-900">
                                  <span className="btn-icon bg-rose-100 text-rose-700">
                                    <TrashIcon />
                                  </span>
                                  Hapus
                                </button>
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

          {groupedAttendance.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Belum ada data absensi pada filter ini.
            </p>
          ) : null}
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Filter Rekap</h2>
            <p className="text-xs text-slate-500">
              Pilih periode dan project. Pemilihan pekerja dilakukan di daftar absensi.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">
              Total Gaji: {formatCurrency(wageRecap.totalDailyWage)}
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
          <button className="inline-flex w-max items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 sm:col-span-3">
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
          <section className="modal-card panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {activeModal === "attendance-new"
                  ? "Input Absensi"
                  : activeModal === "payroll-confirm"
                    ? "Konfirmasi Status Gaji"
                    : "Rekap & Export Pekerja"}
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
                  <input name="worker_name" required placeholder="Contoh: Andi" />
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
                    <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
                    <select name="status" defaultValue={ATTENDANCE_STATUSES[0].value}>
                      {ATTENDANCE_STATUSES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal</label>
                    <input type="date" name="attendance_date" defaultValue={today} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Jumlah hari kerja
                    </label>
                    <input type="number" name="work_days" min={1} max={31} defaultValue={1} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Gaji harian</label>
                    <RupiahInput name="daily_wage" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Kasbon</label>
                    <RupiahInput name="kasbon_amount" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Catatan</label>
                  <textarea name="notes" rows={3} placeholder="Opsional" />
                </div>
                <button
                  disabled={!hasProjects}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                    <SaveIcon />
                  </span>
                  Simpan Absensi
                </button>
              </form>
            ) : activeModal === "payroll-confirm" ? (
              !payrollTarget ? (
                <p className="mt-4 text-sm text-slate-600">
                  Data absensi tidak ditemukan. Silakan tutup modal lalu pilih ulang.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-900">{payrollTarget.workerName}</span> |
                      {" "}
                      {payrollTarget.projectName ?? "-"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Tanggal: {formatDate(payrollTarget.attendanceDate)} | Hari kerja: {payrollTarget.workDays}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Nilai dibayar: {formatCurrency(payrollTarget.netPay)}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <form action={confirmPayrollPaidAction}>
                      <input type="hidden" name="project_id" value={payrollTarget.projectId} />
                      <input type="hidden" name="team_type" value={payrollTarget.teamType} />
                      <input
                        type="hidden"
                        name="specialist_team_name"
                        value={payrollTarget.specialistTeamName ?? ""}
                      />
                      <input type="hidden" name="worker_name" value={payrollTarget.workerName} />
                      <input
                        type="hidden"
                        name="paid_until_date"
                        value={toDateOnly(payrollTarget.attendanceDate)}
                      />
                      <input type="hidden" name="return_to" value={returnToAttendance} />
                      <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600">
                        <span className="btn-icon icon-float-soft bg-white/20 text-white">
                          <CashInIcon />
                        </span>
                        Sudah Digaji
                      </button>
                    </form>
                    <Link
                      href={closeModalHref}
                      data-ui-button="true"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Belum Digaji
                    </Link>
                  </div>
                </div>
              )
            ) : selectedWorkers.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                Belum ada pekerja yang dipilih. Centang pekerja di daftar absensi lalu klik
                &quot;Rekap Pekerja Terpilih&quot;.
              </p>
            ) : (
              <form method="get" className="mt-4 space-y-4">
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <input type="hidden" name="project" value={projectFilter} />
                {selectedWorkers.map((worker) => (
                  <input key={worker} type="hidden" name="worker" value={worker} />
                ))}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-600">Pekerja terpilih</p>
                  <p className="mt-1 text-sm text-slate-800">{selectedWorkers.join(", ")}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Judul laporan
                    </label>
                    <select name="report_title_mode" defaultValue="project">
                      <option value="project">Gunakan judul sesuai project pekerja</option>
                      <option value="custom">Input judul sendiri</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Judul custom (jika dipilih)
                    </label>
                    <input
                      name="report_title_custom"
                      placeholder="Contoh: Rekap Upah Minggu Ke-2"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Input Reimburse
                    </label>
                    <RupiahInput name="reimburse_amount" placeholder="Contoh: 250.000" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Keterangan Reimburse
                    </label>
                    <input name="reimburse_note" placeholder="Contoh: Reimburse transport" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    formAction="/api/reports/wages"
                    formTarget="_blank"
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                  >
                    <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                      <PdfIcon />
                    </span>
                    Export PDF
                  </button>
                  <button
                    formAction="/api/reports/wages/excel"
                    formTarget="_blank"
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                  >
                    <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                      <ExcelIcon />
                    </span>
                    Export Excel
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
