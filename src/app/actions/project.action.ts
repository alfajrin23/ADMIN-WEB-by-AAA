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
export async function createProjectAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const name = getString(formData, "name");
  if (!name) {
    return;
  }

  const status = getString(formData, "status");
  const parsedStatus: ProjectStatus = PROJECT_STATUSES.some((item) => item.value === status)
    ? (status as ProjectStatus)
    : "aktif";
  const returnTo = getReturnTo(formData);

  const payload = {
    name,
    code: getString(formData, "code") || null,
    client_name: getString(formData, "client_name") || null,
    start_date: getString(formData, "start_date") || null,
    status: parsedStatus,
  };
  const initialCategories = parseProjectInitialCategories(formData);

  if (activeDataSource === "excel") {
    insertExcelProject(payload);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await Promise.all([
      upsertSupabaseCategories(supabase, initialCategories),
      supabase.from("projects").insert(payload),
    ]);
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    const id = randomUUID();
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("projects").doc(id).set({
        id,
        ...payload,
        created_at: createTimestamp(),
      });
    });
  } else {
    return;
  }

  revalidateProjectPages();
  revalidateProjectCache();
  revalidateExpenseCache();
  revalidatePath("/attendance");
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "create",
    module: "project",
    entityName: payload.name,
    description: `Menambah project "${payload.name}".`,
    payload: {
      code: payload.code,
      client_name: payload.client_name,
      start_date: payload.start_date,
      status: payload.status,
      initial_categories: initialCategories,
    },
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
export async function updateProjectAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const id = getString(formData, "project_id");
  const name = getString(formData, "name");
  if (!id || !name) {
    return;
  }

  const status = getString(formData, "status");
  const parsedStatus: ProjectStatus = PROJECT_STATUSES.some((item) => item.value === status)
    ? (status as ProjectStatus)
    : "aktif";
  const returnTo = getReturnTo(formData);

  const payload = {
    id,
    name,
    code: getString(formData, "code") || null,
    client_name: getString(formData, "client_name") || null,
    start_date: getString(formData, "start_date") || null,
    status: parsedStatus,
  };

  if (activeDataSource === "excel") {
    updateExcelProject(payload);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase
      .from("projects")
      .update({
        name: payload.name,
        code: payload.code,
        client_name: payload.client_name,
        start_date: payload.start_date,
        status: payload.status,
      })
      .eq("id", payload.id);
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("projects").doc(payload.id).set(
        {
          id: payload.id,
          name: payload.name,
          code: payload.code,
          client_name: payload.client_name,
          start_date: payload.start_date,
          status: payload.status,
        },
        { merge: true },
      );
    });
  } else {
    return;
  }

  revalidateProjectPages();
  revalidateProjectCache();
  revalidatePath("/attendance");
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "update",
    module: "project",
    entityId: payload.id,
    entityName: payload.name,
    description: `Memperbarui project "${payload.name}".`,
    payload: {
      code: payload.code,
      client_name: payload.client_name,
      start_date: payload.start_date,
      status: payload.status,
    },
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
export async function updateManyProjectsAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const projectIds = getStringList(formData, "project");
  if (projectIds.length === 0) {
    return;
  }

  const returnTo = getReturnTo(formData);
  const applyStatus = isChecked(formData, "apply_status");
  const applyClientName = isChecked(formData, "apply_client_name");
  const applyStartDate = isChecked(formData, "apply_start_date");

  const patch: Partial<{
    client_name: string | null;
    start_date: string | null;
    status: ProjectStatus;
  }> = {};

  if (applyStatus) {
    const status = getString(formData, "status");
    patch.status = PROJECT_STATUSES.some((item) => item.value === status)
      ? (status as ProjectStatus)
      : "aktif";
  }
  if (applyClientName) {
    patch.client_name = getString(formData, "client_name") || null;
  }
  if (applyStartDate) {
    patch.start_date = getString(formData, "start_date") || null;
  }

  const updatedFields = Object.keys(patch);
  if (updatedFields.length === 0) {
    return;
  }

  if (activeDataSource === "excel") {
    updateManyExcelProjects(projectIds, patch);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase.from("projects").update(patch).in("id", projectIds);
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }

    await runFirebaseWriteSafely(async () => {
      let batch = firestore.batch();
      let count = 0;
      for (const projectId of projectIds) {
        batch.set(firestore.collection("projects").doc(projectId), patch, { merge: true });
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
    return;
  }

  revalidateProjectPages();
  revalidateProjectCache();
  revalidatePath("/attendance");
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "update_bulk",
    module: "project",
    description: `Memperbarui ${projectIds.length} project secara massal.`,
    payload: {
      project_ids: projectIds,
      fields: updatedFields,
    },
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
export async function deleteProjectAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const projectId = getString(formData, "project_id");
  if (!projectId) {
    return;
  }
  const returnTo = getReturnTo(formData);

  if (activeDataSource === "excel") {
    deleteExcelProject(projectId);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase.from("projects").delete().eq("id", projectId);
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      await Promise.all([
        deleteFirebaseDocsByField("project_expenses", "project_id", projectId),
        deleteFirebaseDocsByField("attendance_records", "project_id", projectId),
        deleteFirebaseDocsByField("payroll_resets", "project_id", projectId),
      ]);
      await firestore.collection("projects").doc(projectId).delete();
    });
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
    actionType: "delete",
    module: "project",
    entityId: projectId,
    description: "Menghapus project beserta data turunannya.",
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
export async function deleteSelectedProjectsAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const projectIds = getStringList(formData, "project");
  if (projectIds.length === 0) {
    return;
  }

  const returnTo = getReturnTo(formData);

  if (activeDataSource === "excel") {
    deleteManyExcelProjects(projectIds);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase.from("projects").delete().in("id", projectIds);
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }

    await runFirebaseWriteSafely(async () => {
      await Promise.all(
        projectIds.map(async (projectId) => {
          await Promise.all([
            deleteFirebaseDocsByField("project_expenses", "project_id", projectId),
            deleteFirebaseDocsByField("attendance_records", "project_id", projectId),
            deleteFirebaseDocsByField("payroll_resets", "project_id", projectId),
          ]);
          await firestore.collection("projects").doc(projectId).delete();
        }),
      );
    });
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
    actionType: "delete_bulk",
    module: "project",
    description: `Menghapus ${projectIds.length} project terpilih.`,
    payload: {
      project_ids: projectIds,
    },
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
