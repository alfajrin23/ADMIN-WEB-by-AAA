import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteAttendanceAction, updateAttendanceAction } from "@/app/actions";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { SaveIcon, TrashIcon } from "@/components/icons";
import { RupiahInput } from "@/components/rupiah-input";
import { requireEditorUser } from "@/lib/auth";
import { ATTENDANCE_STATUSES, WORKER_TEAMS } from "@/lib/constants";
import { getAttendanceById, getProjects } from "@/lib/data";

type EditAttendancePageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function EditAttendancePage({ searchParams }: EditAttendancePageProps) {
  await requireEditorUser();
  const params = await searchParams;
  const attendanceId = typeof params.id === "string" ? params.id : "";
  const [attendance, projects] = await Promise.all([
    getAttendanceById(attendanceId),
    getProjects(),
  ]);
  if (!attendance) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Edit Absensi</h1>
          <Link href="/attendance" className="text-sm font-medium text-blue-700 hover:text-blue-900">
            Kembali ke Absen
          </Link>
        </div>

        <form action={updateAttendanceAction} className="mt-4 space-y-3">
          <input type="hidden" name="attendance_id" value={attendance.id} />
          <input type="hidden" name="return_to" value="/attendance" />

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
            <select name="project_id" defaultValue={attendance.projectId} required>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Nama pekerja</label>
              <input name="worker_name" defaultValue={attendance.workerName} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
              <select name="status" defaultValue={attendance.status}>
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
              <label className="mb-1 block text-xs font-medium text-slate-500">Jenis tim</label>
              <select name="team_type" defaultValue={attendance.teamType}>
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
                defaultValue={attendance.specialistTeamName ?? ""}
                placeholder="Isi jika tim spesialis"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal</label>
              <input type="date" name="attendance_date" defaultValue={attendance.attendanceDate} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Hari kerja</label>
              <input
                type="number"
                min={1}
                max={31}
                name="work_days"
                defaultValue={attendance.workDays}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Gaji harian</label>
            <RupiahInput name="daily_wage" defaultValue={attendance.dailyWage} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Kasbon</label>
            <RupiahInput name="kasbon_amount" defaultValue={attendance.kasbonAmount} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Catatan</label>
            <textarea name="notes" rows={3} defaultValue={attendance.notes ?? ""} />
          </div>

          <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
            <span className="btn-icon icon-float-soft bg-white/20 text-white">
              <SaveIcon />
            </span>
            Simpan Perubahan
          </button>
        </form>

        <form action={deleteAttendanceAction} className="mt-3">
          <input type="hidden" name="attendance_id" value={attendance.id} />
          <input type="hidden" name="return_to" value="/attendance" />
          <ConfirmActionButton
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
            modalDescription="Yakin ingin menghapus data absensi ini?"
          >
            <span className="btn-icon icon-wiggle-soft bg-rose-100 text-rose-700">
              <TrashIcon />
            </span>
            Hapus Absensi
          </ConfirmActionButton>
        </form>
      </section>
    </div>
  );
}
