"use client";

import { RupiahInput } from "@/components/rupiah-input";
import { WORKER_TEAM_LABEL } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import type { WorkerTeam } from "@/lib/constants";

type AttendanceExportWorkerRow = {
  id: string;
  projectId: string;
  projectName?: string;
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  workDays: number;
  dailyWage: number;
  overtimeHours: number;
  kasbonAmount: number;
  reimburseType: string | null;
  reimburseAmount: number;
  attendanceDate: string;
  notes: string | null;
};

type AttendanceExportWorkerEditorProps = {
  rows: AttendanceExportWorkerRow[];
};

export function AttendanceExportWorkerEditor({
  rows,
}: AttendanceExportWorkerEditorProps) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">{row.workerName}</p>
              <p className="text-xs text-slate-500">
                {row.teamType === "spesialis"
                  ? `Spesialis - ${row.specialistTeamName ?? "Belum ditentukan"}`
                  : WORKER_TEAM_LABEL[row.teamType]}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Upah harian tersimpan: {formatCurrency(row.dailyWage)}
              </p>
            </div>
            {row.projectId ? (
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                Sudah direkap
              </span>
            ) : null}
          </div>

          <input type="hidden" name="attendance_id" value={row.id} />
          <input type="hidden" name="project_id_current" value={row.projectId} />
          <input type="hidden" name="worker_name" value={row.workerName} />
          <input type="hidden" name="team_type" value={row.teamType} />
          <input
            type="hidden"
            name="specialist_team_name_current"
            value={row.specialistTeamName ?? ""}
          />
          <input type="hidden" name="status" value="hadir" />
          <input type="hidden" name="daily_wage" value={String(row.dailyWage)} />
          <input
            type="hidden"
            name="attendance_reimburse_type"
            value={row.reimburseType ?? ""}
          />
          <input
            type="hidden"
            name="attendance_reimburse_amount"
            value={String(row.reimburseAmount)}
          />
          <input type="hidden" name="attendance_date" value={row.attendanceDate} />
          <input type="hidden" name="notes" value={row.notes ?? ""} />

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Hari Kerja
              </label>
              <input
                type="number"
                name="work_days"
                min={1}
                max={31}
                defaultValue={row.workDays > 0 ? row.workDays : 1}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Kasbon
              </label>
              <RupiahInput name="kasbon_amount" defaultValue={row.kasbonAmount} />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Lembur (Jam)
              </label>
              <input
                type="number"
                name="overtime_hours"
                min={0}
                step="0.5"
                defaultValue={row.overtimeHours}
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
