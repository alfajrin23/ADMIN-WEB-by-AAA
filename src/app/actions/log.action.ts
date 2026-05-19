"use server";
import { createHash, randomUUID } from "node:crypto";
import { getString, getStringList, getNumber, getStringValues, getNumberValues, getPositiveInteger, parseYearInput, replaceDateYearKeepingMonthDay, getReturnTo, withReturnMessage, withReturnParams, isChecked, revalidateProjectPages, revalidateProjectCache, revalidateExpenseCache, revalidateAttendanceCache, requireEditorActionUser, requireAttendanceActionUser, requireImportActionUser, requireLogsActionUser, createTimestamp, createDeterministicUuid, ensureSupabaseAttendanceDraftProjectId, resolveDraftAttendanceNotes, resolveFinalAttendanceNotes, parseAttendanceStatusValue, parseWorkerTeamValue, normalizeAttendanceIdentityText, createAttendanceMutationId, createPayrollResetMutationId, resolveAutoOvertimeWage, AttendanceDuplicateCheckInput, AttendanceDuplicateCheckRow, hasSameAttendanceIdentity, findDuplicateAttendanceRecord, getExpenseSubmissionToken, createExpenseMutationId, shouldSyncExpenseCategory, parseProjectInitialCategories, buildSupabaseCategoryRows, upsertSupabaseCategories, isFirebaseNotFoundError, hasWarnedFirebaseWriteDatabaseMissing, runFirebaseWriteSafely, deleteFirebaseDocsByField, ParsedTemplateImportData, normalizeImportText, normalizeImportNumber, buildImportExpenseSignature, chunkArray, importTemplateDataToSupabase, importTemplateDataToFirebase, getParsedCategory, getSpecialistType, getParsedWorkerTeam, getParsedReimburseType, resolveAmountByMode, getExpenseTargetProjectIds, parsePositiveAmount, createHokExpenseEntries, createScraperExpenseEntries, AttendanceRecapRowInput, resolveAttendanceExportRowId, buildAttendanceRecapRowsFromFormData, ensureSupabaseWriteConfigured, getSupabaseMutationErrorMessage } from "./utils";

