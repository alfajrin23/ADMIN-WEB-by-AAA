"use client";

import { useMemo, useRef, useState } from "react";
import { PlusIcon, TrashIcon } from "@/components/icons";
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
  projects: Array<{ id: string; name: string }>;
  specialistTeamPresets: Array<{ value: string; label: string }>;
};

type WorkerSegment = {
  key: string;
  attendanceId: string;
  projectId: string;
  specialistTeamName: string;
  workDays: number;
  kasbonAmount: number;
  overtimeHours: number;
};

function createInitialSegment(row: AttendanceExportWorkerRow): WorkerSegment {
  return {
    key: `${row.id}-0`,
    attendanceId: row.id,
    projectId: row.projectId,
    specialistTeamName: row.specialistTeamName ?? "",
    workDays: row.workDays > 0 ? row.workDays : 1,
    kasbonAmount: row.kasbonAmount,
    overtimeHours: row.overtimeHours,
  };
}

function createExtraSegment(row: AttendanceExportWorkerRow, nextIndex: number): WorkerSegment {
  return {
    key: `${row.id}-${nextIndex}`,
    attendanceId: `new:${row.id}:${nextIndex}`,
    projectId: "",
    specialistTeamName: row.specialistTeamName ?? "",
    workDays: 1,
    kasbonAmount: 0,
    overtimeHours: 0,
  };
}

export function AttendanceExportWorkerEditor({
  rows,
  projects,
  specialistTeamPresets,
}: AttendanceExportWorkerEditorProps) {
  const [segmentsByWorkerId, setSegmentsByWorkerId] = useState<Record<string, WorkerSegment[]>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, [createInitialSegment(row)]])),
  );
  const nextTokenRef = useRef(1);

  const specialistTeamPresetValues = useMemo(
    () => specialistTeamPresets.map((item) => item.value),
    [specialistTeamPresets],
  );

  const addSegment = (row: AttendanceExportWorkerRow) => {
    const token = `${row.id}-${nextTokenRef.current}`;
    nextTokenRef.current += 1;
    const nextSegment = createExtraSegment(row, 1);
    nextSegment.key = `${row.id}-${token}`;
    nextSegment.attendanceId = `new:${row.id}:${token}`;
    setSegmentsByWorkerId((current) => {
      const workerSegments = current[row.id] ?? [createInitialSegment(row)];
      return {
        ...current,
        [row.id]: [...workerSegments, nextSegment],
      };
    });
  };

  const removeSegment = (workerId: string, segmentKey: string) => {
    setSegmentsByWorkerId((current) => {
      const workerSegments = current[workerId] ?? [];
      if (workerSegments.length <= 1) {
        return current;
      }
      const removedSegment = workerSegments.find((segment) => segment.key === segmentKey);
      const nextSegments = workerSegments.filter((segment) => segment.key !== segmentKey);
      if (removedSegment && !removedSegment.attendanceId.startsWith("new:") && nextSegments.length > 0) {
        nextSegments[0] = {
          ...nextSegments[0],
          attendanceId: removedSegment.attendanceId,
        };
      }
      return {
        ...current,
        [workerId]: nextSegments,
      };
    });
  };

  return (
    <div className="space-y-3">
      <datalist id="attendance-export-specialist-team-presets">
        {specialistTeamPresetValues.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      {rows.map((row) => {
        const segments = segmentsByWorkerId[row.id] ?? [createInitialSegment(row)];
        return (
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
              <div className="flex flex-wrap gap-2">
                {row.projectId ? (
                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                    Sudah direkap
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => addSegment(row)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <span className="btn-icon bg-slate-100 text-slate-700">
                    <PlusIcon />
                  </span>
                  Tambah pembagian
                </button>
              </div>
            </div>

            <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              Gunakan beberapa pembagian jika pekerja yang sama harus masuk ke project berbeda,
              atau pekerja spesialis dipindah dari baja ke sipil dalam rekap yang sama.
            </p>

            <div className="mt-3 space-y-3">
              {segments.map((segment, segmentIndex) => (
                <section
                  key={segment.key}
                  className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Pembagian {segmentIndex + 1}
                    </p>
                    {segments.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeSegment(row.id, segment.key)}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <span className="btn-icon bg-rose-100 text-rose-700">
                          <TrashIcon />
                        </span>
                        Hapus pembagian
                      </button>
                    ) : null}
                  </div>

                  <input type="hidden" name="attendance_id" value={segment.attendanceId} />
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

                  <div className="grid gap-3 lg:grid-cols-[1.15fr_0.95fr_0.7fr_0.7fr_0.7fr]">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Project Final
                      </label>
                      <select name="project_id_export" defaultValue={segment.projectId}>
                        <option value="">Ikuti project global / pilih manual</option>
                        {projects.map((project) => (
                          <option key={`${segment.key}-${project.id}`} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {row.projectId
                          ? `Project tersimpan: ${row.projectName ?? "Project"}`
                          : "Belum ada project final pada data awal ini."}
                      </p>
                    </div>

                    {row.teamType === "spesialis" ? (
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Tim Spesialis Final
                        </label>
                        <input
                          name="specialist_team_name_export"
                          list="attendance-export-specialist-team-presets"
                          defaultValue={segment.specialistTeamName}
                          placeholder="Contoh: Cianjur - Sipil"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          Contoh: Jakarta, Cianjur - Baja, Cianjur - Listrik, atau Cianjur - Sipil.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                        {WORKER_TEAM_LABEL[row.teamType]} tidak memakai tim spesialis final.
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Hari Kerja
                      </label>
                      <input
                        type="number"
                        name="work_days"
                        min={1}
                        max={31}
                        defaultValue={segment.workDays}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Kasbon
                      </label>
                      <RupiahInput name="kasbon_amount" defaultValue={segment.kasbonAmount} />
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
                        defaultValue={segment.overtimeHours}
                      />
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
