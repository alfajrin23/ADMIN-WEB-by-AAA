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
export async function importExcelTemplateAction(formData: FormData) {
  const actor = await requireImportActionUser();
  const returnTo = getReturnTo(formData);
  const uploadedFile = formData.get("template_file");
  let uploadedBuffer: Uint8Array | null = null;
  if (uploadedFile instanceof File && uploadedFile.size > 0) {
    const fileName = uploadedFile.name.toLowerCase();
    if (!fileName.endsWith(".xlsx")) {
      return;
    }
    const arrayBuffer = await uploadedFile.arrayBuffer();
    uploadedBuffer = new Uint8Array(arrayBuffer);
  }

  const templatePath = getString(formData, "template_path") || undefined;

  if (activeDataSource === "excel") {
    if (uploadedBuffer) {
      importTemplateExcelDatabaseFromBuffer(uploadedBuffer);
    } else {
      importTemplateExcelDatabase(templatePath);
    }
  } else if (activeDataSource === "supabase" || activeDataSource === "firebase") {
    const parsed = uploadedBuffer
      ? parseTemplateExcelDataFromBuffer(uploadedBuffer)
      : parseTemplateExcelData(templatePath);
    if (!parsed) {
      return;
    }
    if (activeDataSource === "supabase") {
      await importTemplateDataToSupabase(parsed);
    } else {
      await importTemplateDataToFirebase(parsed);
    }
  } else {
    return;
  }

  revalidateProjectPages();
  revalidateProjectCache();
  revalidateExpenseCache();
  revalidateAttendanceCache();
  revalidatePath("/attendance");
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "import",
    module: "expense",
    description: "Melakukan import template Excel.",
    payload: {
      has_uploaded_file: Boolean(uploadedBuffer),
      template_path: templatePath ?? null,
      data_source: activeDataSource,
    },
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
