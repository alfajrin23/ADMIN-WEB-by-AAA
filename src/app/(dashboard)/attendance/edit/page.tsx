import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteAttendanceAction, updateAttendanceAction } from "@/app/actions";
import { AttendanceSubmitButton } from "@/components/attendance-submit-button";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { TrashIcon } from "@/components/icons";
import { RupiahInput } from "@/components/rupiah-input";
import { requireAttendanceEditorUser } from "@/lib/auth";
import { WORKER_TEAMS } from "@/lib/constants";
import { getAttendanceById } from "@/lib/data";

type EditAttendancePageProps = {
  searchParams: Promise<{ id?: string; return_to?: string }>;
};

export default async function EditAttendancePage({ searchParams }: EditAttendancePageProps) {
  await requireAttendanceEditorUser();
  const params = await searchParams;
  const attendanceId = typeof params.id === "string" ? params.id : "";
  const returnTo =
    typeof params.return_to === "string" && params.return_to.startsWith("/")
      ? params.return_to
      : "/attendance";
  const attendance = await getAttendanceById(attendanceId);
  if (!attendance) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Edit Absensi</h1>
          <Link href={returnTo} className="text-sm font-medium text-blue-700 hover:text-blue-900">
            Kembali ke Absen
          </Link>
        </div>

        <form action={updateAttendanceAction} className="mt-4 space-y-3">
          <input type="hidden" name="attendance_id" value={attendance.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="attendance_date" value={attendance.attendanceDate} />
          <input type="hidden" name="project_id" value={attendance.projectId} />
          <input type="hidden" name="status" value={attendance.status} />
          <input type="hidden" name="work_days" value={String(attendance.workDays)} />
          <input type="hidden" name="overtime_hours" value={String(attendance.overtimeHours)} />
          <input type="hidden" name="kasbon_amount" value={String(attendance.kasbonAmount)} />
          <input type="hidden" name="notes" value={attendance.notes ?? ""} />

          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Project tetap mengikuti data absensi saat ini. Upah lembur per jam dihitung otomatis
            dari upah harian dibagi 8.
          </p>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nama pekerja</label>
            <input name="worker_name" defaultValue={attendance.workerName} required />
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

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Upah harian</label>
            <RupiahInput name="daily_wage" defaultValue={attendance.dailyWage} />
          </div>

          <AttendanceSubmitButton
            idleLabel="Simpan Perubahan"
            pendingLabel="Menyimpan Perubahan..."
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          />
        </form>

        <form action={deleteAttendanceAction} className="mt-3">
          <input type="hidden" name="attendance_id" value={attendance.id} />
          <input type="hidden" name="return_to" value={returnTo} />
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
