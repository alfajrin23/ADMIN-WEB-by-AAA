import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAttendanceViewerUser } from "@/lib/auth";
import { WORKER_TEAM_LABEL } from "@/lib/constants";
import { getAttendanceById } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";

type ViewAttendancePageProps = {
  searchParams: Promise<{ id?: string; return_to?: string }>;
};

export default async function ViewAttendancePage({ searchParams }: ViewAttendancePageProps) {
  await requireAttendanceViewerUser();
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-slate-900">Detail Absensi</h1>
          <div className="flex items-center gap-3 text-sm font-medium">
            <Link href={returnTo} className="text-blue-700 hover:text-blue-900">
              Kembali
            </Link>
            <Link
              href={`/attendance/edit?id=${attendance.id}&return_to=${encodeURIComponent(returnTo)}`}
              className="text-emerald-700 hover:text-emerald-900"
            >
              Edit Data
            </Link>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Tanggal</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {formatDate(attendance.attendanceDate)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Pekerja</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{attendance.workerName}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Project Final</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {attendance.projectName ?? "Belum dipilih saat rekap / export"}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Tim</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {attendance.teamType === "spesialis"
                ? `Spesialis - ${attendance.specialistTeamName ?? "Lainnya"}`
                : WORKER_TEAM_LABEL[attendance.teamType]}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Status Rekap</dt>
            <dd className="mt-1 text-sm font-semibold capitalize text-slate-900">
              {attendance.projectId ? "Sudah direkap" : "Belum direkap"}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Hari Kerja</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {attendance.workDays} hari
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Gaji Harian</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {formatCurrency(attendance.dailyWage)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Lembur (Jam)</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {attendance.overtimeHours}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Upah Lembur/Jam</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {formatCurrency(attendance.overtimeWage)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Total Upah Lembur</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {formatCurrency(attendance.overtimePay)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Kasbon</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {formatCurrency(attendance.kasbonAmount)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Harus Dibayar</dt>
            <dd className="mt-1 text-sm font-semibold text-emerald-700">
              {formatCurrency(attendance.netPay)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
            <dt className="text-xs text-slate-500">Keterangan</dt>
            <dd className="mt-1 text-sm text-slate-900">{attendance.notes ?? "-"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