import { revalidatePath } from "next/cache";
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

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getRecordStringValue(record: Record<string, unknown> | null, key: string) {
  if (!record) {
    return "";
  }
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function getRecordStringValues(record: Record<string, unknown> | null, key: string) {
  if (!record) {
    return [];
  }
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getRecordPositiveIntegerValue(record: Record<string, unknown> | null, key: string) {
  if (!record) {
    return 0;
  }
  const value = record[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function getExpenseIdsFromLogPayload(payload: Record<string, unknown> | null, entityId: string | null) {
  const ids = new Set<string>();
  for (const id of getRecordStringValues(payload, "expense_ids")) {
    ids.add(id);
  }
  const payloadExpenseId = getRecordStringValue(payload, "expense_id");
  if (payloadExpenseId) {
    ids.add(payloadExpenseId);
  }
  if (entityId) {
    ids.add(entityId);
  }
  return [...ids];
}

async function resolveExpenseIdsFromActivityLog(input: {
  module: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}) {
  if (input.module !== "expense") {
    return { expenseIds: [], errorMessage: "Log ini bukan aktivitas biaya." };
  }

  const directExpenseIds = getExpenseIdsFromLogPayload(input.payload, input.entityId);
  if (directExpenseIds.length > 0) {
    return { expenseIds: directExpenseIds, errorMessage: "" };
  }

  const entryCount = getRecordPositiveIntegerValue(input.payload, "entry_count");
  const projectIds = getRecordStringValues(input.payload, "project_ids");
  const expenseMode = getRecordStringValue(input.payload, "expense_mode");
  if (!expenseMode || entryCount === 0 || projectIds.length === 0) {
    return {
      expenseIds: [],
      errorMessage: "Log ini belum memiliki daftar ID biaya yang bisa dihapus otomatis.",
    };
  }

  if (activeDataSource !== "supabase") {
    return {
      expenseIds: [],
      errorMessage: "Log lama tanpa daftar ID biaya hanya bisa dipastikan otomatis pada Supabase.",
    };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { expenseIds: [], errorMessage: "Supabase belum terkonfigurasi." };
  }

  const logDate = new Date(input.createdAt);
  if (Number.isNaN(logDate.getTime())) {
    return { expenseIds: [], errorMessage: "Waktu log tidak valid." };
  }

  const fromDate = new Date(logDate.getTime() - 2 * 60 * 1000).toISOString();
  const toDate = new Date(logDate.getTime() + 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("project_expenses")
    .select("id, created_at")
    .in("project_id", projectIds)
    .gte("created_at", fromDate)
    .lte("created_at", toDate)
    .order("created_at", { ascending: false })
    .limit(entryCount + 1);

  if (error) {
    return { expenseIds: [], errorMessage: "Gagal membaca kandidat data biaya dari log lama." };
  }

  const candidateIds = (data ?? [])
    .map((row) => String(row.id ?? "").trim())
    .filter((id) => id.length > 0);
  if (candidateIds.length !== entryCount) {
    return {
      expenseIds: [],
      errorMessage: `Log lama ini belum punya expense_ids dan kandidat data tidak unik (${candidateIds.length} kandidat untuk ${entryCount} entry).`,
    };
  }

  return { expenseIds: candidateIds, errorMessage: "" };
}

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
  if (!ensureSupabaseWriteConfigured(returnTo, "Gagal memperbarui data log.")) {
    return;
  }

  const { error } = await supabase
    .from("activity_logs")
    .update({
      description,
      payload,
    })
    .eq("id", logId);

  if (error) {
    redirect(withReturnMessage(returnTo, "error", getSupabaseMutationErrorMessage("Gagal memperbarui data log.")));
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

export async function deleteExpenseDataFromActivityLogAction(formData: FormData) {
  const actor = await requireLogsActionUser();
  const logId = getString(formData, "log_id");
  const returnTo = getReturnTo(formData) ?? "/logs";

  if (!logId) {
    redirect(withReturnMessage(returnTo, "error", "ID log wajib diisi."));
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    redirect(withReturnMessage(returnTo, "error", "Supabase belum terkonfigurasi."));
  }
  if (!ensureSupabaseWriteConfigured(returnTo, "Gagal menghapus data biaya dari database.")) {
    return;
  }

  const { data: logRow, error: logError } = await supabase
    .from("activity_logs")
    .select("id, action_type, module, entity_id, payload, created_at")
    .eq("id", logId)
    .maybeSingle();

  if (logError || !logRow) {
    redirect(withReturnMessage(returnTo, "error", "Log aktivitas tidak ditemukan."));
  }
  if (String(logRow.action_type ?? "").toLowerCase().startsWith("delete")) {
    redirect(withReturnMessage(returnTo, "error", "Data pada log hapus sudah diproses sebelumnya."));
  }

  const payload = toRecord(logRow.payload);
  const { expenseIds, errorMessage } = await resolveExpenseIdsFromActivityLog({
    module: String(logRow.module ?? ""),
    entityId: logRow.entity_id ? String(logRow.entity_id) : null,
    payload,
    createdAt: String(logRow.created_at ?? ""),
  });

  if (errorMessage || expenseIds.length === 0) {
    redirect(withReturnMessage(returnTo, "error", errorMessage || "Tidak ada data biaya yang bisa dihapus."));
  }

  if (activeDataSource === "excel") {
    deleteManyExcelExpenses(expenseIds);
  } else if (activeDataSource === "supabase") {
    const { error } = await supabase.from("project_expenses").delete().in("id", expenseIds);
    if (error) {
      redirect(withReturnMessage(returnTo, "error", getSupabaseMutationErrorMessage("Gagal menghapus data biaya dari database.")));
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      redirect(withReturnMessage(returnTo, "error", "Firebase belum terkonfigurasi."));
    }
    await runFirebaseWriteSafely(async () => {
      let batch = firestore.batch();
      let count = 0;
      for (const expenseId of expenseIds) {
        batch.delete(firestore.collection("project_expenses").doc(expenseId));
        count += 1;
        if (count >= 400) {
          await batch.commit();
          batch = firestore.batch();
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    });
  } else {
    redirect(withReturnMessage(returnTo, "error", "Sumber data aktif tidak dikenali."));
  }

  revalidateProjectPages();
  revalidateExpenseCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "delete_bulk",
    module: "expense",
    description: `Menghapus ${expenseIds.length} data biaya dari log input.`,
    payload: {
      source_log_id: logId,
      expense_ids: expenseIds,
    },
  });

  redirect(
    withReturnMessage(
      returnTo,
      "success",
      `${expenseIds.length} data biaya dari log input berhasil dihapus.`,
    ),
  );
}
