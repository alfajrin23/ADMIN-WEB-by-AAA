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
export async function confirmPayrollPaidAction(formData: FormData) {
  const actor = await requireAttendanceActionUser();
  const projectId = getString(formData, "project_id");
  const teamType = getParsedWorkerTeam(formData);
  if (!projectId) {
    return;
  }

  const paidUntilDate = getString(formData, "paid_until_date") || getCurrentJakartaDate();
  const specialistTeamNameRaw = getString(formData, "specialist_team_name");
  const specialistTeamName = teamType === "spesialis" ? specialistTeamNameRaw || null : null;
  const workerName = getString(formData, "worker_name") || null;
  const payload = {
    id: createPayrollResetMutationId({
      projectId,
      workerName,
      teamType,
      specialistTeamName,
      paidUntilDate,
    }),
    project_id: projectId,
    team_type: teamType,
    specialist_team_name: specialistTeamName,
    worker_name: workerName,
    paid_until_date: paidUntilDate,
  };
  const returnTo = getReturnTo(formData);

  if (activeDataSource === "excel") {
    insertExcelPayrollReset(payload);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    const result = await withSupabaseSpecialistTeamNameFallback(({ omitSpecialistTeamName }) =>
      supabase.from("payroll_resets").upsert(
        omitSpecialistTeamNameField(
          {
            id: payload.id,
            project_id: payload.project_id,
            team_type: payload.team_type,
            specialist_team_name: payload.specialist_team_name,
            worker_name: payload.worker_name,
            paid_until_date: payload.paid_until_date,
          },
          omitSpecialistTeamName,
        ),
        {
          onConflict: "id",
        },
      ),
    );
    if (result.error) {
      // fallback when table is not available yet
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("payroll_resets").doc(payload.id).set({
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
    actionType: "confirm",
    module: "payroll",
    description: "Konfirmasi status gaji pekerja.",
    payload: {
      project_id: payload.project_id,
      team_type: payload.team_type,
      specialist_team_name: payload.specialist_team_name,
      worker_name: payload.worker_name,
      paid_until_date: payload.paid_until_date,
    },
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
