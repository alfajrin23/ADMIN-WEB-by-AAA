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
export async function updateActivityLogAction(formData: FormData) {
  const actor = await requireLogsActionUser();
  const logId = getString(formData, "log_id");
  const description = getString(formData, "description");
  const payloadJson = getString(formData, "payload_json");
  const returnTo = getReturnTo(formData) ?? "/logs";

  if (!logId) {
    redirect(withReturnMessage(returnTo, "error", "ID log wajib diisi."));
  }
  if (!description) {
    redirect(withReturnMessage(returnTo, "error", "Deskripsi log wajib diisi."));
  }

  let payload: Record<string, unknown> | null = null;
  if (payloadJson.length > 0) {
    try {
      const parsed = JSON.parse(payloadJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        redirect(
          withReturnMessage(
            returnTo,
            "error",
            "Payload JSON harus berbentuk object (contoh: {\"key\":\"value\"}).",
          ),
        );
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      redirect(withReturnMessage(returnTo, "error", "Payload JSON tidak valid."));
    }
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    redirect(withReturnMessage(returnTo, "error", "Supabase belum terkonfigurasi."));
  }

  const { error } = await supabase
    .from("activity_logs")
    .update({
      description,
      payload,
    })
    .eq("id", logId);

  if (error) {
    redirect(withReturnMessage(returnTo, "error", "Gagal memperbarui data log."));
  }

  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "update",
    module: "activity_log",
    entityId: logId,
    description: "Memperbarui detail log aktivitas.",
    payload: {
      target_log_id: logId,
    },
  });

  redirect(withReturnMessage(returnTo, "success", "Log aktivitas berhasil diperbarui."));
}
