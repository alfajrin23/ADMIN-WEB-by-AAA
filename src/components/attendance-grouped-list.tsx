"use client";

import Link from "next/link";
import { deleteAttendanceAction } from "@/app/actions";
import { AttendanceProjectSelectionToggle } from "@/components/attendance-project-selection-toggle";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { EditIcon, EyeIcon, TrashIcon } from "@/components/icons";
import { WORKER_TEAM_LABEL } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import type { AttendanceRecord } from "@/lib/types";

type AttendanceGroup = {
  key: string;
  label: string;
  accent: string;
  rows: AttendanceRecord[];
};

type AttendanceGroupedListProps = {
  groups: AttendanceGroup[];
  selectedIds: string[];
  canEdit: boolean;
  returnToAttendance: string;
  emptyAttendanceMessage: string;
};

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}

function createAttendanceItemHref(pathname: "/attendance/view" | "/attendance/edit", id: string, returnTo: string) {
  const query = new URLSearchParams({ id });
  if (returnTo.startsWith("/")) {
    query.set("return_to", returnTo);
  }
  return `${pathname}?${query.toString()}`;
}

function getProjectLabel(item: AttendanceRecord) {
  return item.projectName?.trim() || "Belum dipilih saat rekap";
}

function isRecapped(item: AttendanceRecord) {
  return item.projectId.trim().length > 0;
}

export function AttendanceGroupedList({
  groups,
  selectedIds,
  canEdit,
  returnToAttendance,
  emptyAttendanceMessage,
}: AttendanceGroupedListProps) {
  const selectedSet = new Set(selectedIds);

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
        {emptyAttendanceMessage}
      </p>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <article key={group.key} className="soft-card p-3.5 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3
                className={`text-sm font-semibold ${
                  group.accent === "cyan"
                    ? "text-cyan-900"
                    : group.accent === "amber"
                      ? "text-amber-900"
                      : "text-slate-900"
                }`}
              >
                {group.label}
              </h3>
              <p className="text-xs text-slate-500">{group.rows.length} data</p>
            </div>
            <AttendanceProjectSelectionToggle
              formId="attendance-recap-selection-form"
              scopeKey={`team:${group.key}`}
            />
          </div>

          <div className="mt-3 table-card">
            <div className="data-table-shell">
              <table className="data-table data-table--sticky data-table--compact min-w-[920px] table-fixed text-[11px] leading-5 sm:text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="w-10 text-center">Pilih</th>
                    <th>Pekerja</th>
                    <th>Kelompok</th>
                    <th>Upah</th>
                    <th>Status Rekap</th>
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
                          data-attendance-scope={`team:${group.key}`}
                          defaultChecked={selectedSet.has(item.id)}
                          aria-label={`Pilih ${item.workerName}`}
                        />
                      </td>
                      <td>
                        <p className="font-semibold text-slate-900">{item.workerName}</p>
                        <p className="text-slate-500">
                          {item.teamType === "spesialis"
                            ? item.specialistTeamName?.trim() || "Tim spesialis belum diisi"
                            : WORKER_TEAM_LABEL[item.teamType]}
                        </p>
                      </td>
                      <td className="text-slate-700">
                        <p>{isRecapped(item) ? getProjectLabel(item) : "Belum ada project final"}</p>
                        <p className="text-slate-500">
                          {isRecapped(item)
                            ? "Project final tersimpan dari hasil rekap / export."
                            : "Project final dipilih saat rekap / export."}
                        </p>
                      </td>
                      <td className="text-slate-700">
                        <p>Harian: {formatCurrency(item.dailyWage)}</p>
                        {isRecapped(item) ? (
                          <>
                            <p>Hari kerja: {item.workDays}</p>
                            <p>Lembur: {formatHours(item.overtimeHours)} jam</p>
                          </>
                        ) : (
                          <p className="text-slate-500">Hari kerja, lembur, dan kasbon diisi saat rekap.</p>
                        )}
                      </td>
                      <td className="text-slate-700">
                        {isRecapped(item) ? (
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                            Sudah direkap
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                            Belum direkap
                          </span>
                        )}
                        <p className="mt-2 text-[11px] text-slate-500">
                          {isRecapped(item)
                            ? `Kasbon: ${formatCurrency(item.kasbonAmount)}`
                            : "Belum ada project, hari kerja, atau komponen rekap final."}
                        </p>
                        {isRecapped(item) ? (
                          <p className="text-[11px] font-semibold text-emerald-700">
                            Total dibayar: {formatCurrency(item.netPay)}
                          </p>
                        ) : null}
                      </td>
                      <td className="w-48">
                        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                          <Link
                            href={createAttendanceItemHref("/attendance/view", item.id, returnToAttendance)}
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
                                href={createAttendanceItemHref("/attendance/edit", item.id, returnToAttendance)}
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
    </>
  );
}
