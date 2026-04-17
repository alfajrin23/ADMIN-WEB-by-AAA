"use server";
import { createHash, randomUUID } from "node:crypto";
import { getString, getStringList, getNumber, getStringValues, getNumberValues, getPositiveInteger, parseYearInput, replaceDateYearKeepingMonthDay, getReturnTo, withReturnMessage, withReturnParams, isChecked, revalidateProjectPages, revalidateProjectCache, revalidateExpenseCache, revalidateAttendanceCache, requireEditorActionUser, requireAttendanceActionUser, requireImportActionUser, requireLogsActionUser, createTimestamp, createDeterministicUuid, ensureSupabaseAttendanceDraftProjectId, resolveDraftAttendanceNotes, resolveFinalAttendanceNotes, parseAttendanceStatusValue, parseWorkerTeamValue, normalizeAttendanceIdentityText, createAttendanceMutationId, createPayrollResetMutationId, resolveAutoOvertimeWage, AttendanceDuplicateCheckInput, AttendanceDuplicateCheckRow, hasSameAttendanceIdentity, findDuplicateAttendanceRecord, getExpenseSubmissionToken, createExpenseMutationId, shouldSyncExpenseCategory, parseProjectInitialCategories, buildSupabaseCategoryRows, upsertSupabaseCategories, isFirebaseNotFoundError, hasWarnedFirebaseWriteDatabaseMissing, runFirebaseWriteSafely, deleteFirebaseDocsByField, ParsedTemplateImportData, normalizeImportText, normalizeImportNumber, buildImportExpenseSignature, chunkArray, importTemplateDataToSupabase, importTemplateDataToFirebase, getParsedCategory, getSpecialistType, getParsedWorkerTeam, getParsedReimburseType, resolveAmountByMode, getExpenseTargetProjectIds, parsePositiveAmount, createHokExpenseEntries, createScraperExpenseEntries, AttendanceRecapRowInput, resolveAttendanceExportRowId, buildAttendanceRecapRowsFromFormData } from "./utils";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { queueActivityLog } from "@/lib/activity-logs";
import {
  ATTENDANCE_DRAFT_PROJECT_CODE,
  ATTENDANCE_DRAFT_PROJECT_NAME,
  buildAttendanceDraftNote,
  isAttendanceDraftNote,
  parseAttendanceDraftNote,
  isAttendanceWorkerPresetNote,
} from "@/lib/attendance-worker-preset-store";
import {
  canImportData,
  canManageAttendance,
  canManageModule,
  canManageProjects,
  requireAuthUser,
} from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  type AttendanceStatus,
  ATTENDANCE_STATUSES,
  COST_CATEGORIES,
  getCostCategoryLabel,
  parseCategoryListInput,
  type ProjectStatus,
  PROJECT_STATUSES,
  type ReimburseType,
  REIMBURSE_TYPES,
  isHiddenCostCategory,
  toCategorySlug,
  type WorkerTeam,
  WORKER_TEAMS,
} from "@/lib/constants";
import {
  deleteExcelAttendance,
  deleteExcelExpense,
  deleteManyExcelExpenses,
  deleteManyExcelProjects,
  deleteExcelProject,
  importTemplateExcelDatabase,
  importTemplateExcelDatabaseFromBuffer,
  parseTemplateExcelData,
  parseTemplateExcelDataFromBuffer,
  readExcelDatabase,
  insertExcelAttendance,
  insertExcelExpense,
  insertExcelPayrollReset,
  insertExcelProject,
  upsertManyExcelAttendance,
  upsertManyExcelPayrollResets,
  updateExcelAttendance,
  updateExcelExpense,
  updateManyExcelExpenseYears,
  updateManyExcelExpenses,
  updateManyExcelProjects,
  updateExcelProject,
} from "@/lib/excel-db";
import { getFirestoreServerClient } from "@/lib/firebase";
import { getCurrentJakartaDate } from "@/lib/date";
import { activeDataSource } from "@/lib/storage";
import {
  getSupabaseAttendanceSelect,
  getSupabaseServerClient,
  omitSpecialistTeamNameField,
  withSupabaseSpecialistTeamNameFallback,
} from "@/lib/supabase";
export async function createAttendanceAction(formData: FormData) {
  const actor = await requireAttendanceActionUser();
  const projectId = getString(formData, "project_id");
  const workerName = getString(formData, "worker_name");
  const returnTo = getReturnTo(formData) ?? "/attendance";
  if (!workerName) {
    redirect(withReturnMessage(returnTo, "error", "Nama pekerja wajib diisi."));
    return;
  }

  const status = getString(formData, "status");
  const parsedStatus = parseAttendanceStatusValue(status);

  const teamType = getParsedWorkerTeam(formData);
  const specialistTeamNameRaw = getString(formData, "specialist_team_name");
  const specialistTeamName = teamType === "spesialis" ? specialistTeamNameRaw || null : null;
  if (teamType === "spesialis" && !specialistTeamName) {
    redirect(withReturnMessage(returnTo, "error", "Tim spesialis / asal wajib diisi untuk pekerja spesialis."));
    return;
  }
  const dailyWage = getNumber(formData, "daily_wage");
  const overtimeHours = Math.max(getNumber(formData, "overtime_hours"), 0);
  const kasbonAmount = getNumber(formData, "kasbon_amount");
  const reimburseType = getParsedReimburseType(formData);
  const reimburseAmount = getNumber(formData, "reimburse_amount");
  const normalizedReimburseAmount =
    reimburseType && Number.isFinite(reimburseAmount) && reimburseAmount > 0 ? reimburseAmount : 0;
  const normalizedDailyWage =
    parsedStatus === "hadir" && Number.isFinite(dailyWage) ? dailyWage : 0;
  const normalizedOvertimeHours =
    parsedStatus === "hadir" && Number.isFinite(overtimeHours) ? overtimeHours : 0;
  const normalizedOvertimeWage =
    parsedStatus === "hadir" ? resolveAutoOvertimeWage(normalizedDailyWage) : 0;
  const workDays = Math.min(getPositiveInteger(formData, "work_days", 1), 31);
  const attendanceDate = getString(formData, "attendance_date") || getCurrentJakartaDate();

  const payload = {
    id: createAttendanceMutationId({
      projectId,
      workerName,
      teamType,
      specialistTeamName,
      attendanceDate,
    }),
    project_id: projectId,
    worker_name: workerName,
    team_type: teamType,
    specialist_team_name: specialistTeamName,
    status: parsedStatus,
    daily_wage: normalizedDailyWage,
    overtime_hours: normalizedOvertimeHours,
    overtime_wage: normalizedOvertimeWage,
    kasbon_amount: Number.isFinite(kasbonAmount) ? kasbonAmount : 0,
    reimburse_type: reimburseType,
    reimburse_amount: normalizedReimburseAmount,
    work_days: workDays,
    attendance_date: attendanceDate,
    notes: resolveDraftAttendanceNotes({
      currentNotes: getString(formData, "notes") || null,
      specialistTeamName,
      source: "manual-input",
    }),
  };

  const duplicate = await findDuplicateAttendanceRecord([
    {
      id: payload.id,
      projectId: payload.project_id,
      workerName: payload.worker_name,
      teamType: payload.team_type,
      specialistTeamName: payload.specialist_team_name,
      attendanceDate: payload.attendance_date,
    },
  ]);
  if (duplicate) {
    redirect(
      withReturnMessage(
        returnTo,
        "error",
        "Data absensi pekerja dengan kombinasi tanggal dan tim yang sama sudah ada.",
      ),
    );
  }

  if (activeDataSource === "excel") {
    insertExcelAttendance(payload);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    const draftProjectId = payload.project_id || await ensureSupabaseAttendanceDraftProjectId(supabase);
    if (!draftProjectId) {
      redirect(withReturnMessage(returnTo, "error", "Gagal menyiapkan penyimpanan draft absensi."));
      return;
    }
    const attendancePayload = {
      id: payload.id,
      project_id: draftProjectId,
      worker_name: payload.worker_name,
      team_type: payload.team_type,
      specialist_team_name: payload.specialist_team_name,
      status: payload.status,
      work_days: payload.work_days,
      daily_wage: payload.daily_wage,
      overtime_hours: payload.overtime_hours,
      overtime_wage: payload.overtime_wage,
      kasbon_amount: payload.kasbon_amount,
      reimburse_type: payload.reimburse_type,
      reimburse_amount: payload.reimburse_amount,
      attendance_date: payload.attendance_date,
      notes: payload.notes,
    };
    const result = await withSupabaseSpecialistTeamNameFallback(({ omitSpecialistTeamName }) =>
      supabase.from("attendance_records").upsert(
        omitSpecialistTeamNameField(attendancePayload, omitSpecialistTeamName),
        {
          onConflict: "id",
        },
      ),
    );
    if (result.error) {
      redirect(withReturnMessage(returnTo, "error", "Gagal menyimpan data absensi."));
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("attendance_records").doc(payload.id).set({
        ...payload,
        created_at: createTimestamp(),
      }, { merge: true });
    });
  } else {
    return;
  }

  revalidatePath("/");
  revalidatePath("/attendance");
  revalidateAttendanceCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "create",
    module: "attendance",
    description: `Menambah absensi pekerja "${payload.worker_name}".`,
    payload: {
      project_id: payload.project_id,
      worker_name: payload.worker_name,
      team_type: payload.team_type,
      attendance_date: payload.attendance_date,
      work_days: payload.work_days,
      overtime_hours: payload.overtime_hours,
      overtime_wage: payload.overtime_wage,
      net_reference: Math.max(
        payload.daily_wage * payload.work_days +
          payload.overtime_hours * payload.overtime_wage -
          payload.kasbon_amount,
        0,
      ),
    },
  });
  redirect(withReturnMessage(returnTo, "success", "Data absensi berhasil disimpan."));
}
export async function updateAttendanceAction(formData: FormData) {
  const actor = await requireAttendanceActionUser();
  const attendanceId = getString(formData, "attendance_id");
  const projectId = getString(formData, "project_id");
  const workerName = getString(formData, "worker_name");
  const returnTo = getReturnTo(formData) ?? "/attendance";
  if (!attendanceId || !workerName) {
    redirect(withReturnMessage(returnTo, "error", "Data absensi yang akan diperbarui tidak valid."));
    return;
  }

  const status = getString(formData, "status");
  const parsedStatus = parseAttendanceStatusValue(status);

  const teamType = getParsedWorkerTeam(formData);
  const specialistTeamNameRaw = getString(formData, "specialist_team_name");
  const specialistTeamName = teamType === "spesialis" ? specialistTeamNameRaw || null : null;
  if (teamType === "spesialis" && !specialistTeamName) {
    redirect(withReturnMessage(returnTo, "error", "Tim spesialis / asal wajib diisi untuk pekerja spesialis."));
    return;
  }
  const dailyWage = getNumber(formData, "daily_wage");
  const overtimeHours = Math.max(getNumber(formData, "overtime_hours"), 0);
  const kasbonAmount = getNumber(formData, "kasbon_amount");
  const reimburseType = getParsedReimburseType(formData);
  const reimburseAmount = getNumber(formData, "reimburse_amount");
  const normalizedReimburseAmount =
    reimburseType && Number.isFinite(reimburseAmount) && reimburseAmount > 0 ? reimburseAmount : 0;
  const normalizedDailyWage =
    parsedStatus === "hadir" && Number.isFinite(dailyWage) ? dailyWage : 0;
  const normalizedOvertimeHours =
    parsedStatus === "hadir" && Number.isFinite(overtimeHours) ? overtimeHours : 0;
  const normalizedOvertimeWage =
    parsedStatus === "hadir" ? resolveAutoOvertimeWage(normalizedDailyWage) : 0;

  const payload = {
    id: attendanceId,
    project_id: projectId,
    worker_name: workerName,
    team_type: teamType,
    specialist_team_name: specialistTeamName,
    status: parsedStatus,
    work_days: Math.min(getPositiveInteger(formData, "work_days", 1), 31),
    daily_wage: normalizedDailyWage,
    overtime_hours: normalizedOvertimeHours,
    overtime_wage: normalizedOvertimeWage,
    kasbon_amount: Number.isFinite(kasbonAmount) ? kasbonAmount : 0,
    reimburse_type: reimburseType,
    reimburse_amount: normalizedReimburseAmount,
    attendance_date: getString(formData, "attendance_date") || getCurrentJakartaDate(),
    notes: resolveDraftAttendanceNotes({
      currentNotes: getString(formData, "notes") || null,
      specialistTeamName,
      source: "manual-input",
    }),
  };
  const duplicate = await findDuplicateAttendanceRecord([
    {
      id: payload.id,
      projectId: payload.project_id,
      workerName: payload.worker_name,
      teamType: payload.team_type,
      specialistTeamName: payload.specialist_team_name,
      attendanceDate: payload.attendance_date,
    },
  ]);
  if (duplicate) {
    redirect(
      withReturnMessage(
        returnTo,
        "error",
        "Data absensi pekerja dengan kombinasi tanggal dan tim yang sama sudah ada.",
      ),
    );
  }

  if (activeDataSource === "excel") {
    updateExcelAttendance(payload);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    const draftProjectId = payload.project_id || await ensureSupabaseAttendanceDraftProjectId(supabase);
    if (!draftProjectId) {
      redirect(withReturnMessage(returnTo, "error", "Gagal menyiapkan penyimpanan draft absensi."));
      return;
    }
    const attendancePayload = {
      project_id: draftProjectId,
      worker_name: payload.worker_name,
      team_type: payload.team_type,
      specialist_team_name: payload.specialist_team_name,
      status: payload.status,
      work_days: payload.work_days,
      daily_wage: payload.daily_wage,
      overtime_hours: payload.overtime_hours,
      overtime_wage: payload.overtime_wage,
      kasbon_amount: payload.kasbon_amount,
      reimburse_type: payload.reimburse_type,
      reimburse_amount: payload.reimburse_amount,
      attendance_date: payload.attendance_date,
      notes: payload.notes,
    };
    await withSupabaseSpecialistTeamNameFallback(({ omitSpecialistTeamName }) =>
      supabase
        .from("attendance_records")
        .update(omitSpecialistTeamNameField(attendancePayload, omitSpecialistTeamName))
        .eq("id", payload.id),
    );
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("attendance_records").doc(payload.id).set(
        {
          id: payload.id,
          project_id: payload.project_id,
          worker_name: payload.worker_name,
          team_type: payload.team_type,
          specialist_team_name: payload.specialist_team_name,
          status: payload.status,
          work_days: payload.work_days,
          daily_wage: payload.daily_wage,
          overtime_hours: payload.overtime_hours,
          overtime_wage: payload.overtime_wage,
          kasbon_amount: payload.kasbon_amount,
          reimburse_type: payload.reimburse_type,
          reimburse_amount: payload.reimburse_amount,
          attendance_date: payload.attendance_date,
          notes: payload.notes,
        },
        { merge: true },
      );
    });
  } else {
    return;
  }

  revalidatePath("/");
  revalidatePath("/attendance");
  revalidateAttendanceCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "update",
    module: "attendance",
    entityId: payload.id,
    description: `Memperbarui absensi pekerja "${payload.worker_name}".`,
    payload: {
      project_id: payload.project_id,
      team_type: payload.team_type,
      attendance_date: payload.attendance_date,
      work_days: payload.work_days,
      daily_wage: payload.daily_wage,
      overtime_hours: payload.overtime_hours,
      overtime_wage: payload.overtime_wage,
      kasbon_amount: payload.kasbon_amount,
    },
  });
  redirect(withReturnMessage(returnTo, "success", "Perubahan absensi berhasil disimpan."));
}
export async function prepareAttendanceExportAction(formData: FormData) {
  const actor = await requireAttendanceActionUser();
  const returnTo = getReturnTo(formData) ?? "/attendance";
  const rows = buildAttendanceRecapRowsFromFormData(formData);
  const exportKind = getString(formData, "export_kind");
  const globalSpecialistTeamName = getString(formData, "specialist_team_name_global");
  const previewKind = exportKind === "excel" ? "excel" : "pdf";
  const reimburseAmounts = getNumberValues(formData, "reimburse_amount");
  const reimburseNotes = getStringValues(formData, "reimburse_note");

  if (rows.length === 0) {
    redirect(withReturnMessage(returnTo, "error", "Pilih data absensi yang ingin direkap."));
  }

  if (rows.some((row) => !row.project_id.trim())) {
    redirect(
      withReturnMessage(
        returnTo,
        "error",
        "Project global wajib dipilih sebelum export.",
      ),
    );
  }

  if (
    rows.some(
      (row) => row.team_type === "spesialis" && !(row.specialist_team_name ?? "").trim(),
    )
  ) {
    redirect(
      withReturnMessage(
        returnTo,
        "error",
        "Semua pekerja spesialis wajib memiliki tim kerja final saat export.",
      ),
    );
  }

  const duplicate = await findDuplicateAttendanceRecord(
    rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      workerName: row.worker_name,
      teamType: row.team_type,
      specialistTeamName: row.specialist_team_name,
      attendanceDate: row.attendance_date,
    })),
  );
  if (duplicate) {
    redirect(
      withReturnMessage(
        returnTo,
        "error",
        "Terdapat data duplikat saat finalisasi rekap. Cek project atau tanggal pekerja yang dipilih.",
      ),
    );
  }

  const payrollResets = rows.map((row) => ({
    id: createPayrollResetMutationId({
      projectId: row.project_id,
      workerName: row.worker_name,
      teamType: row.team_type,
      specialistTeamName: row.specialist_team_name,
      paidUntilDate: row.attendance_date,
    }),
    project_id: row.project_id,
    team_type: row.team_type,
    specialist_team_name: row.specialist_team_name,
    worker_name: row.worker_name,
    paid_until_date: row.attendance_date,
  }));

  if (activeDataSource === "excel") {
    upsertManyExcelAttendance(rows);
    upsertManyExcelPayrollResets(payrollResets);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }

    const [attendanceResult, payrollResult] = await Promise.all([
      withSupabaseSpecialistTeamNameFallback(({ omitSpecialistTeamName }) =>
        supabase.from("attendance_records").upsert(
          rows.map((row) =>
            omitSpecialistTeamNameField(
              {
                id: row.id,
                project_id: row.project_id,
                worker_name: row.worker_name,
                team_type: row.team_type,
                specialist_team_name: row.specialist_team_name,
                status: row.status,
                work_days: row.work_days,
                daily_wage: row.daily_wage,
                overtime_hours: row.overtime_hours,
                overtime_wage: row.overtime_wage,
                kasbon_amount: row.kasbon_amount,
                reimburse_type: row.reimburse_type,
                reimburse_amount: row.reimburse_amount,
                attendance_date: row.attendance_date,
                notes: row.notes,
              },
              omitSpecialistTeamName,
            ),
          ),
          {
            onConflict: "id",
          },
        ),
      ),
      withSupabaseSpecialistTeamNameFallback(({ omitSpecialistTeamName }) =>
        supabase.from("payroll_resets").upsert(
          payrollResets.map((row) =>
            omitSpecialistTeamNameField(
              {
                id: row.id,
                project_id: row.project_id,
                team_type: row.team_type,
                specialist_team_name: row.specialist_team_name,
                worker_name: row.worker_name,
                paid_until_date: row.paid_until_date,
              },
              omitSpecialistTeamName,
            ),
          ),
          {
            onConflict: "id",
          },
        ),
      ),
    ]);

    if (attendanceResult.error || payrollResult.error) {
      redirect(withReturnMessage(returnTo, "error", "Gagal menyimpan finalisasi rekap."));
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }

    await runFirebaseWriteSafely(async () => {
      const batch = firestore.batch();
      for (const row of rows) {
        batch.set(
          firestore.collection("attendance_records").doc(row.id),
          {
            id: row.id,
            project_id: row.project_id,
            worker_name: row.worker_name,
            team_type: row.team_type,
            specialist_team_name: row.specialist_team_name,
            status: row.status,
            work_days: row.work_days,
            daily_wage: row.daily_wage,
            overtime_hours: row.overtime_hours,
            overtime_wage: row.overtime_wage,
            kasbon_amount: row.kasbon_amount,
            reimburse_type: row.reimburse_type,
            reimburse_amount: row.reimburse_amount,
            attendance_date: row.attendance_date,
            notes: row.notes,
            created_at: createTimestamp(),
          },
          { merge: true },
        );
      }

      for (const row of payrollResets) {
        batch.set(
          firestore.collection("payroll_resets").doc(row.id),
          {
            ...row,
            created_at: createTimestamp(),
          },
          { merge: true },
        );
      }

      await batch.commit();
    });
  } else {
    return;
  }

  revalidatePath("/");
  revalidatePath("/attendance");
  revalidateAttendanceCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "confirm",
    module: "attendance",
    description: `Menyiapkan export rekap absensi ${rows.length} pekerja.`,
    payload: {
      attendance_ids: rows.map((row) => row.id),
      worker_names: rows.map((row) => row.worker_name),
      project_ids: rows.map((row) => row.project_id),
      export_kind: previewKind,
    },
  });

  const recapProjectIds = Array.from(
    new Set(rows.map((row) => row.project_id.trim()).filter((item) => item.length > 0)),
  );
  const nextUrl = withReturnParams(returnTo, (params) => {
    params.set("modal", "preview-export");
    params.set("preview_kind", previewKind);
    params.delete("selected");
    for (const row of rows) {
      params.append("selected", row.id);
    }
    if (recapProjectIds.length === 1) {
      params.set("project", recapProjectIds[0]);
    } else {
      params.delete("project");
    }
    params.delete("success");
    params.delete("error");
    params.delete("reimburse_amount");
    params.delete("reimburse_note");
    if (globalSpecialistTeamName) {
      params.set("specialist_team_name_global", globalSpecialistTeamName);
    } else {
      params.delete("specialist_team_name_global");
    }

    const maxRows = Math.max(reimburseAmounts.length, reimburseNotes.length);
    for (let index = 0; index < maxRows; index += 1) {
      const amount = reimburseAmounts[index] ?? 0;
      const note = reimburseNotes[index] ?? "";
      if (amount > 0) {
        params.append("reimburse_amount", String(amount));
      } else if (note.trim()) {
        params.append("reimburse_amount", "0");
      }
      if (note.trim()) {
        params.append("reimburse_note", note.trim());
      } else if (amount > 0) {
        params.append("reimburse_note", "");
      }
    }
  });

  redirect(nextUrl);
}
export async function deleteAttendanceAction(formData: FormData) {
  const actor = await requireAttendanceActionUser();
  const attendanceId = getString(formData, "attendance_id");
  if (!attendanceId) {
    return;
  }
  const returnTo = getReturnTo(formData);

  if (activeDataSource === "excel") {
    deleteExcelAttendance(attendanceId);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase.from("attendance_records").delete().eq("id", attendanceId);
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("attendance_records").doc(attendanceId).delete();
    });
  } else {
    return;
  }

  revalidatePath("/");
  revalidatePath("/attendance");
  revalidateAttendanceCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "delete",
    module: "attendance",
    entityId: attendanceId,
    description: "Menghapus data absensi.",
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
