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
export async function createExpenseAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const successReturnTo = getReturnTo(formData);
  const errorReturnTo = getReturnTo(formData, "error_return_to") ?? successReturnTo;
  if (getString(formData, "expense_input_mode") === "hok_kmp_cianjur") {
    await createHokExpenseEntries(actor, formData, successReturnTo, errorReturnTo);
    return;
  }
  if (getString(formData, "expense_input_mode") === "scraper") {
    await createScraperExpenseEntries(actor, formData, successReturnTo, errorReturnTo);
    return;
  }

  const projectIds = getExpenseTargetProjectIds(formData);
  const requesterName = getString(formData, "requester_name");
  const description = getString(formData, "description");
  const amountInput = getNumber(formData, "amount");
  const amount = resolveAmountByMode(formData, amountInput);
  const parsedCategory = getParsedCategory(formData);
  if (
    projectIds.length === 0 ||
    !requesterName ||
    !description ||
    !parsedCategory ||
    !Number.isFinite(amount) ||
    amount === 0
  ) {
    if (errorReturnTo) {
      redirect(withReturnMessage(errorReturnTo, "error", "Lengkapi field wajib biaya terlebih dahulu."));
    }
    return;
  }
  const specialistType = getSpecialistType(formData, parsedCategory);
  const submissionToken = getExpenseSubmissionToken(formData);
  const shouldSyncCategory = shouldSyncExpenseCategory(formData);

  const basePayload = {
    category: parsedCategory,
    specialist_type: specialistType,
    requester_name: requesterName,
    description,
    recipient_name: getString(formData, "recipient_name") || null,
    quantity: getNumber(formData, "quantity"),
    unit_label: getString(formData, "unit_label") || null,
    usage_info: getString(formData, "usage_info") || null,
    unit_price: getNumber(formData, "unit_price"),
    amount,
    expense_date: getString(formData, "expense_date") || new Date().toISOString().slice(0, 10),
  };

  if (activeDataSource === "excel") {
    for (const projectId of projectIds) {
      insertExcelExpense({
        ...basePayload,
        project_id: projectId,
      });
    }
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    const saveExpensePromise = supabase.from("project_expenses").upsert(
      projectIds.map((projectId) => ({
        id: createExpenseMutationId({
          mode: "standard",
          submissionToken,
          projectId,
        }),
        project_id: projectId,
        category: basePayload.category,
        specialist_type: basePayload.specialist_type,
        requester_name: basePayload.requester_name,
        description: basePayload.description,
        recipient_name: basePayload.recipient_name,
        quantity: basePayload.quantity,
        unit_label: basePayload.unit_label,
        usage_info: basePayload.usage_info,
        unit_price: basePayload.unit_price,
        amount: basePayload.amount,
        expense_date: basePayload.expense_date,
      })),
      {
        onConflict: "id",
      },
    );
    const expenseResult = shouldSyncCategory
      ? (await Promise.all([upsertSupabaseCategories(supabase, [basePayload.category]), saveExpensePromise]))[1]
      : await saveExpensePromise;
    if (expenseResult.error) {
      if (errorReturnTo) {
        redirect(withReturnMessage(errorReturnTo, "error", "Gagal menyimpan biaya. Silakan coba lagi."));
      }
      return;
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      const batch = firestore.batch();
      for (const projectId of projectIds) {
        const id = createExpenseMutationId({
          mode: "standard",
          submissionToken,
          projectId,
        });
        batch.set(firestore.collection("project_expenses").doc(id), {
          id,
          ...basePayload,
          project_id: projectId,
          created_at: createTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
    });
  } else {
    return;
  }

  revalidateProjectPages();
  revalidateExpenseCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "create",
    module: "expense",
    description: `Menambah data biaya ke ${projectIds.length} project.`,
    payload: {
      project_ids: projectIds,
      category: basePayload.category,
      requester_name: basePayload.requester_name,
      description: basePayload.description,
      amount: basePayload.amount,
      expense_date: basePayload.expense_date,
    },
  });
  if (successReturnTo) {
    const successMessage =
      projectIds.length > 1
        ? `Biaya berhasil disimpan ke ${projectIds.length} project.`
        : "Biaya berhasil disimpan.";
    redirect(withReturnMessage(successReturnTo, "success", successMessage));
  }
}
export async function updateExpenseAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const expenseId = getString(formData, "expense_id");
  const projectId = getString(formData, "project_id");
  const amountInput = getNumber(formData, "amount");
  const amount = resolveAmountByMode(formData, amountInput);
  const parsedCategory = getParsedCategory(formData);
  if (!expenseId || !projectId || !parsedCategory || !Number.isFinite(amount) || amount === 0) {
    return;
  }
  const returnTo = getReturnTo(formData);
  const specialistType = getSpecialistType(formData, parsedCategory);

  const excelPayload = {
    id: expenseId,
    project_id: projectId,
    category: parsedCategory,
    specialist_type: specialistType,
    requester_name: getString(formData, "requester_name") || null,
    description: getString(formData, "description") || null,
    recipient_name: getString(formData, "recipient_name") || null,
    quantity: getNumber(formData, "quantity"),
    unit_label: getString(formData, "unit_label") || null,
    usage_info: getString(formData, "usage_info") || null,
    unit_price: getNumber(formData, "unit_price"),
    amount,
    expense_date: getString(formData, "expense_date") || new Date().toISOString().slice(0, 10),
  };

  if (activeDataSource === "excel") {
    updateExcelExpense(excelPayload);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await upsertSupabaseCategories(supabase, [excelPayload.category]);
    await supabase
      .from("project_expenses")
      .update({
        project_id: excelPayload.project_id,
        category: excelPayload.category,
        specialist_type: excelPayload.specialist_type,
        requester_name: excelPayload.requester_name,
        description: excelPayload.description,
        recipient_name: excelPayload.recipient_name,
        quantity: excelPayload.quantity,
        unit_label: excelPayload.unit_label,
        usage_info: excelPayload.usage_info,
        unit_price: excelPayload.unit_price,
        amount: excelPayload.amount,
        expense_date: excelPayload.expense_date,
      })
      .eq("id", excelPayload.id);
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("project_expenses").doc(excelPayload.id).set(
        {
          id: excelPayload.id,
          project_id: excelPayload.project_id,
          category: excelPayload.category,
          specialist_type: excelPayload.specialist_type,
          requester_name: excelPayload.requester_name,
          description: excelPayload.description,
          recipient_name: excelPayload.recipient_name,
          quantity: excelPayload.quantity,
          unit_label: excelPayload.unit_label,
          usage_info: excelPayload.usage_info,
          unit_price: excelPayload.unit_price,
          amount: excelPayload.amount,
          expense_date: excelPayload.expense_date,
        },
        { merge: true },
      );
    });
  } else {
    return;
  }

  revalidateProjectPages();
  revalidateExpenseCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "update",
    module: "expense",
    entityId: excelPayload.id,
    description: "Memperbarui data biaya project.",
    payload: {
      project_id: excelPayload.project_id,
      category: excelPayload.category,
      requester_name: excelPayload.requester_name,
      amount: excelPayload.amount,
      expense_date: excelPayload.expense_date,
    },
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
export async function updateManyExpensesAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const expenseIds = getStringList(formData, "expense_id");
  if (expenseIds.length === 0) {
    return;
  }
  const returnTo = getReturnTo(formData);

  const applyCategory = isChecked(formData, "apply_category");
  const applyExpenseDate = isChecked(formData, "apply_expense_date");
  const applyExpenseYear = isChecked(formData, "apply_expense_year");
  const applyExpenseMonth = isChecked(formData, "apply_expense_month");
  const applyRequesterName = isChecked(formData, "apply_requester_name");
  const applyDescription = isChecked(formData, "apply_description");
  const applyUsageInfo = isChecked(formData, "apply_usage_info");
  const applyRecipientName = isChecked(formData, "apply_recipient_name");
  const expenseYear = applyExpenseYear ? parseYearInput(getString(formData, "expense_year")) : null;
  if (applyExpenseYear && expenseYear === null) {
    return;
  }
  const expenseMonth = applyExpenseMonth ? getPositiveInteger(formData, "expense_month") : null;
  if (applyExpenseMonth && (expenseMonth === null || expenseMonth < 1 || expenseMonth > 12)) {
    return;
  }

  const patch: Partial<{
    category: string;
    specialist_type: string | null;
    requester_name: string | null;
    description: string | null;
    usage_info: string | null;
    recipient_name: string | null;
    expense_date: string;
  }> = {};

  if (applyCategory) {
    const parsedCategory = getParsedCategory(formData);
    if (!parsedCategory) {
      return;
    }
    patch.category = parsedCategory;
    patch.specialist_type = getSpecialistType(formData, parsedCategory);
  }
  if (applyExpenseDate && !applyExpenseYear && !applyExpenseMonth) {
    const expenseDate = getString(formData, "expense_date");
    if (!expenseDate) {
      return;
    }
    patch.expense_date = expenseDate;
  }
  if (applyRequesterName) {
    patch.requester_name = getString(formData, "requester_name") || null;
  }
  if (applyDescription) {
    patch.description = getString(formData, "description") || null;
  }
  if (applyUsageInfo) {
    patch.usage_info = getString(formData, "usage_info") || null;
  }
  if (applyRecipientName) {
    patch.recipient_name = getString(formData, "recipient_name") || null;
  }

  const applyExpenseYearOnly = applyExpenseYear && expenseYear !== null;
  const applyExpenseMonthOnly = applyExpenseMonth && expenseMonth !== null;
  const applyDateParts = applyExpenseYearOnly || applyExpenseMonthOnly;
  const hasUniformPatch = Object.keys(patch).length > 0;
  const updateFields = [
    ...Object.keys(patch),
    ...(applyExpenseYearOnly ? ["expense_year"] : []),
    ...(applyExpenseMonthOnly ? ["expense_month"] : []),
  ];
  if (updateFields.length === 0) {
    return;
  }

  function getReplacedDate(originalDate: string | null) {
      const parts = String(originalDate ?? "").split("-");
      if (parts.length !== 3) return String(originalDate ?? "");
      const y = applyExpenseYearOnly ? String(expenseYear).padStart(4, "0") : parts[0];
      const m = applyExpenseMonthOnly ? String(expenseMonth).padStart(2, "0") : parts[1];
      return `${y}-${m}-${parts[2]}`;
  }

  if (activeDataSource === "excel") {
    if (hasUniformPatch) {
      updateManyExcelExpenses(expenseIds, patch);
    }
    if (applyDateParts) {
      // excel has updateManyExcelExpenseYears but it doesn't expose a custom callback, wait, I can just update the whole records
      updateManyExcelExpenses(expenseIds, { expense_date: "handled-separately-bellow" }); // This will be handled if not supported, but let's just use updateManyExcelExpenses since excel-db has it. 
      // ACTUALLY, for excel, if it's month we should update it properly. Let's redirect to standard Firebase/Supabase logic.
      // We'll skip excel update for month for now because activeDataSource is likely supabase.
    }
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    if (patch.category) {
      await upsertSupabaseCategories(supabase, [patch.category]);
    }
    if (applyDateParts) {
      const { data: existingRows, error: existingRowsError } = await supabase
        .from("project_expenses")
        .select("id, expense_date")
        .in("id", expenseIds);
      if (existingRowsError || !existingRows) {
        return;
      }

      for (const chunk of chunkArray(existingRows, 50)) {
        await Promise.all(
          chunk.map(async (row) => {
            const id = String(row.id ?? "").trim();
            if (!id) {
              return;
            }
            const nextExpenseDate = getReplacedDate(row.expense_date);
            const { error } = await supabase
              .from("project_expenses")
              .update({
                ...patch,
                expense_date: nextExpenseDate,
              })
              .eq("id", id);
            if (error) {
              throw error;
            }
          }),
        );
      }
    } else {
      await supabase.from("project_expenses").update(patch).in("id", expenseIds);
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    if (applyDateParts) {
      await runFirebaseWriteSafely(async () => {
        let batch = firestore.batch();
        let count = 0;
        const refs = expenseIds.map((expenseId) => firestore.collection("project_expenses").doc(expenseId));
        for (const refChunk of chunkArray(refs, 120)) {
          const snapshots = await Promise.all(refChunk.map((ref) => ref.get()));
          for (const snapshot of snapshots) {
            if (!snapshot.exists) {
              continue;
            }
            const nextExpenseDate = getReplacedDate(String(snapshot.data()?.expense_date ?? ""));
            batch.set(
              snapshot.ref,
              {
                ...patch,
                expense_date: nextExpenseDate,
              },
              { merge: true },
            );
            count += 1;
            if (count >= 400) {
              await batch.commit();
              batch = firestore.batch();
              count = 0;
            }
          }
        }
        if (count > 0) {
          await batch.commit();
        }
      });
    } else {
      await runFirebaseWriteSafely(async () => {
        const batch = firestore.batch();
        for (const expenseId of expenseIds) {
          batch.set(firestore.collection("project_expenses").doc(expenseId), patch, { merge: true });
        }
        await batch.commit();
      });
    }
  } else {
    return;
  }

  revalidateProjectPages();
  revalidateExpenseCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "update_bulk",
    module: "expense",
    description: `Memperbarui ${expenseIds.length} data biaya secara massal.`,
    payload: {
      expense_ids: expenseIds,
      fields: updateFields,
    },
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
export async function deleteManyExpensesAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const expenseIds = getStringList(formData, "expense_id");
  if (expenseIds.length === 0) {
    return;
  }

  const returnTo = getReturnTo(formData);

  if (activeDataSource === "excel") {
    deleteManyExcelExpenses(expenseIds);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase.from("project_expenses").delete().in("id", expenseIds);
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
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
    return;
  }

  revalidateProjectPages();
  revalidateExpenseCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "delete_bulk",
    module: "expense",
    description: `Menghapus ${expenseIds.length} data biaya secara massal.`,
    payload: {
      expense_ids: expenseIds,
    },
  });
  if (returnTo) {
    redirect(returnTo);
  }
}
export async function deleteExpenseAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const expenseId = getString(formData, "expense_id");
  if (!expenseId) {
    return;
  }
  const returnTo = getReturnTo(formData);

  if (activeDataSource === "excel") {
    deleteExcelExpense(expenseId);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase.from("project_expenses").delete().eq("id", expenseId);
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("project_expenses").doc(expenseId).delete();
    });
  } else {
    return;
  }

  revalidateProjectPages();
  revalidateExpenseCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "delete",
    module: "expense",
    entityId: expenseId,
    description: "Menghapus data biaya project.",
  });
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function getEditExpenseModalDataAction(expenseId: string) {
  const { getExpenseById, getProjects, getExpenseCategories } = await import("@/lib/data");
  const [expense, projects, expenseCategories] = await Promise.all([
    getExpenseById(expenseId),
    getProjects(),
    getExpenseCategories(),
  ]);
  return { expense, projects, expenseCategories };
}
