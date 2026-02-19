import Link from "next/link";
import {
  confirmPayrollPaidAction,
  createAttendanceAction,
  deleteAttendanceAction,
} from "@/app/actions";
import {
  CashInIcon,
  DownloadIcon,
  EditIcon,
  FilterIcon,
  SaveIcon,
  TrashIcon,
} from "@/components/icons";
import { RupiahInput } from "@/components/rupiah-input";
import { StatCard } from "@/components/stat-card";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_STYLE,
  WORKER_TEAM_LABEL,
  WORKER_TEAMS,
} from "@/lib/constants";
import { getProjects, getWageRecap } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

type AttendancePageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    project?: string;
    team?: string;
    specialist?: string;
    recap?: string;
  }>;
};

function isDateString(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getMonthStartDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function createPdfQuery(params: {
  from: string;
  to: string;
  project?: string;
  team?: string;
  specialist?: string;
}) {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  if (params.project) {
    query.set("project", params.project);
  }
  if (params.team) {
    query.set("team", params.team);
  }
  if (params.specialist) {
    query.set("specialist", params.specialist);
  }
  return query.toString();
}

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = isDateString(params.from) ? String(params.from) : getMonthStartDate();
  const to = isDateString(params.to) ? String(params.to) : today;
  const projectFilter = typeof params.project === "string" ? params.project : "";
  const teamFilterRaw = typeof params.team === "string" ? params.team : "";
  const teamFilter =
    teamFilterRaw === "tukang" || teamFilterRaw === "laden" || teamFilterRaw === "spesialis"
      ? teamFilterRaw
      : "";
  const specialistFilter = typeof params.specialist === "string" ? params.specialist : "";
  const recapModeRaw = typeof params.recap === "string" ? params.recap : "";
  const recapMode = recapModeRaw === "gabung" ? "gabung" : "per_project";

  const [projects, wageRecap] = await Promise.all([
    getProjects(),
    getWageRecap({
      from,
      to,
      projectId: projectFilter || undefined,
      teamType: teamFilter || undefined,
      specialistTeamName: specialistFilter || undefined,
      recapMode,
    }),
  ]);
  const hasProjects = projects.length > 0;
  const hasProjectFilter = projects.some((project) => project.id === projectFilter);
  const createDefaultProjectId = hasProjectFilter ? projectFilter : projects[0]?.id;
  const pdfQuery = createPdfQuery({
    from,
    to,
    project: projectFilter || undefined,
    team: teamFilter || undefined,
    specialist: specialistFilter || undefined,
  });
  const returnToQuery = new URLSearchParams({
    from,
    to,
    ...(projectFilter ? { project: projectFilter } : {}),
    ...(teamFilter ? { team: teamFilter } : {}),
    ...(specialistFilter ? { specialist: specialistFilter } : {}),
    ...(recapMode === "gabung" ? { recap: recapMode } : {}),
  }).toString();
  const returnToAttendance = returnToQuery ? `/attendance?${returnToQuery}` : "/attendance";

  return (
    <div className="space-y-4">
      {activeDataSource === "demo" ? (
        <section className="panel border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-700">
            Mode demo aktif. Data absensi dan gaji disimpan setelah env Supabase diisi.
          </p>
        </section>
      ) : null}
      {activeDataSource === "excel" ? (
        <section className="panel border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">Sumber data aktif: {getStorageLabel()}</p>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Gaji Harian"
          value={formatCurrency(wageRecap.totalDailyWage)}
          note={`Periode ${from} s/d ${to}`}
          tone="blue"
          icon={<span className="inline-block h-4 w-4 rounded bg-blue-500" />}
        />
        <StatCard
          label="Total Kasbon"
          value={formatCurrency(wageRecap.totalKasbon)}
          note="Kasbon dari absensi yang tercatat"
          tone="amber"
          icon={<span className="inline-block h-4 w-4 rounded bg-amber-500" />}
        />
        <StatCard
          label="Total Harus Dibayar"
          value={formatCurrency(wageRecap.totalNetPay)}
          note="Gaji harian - kasbon"
          tone="emerald"
          icon={<span className="inline-block h-4 w-4 rounded bg-emerald-500" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <article className="panel p-5">
          <h2 className="text-lg font-semibold text-slate-900">Absen & Gaji Harian Tim</h2>
          <form action={createAttendanceAction} className="mt-4 space-y-3">
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
                  Buat project terlebih dahulu di menu Proyek & Biaya.
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
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Nama tim spesialis
                </label>
                <input
                  name="specialist_team_name"
                  placeholder="Isi jika tim spesialis, contoh: Tim Baja"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
                <select name="status" defaultValue="hadir">
                  {ATTENDANCE_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal</label>
                <input type="date" name="attendance_date" defaultValue={today} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Gaji harian</label>
              <RupiahInput name="daily_wage" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Hari kerja</label>
              <input type="number" name="work_days" min={1} max={31} defaultValue={1} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Kasbon hari ini</label>
              <RupiahInput name="kasbon_amount" />
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
        </article>

        <article className="space-y-4">
          <section className="panel p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Filter Rekap Gaji</h2>
                <p className="text-xs text-slate-500">
                  Filter data per project, jenis tim, atau tim spesialis tertentu.
                </p>
                <p className="text-[11px] text-slate-500">
                  Setelah admin klik konfirmasi gajian pada pekerja, total pekerja tersebut otomatis reset.
                </p>
              </div>
              <a
                href={`/api/reports/wages?${pdfQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                data-ui-button="true"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600"
              >
                <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                  <DownloadIcon />
                </span>
                Download PDF Rekap
              </a>
            </div>
            <form className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Dari tanggal</label>
                <input type="date" name="from" defaultValue={from} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Sampai tanggal</label>
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
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Jenis Tim</label>
                <select name="team" defaultValue={teamFilter}>
                  <option value="">Semua Tim</option>
                  {WORKER_TEAMS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Nama Tim Spesialis</label>
                <input name="specialist" defaultValue={specialistFilter} placeholder="Contoh: Tim Baja" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Mode Rekap Pekerja
                </label>
                <select name="recap" defaultValue={recapMode}>
                  <option value="per_project">Pisah per Project</option>
                  <option value="gabung">Gabung Semua Project</option>
                </select>
              </div>
              <button className="inline-flex h-[42px] items-center rounded-xl bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-700 xl:col-span-6 xl:w-max">
                <span className="btn-icon icon-float-soft mr-2 bg-white/20 text-white">
                  <FilterIcon />
                </span>
                Terapkan Filter
              </button>
            </form>
          </section>

          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Rekap Gaji Pekerja</h2>
              <p className="text-xs text-slate-500">
                Mode: {recapMode === "gabung" ? "Gabung semua project" : "Pisah per project"}
              </p>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 font-medium">Pekerja</th>
                    <th className="pb-2 font-medium">Project</th>
                    <th className="pb-2 text-right font-medium">Hari Kerja</th>
                    <th className="pb-2 text-right font-medium">Total Gaji</th>
                    <th className="pb-2 text-right font-medium">Total Kasbon</th>
                    <th className="pb-2 text-right font-medium">Harus Dibayar</th>
                  </tr>
                </thead>
                <tbody>
                  {wageRecap.workerSummaries.map((item) => (
                    <tr key={item.key} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-900">{item.workerName}</td>
                      <td className="py-2">{item.projectName ?? "Gabungan Project"}</td>
                      <td className="py-2 text-right">{item.workDays}</td>
                      <td className="py-2 text-right">{formatCurrency(item.totalDailyWage)}</td>
                      <td className="py-2 text-right">{formatCurrency(item.totalKasbon)}</td>
                      <td className="py-2 text-right font-semibold text-emerald-700">
                        {formatCurrency(item.totalNetPay)}
                      </td>
                    </tr>
                  ))}
                  {wageRecap.workerSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-500">
                        Belum ada data rekap pekerja pada periode ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 text-slate-900">
                    <td colSpan={3} className="py-2 font-semibold">
                      Total Keseluruhan Gaji
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {formatCurrency(wageRecap.totalDailyWage)}
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {formatCurrency(wageRecap.totalKasbon)}
                    </td>
                    <td className="py-2 text-right font-semibold text-emerald-700">
                      {formatCurrency(wageRecap.totalNetPay)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-lg font-semibold text-slate-900">Rekap Total per Project</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 font-medium">Project</th>
                    <th className="pb-2 text-right font-medium">Jumlah Pekerja</th>
                    <th className="pb-2 text-right font-medium">Total Gaji</th>
                    <th className="pb-2 text-right font-medium">Total Kasbon</th>
                    <th className="pb-2 text-right font-medium">Harus Dibayar</th>
                    <th className="pb-2 text-right font-medium">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {wageRecap.projectSummaries.map((item) => (
                    <tr key={item.projectId} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-900">{item.projectName}</td>
                      <td className="py-2 text-right">{item.workerCount}</td>
                      <td className="py-2 text-right">{formatCurrency(item.totalDailyWage)}</td>
                      <td className="py-2 text-right">{formatCurrency(item.totalKasbon)}</td>
                      <td className="py-2 text-right font-semibold text-emerald-700">
                        {formatCurrency(item.totalNetPay)}
                      </td>
                      <td className="py-2 text-right">
                        <a
                          href={`/api/reports/wages?${createPdfQuery({
                            from,
                            to,
                            project: item.projectId,
                            team: teamFilter || undefined,
                            specialist: specialistFilter || undefined,
                          })}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-ui-button="true"
                          className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:text-blue-900"
                        >
                          <span className="btn-icon bg-blue-100 text-blue-700">
                            <DownloadIcon />
                          </span>
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                  {wageRecap.projectSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-500">
                        Belum ada data rekap pada periode ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Rekap Penggajian Tim per Project
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Ringkasan keseluruhan tim pada tiap project agar proses gajian lebih cepat.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 font-medium">Project</th>
                    <th className="pb-2 font-medium">Tim</th>
                    <th className="pb-2 text-right font-medium">Jumlah Pekerja</th>
                    <th className="pb-2 text-right font-medium">Total Gaji</th>
                    <th className="pb-2 text-right font-medium">Total Kasbon</th>
                    <th className="pb-2 text-right font-medium">Harus Dibayar</th>
                    <th className="pb-2 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {wageRecap.projectTeamSummaries.map((item) => (
                    <tr key={item.key} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-900">{item.projectName}</td>
                      <td className="py-2">{item.label}</td>
                      <td className="py-2 text-right">{item.workerCount}</td>
                      <td className="py-2 text-right">{formatCurrency(item.totalDailyWage)}</td>
                      <td className="py-2 text-right">{formatCurrency(item.totalKasbon)}</td>
                      <td className="py-2 text-right font-semibold text-emerald-700">
                        {formatCurrency(item.totalNetPay)}
                      </td>
                      <td className="py-2 text-right">
                        <form action={confirmPayrollPaidAction} className="inline">
                          <input type="hidden" name="project_id" value={item.projectId} />
                          <input type="hidden" name="team_type" value={item.teamType} />
                          <input
                            type="hidden"
                            name="specialist_team_name"
                            value={item.specialistTeamName ?? ""}
                          />
                          <input type="hidden" name="worker_name" value="" />
                          <input
                            type="hidden"
                            name="paid_until_date"
                            value={item.latestAttendanceDate}
                          />
                          <input type="hidden" name="return_to" value={returnToAttendance} />
                          <button className="text-xs font-semibold text-indigo-700 hover:text-indigo-900">
                            Konfirmasi Tim
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {wageRecap.projectTeamSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-500">
                        Belum ada data rekap tim per project pada periode ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-lg font-semibold text-slate-900">Rekap Total per Tim</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[660px] text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 font-medium">Tim</th>
                    <th className="pb-2 text-right font-medium">Jumlah Pekerja</th>
                    <th className="pb-2 text-right font-medium">Total Gaji</th>
                    <th className="pb-2 text-right font-medium">Total Kasbon</th>
                    <th className="pb-2 text-right font-medium">Harus Dibayar</th>
                  </tr>
                </thead>
                <tbody>
                  {wageRecap.teamSummaries.map((item) => (
                    <tr key={item.key} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-900">{item.label}</td>
                      <td className="py-2 text-right">{item.workerCount}</td>
                      <td className="py-2 text-right">{formatCurrency(item.totalDailyWage)}</td>
                      <td className="py-2 text-right">{formatCurrency(item.totalKasbon)}</td>
                      <td className="py-2 text-right font-semibold text-emerald-700">
                        {formatCurrency(item.totalNetPay)}
                      </td>
                    </tr>
                  ))}
                  {wageRecap.teamSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">
                        Belum ada data tim pada filter ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Detail Absensi & Gaji</h2>
              <p className="text-xs text-slate-500">{wageRecap.rows.length} data</p>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 font-medium">Tanggal</th>
                    <th className="pb-2 font-medium">Project</th>
                    <th className="pb-2 font-medium">Pekerja</th>
                    <th className="pb-2 font-medium">Tim</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Gaji Harian</th>
                    <th className="pb-2 text-right font-medium">Kasbon</th>
                    <th className="pb-2 text-right font-medium">Harus Dibayar</th>
                    <th className="pb-2 font-medium">Catatan</th>
                    <th className="pb-2 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {wageRecap.rows.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="py-2">{formatDate(item.attendanceDate)}</td>
                      <td className="py-2">{item.projectName ?? "-"}</td>
                      <td className="py-2 font-medium text-slate-900">{item.workerName}</td>
                      <td className="py-2">
                        {item.teamType === "spesialis"
                          ? `Spesialis - ${item.specialistTeamName ?? "Lainnya"}`
                          : WORKER_TEAM_LABEL[item.teamType]}
                      </td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${ATTENDANCE_STATUS_STYLE[item.status]}`}
                        >
                          {ATTENDANCE_STATUS_LABEL[item.status]}
                        </span>
                      </td>
                      <td className="py-2 text-right">{formatCurrency(item.dailyWage)}</td>
                      <td className="py-2 text-right">{formatCurrency(item.kasbonAmount)}</td>
                      <td className="py-2 text-right font-semibold text-emerald-700">
                        {formatCurrency(item.netPay)}
                      </td>
                      <td className="py-2">{item.notes ?? "-"}</td>
                      <td className="py-2">
                        <div className="flex justify-end gap-3">
                          <form action={confirmPayrollPaidAction}>
                            <input type="hidden" name="project_id" value={item.projectId} />
                            <input type="hidden" name="team_type" value={item.teamType} />
                            <input
                              type="hidden"
                              name="specialist_team_name"
                              value={item.specialistTeamName ?? ""}
                            />
                            <input type="hidden" name="worker_name" value={item.workerName} />
                            <input
                              type="hidden"
                              name="paid_until_date"
                              value={item.attendanceDate.slice(0, 10)}
                            />
                            <input type="hidden" name="return_to" value={returnToAttendance} />
                            <button className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900">
                              <span className="btn-icon bg-indigo-100 text-indigo-700">
                                <CashInIcon />
                              </span>
                              Konfirmasi Gajian
                            </button>
                          </form>
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
                  ))}
                  {wageRecap.rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-4 text-center text-slate-500">
                        Belum ada absensi yang dicatat.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </article>
      </section>
    </div>
  );
}
