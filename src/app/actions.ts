"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createActivityLog } from "@/lib/activity-logs";
import { canImportData, canManageData, requireAuthUser } from "@/lib/auth";
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
  deleteManyExcelProjects,
  deleteExcelProject,
  importTemplateExcelDatabase,
  importTemplateExcelDatabaseFromBuffer,
  parseTemplateExcelData,
  parseTemplateExcelDataFromBuffer,
  insertExcelAttendance,
  insertExcelExpense,
  insertExcelPayrollReset,
  insertExcelProject,
  updateExcelAttendance,
  updateExcelExpense,
  updateManyExcelExpenses,
  updateExcelProject,
} from "@/lib/excel-db";
import { getFirestoreServerClient } from "@/lib/firebase";
import { activeDataSource } from "@/lib/storage";
import { getSupabaseServerClient } from "@/lib/supabase";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getStringList(formData: FormData, key: string) {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  );
}

function getNumber(formData: FormData, key: string) {
  const rawValue = getString(formData, key);
  const normalized = rawValue.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPositiveInteger(formData: FormData, key: string, fallback = 1) {
  const parsed = Math.floor(getNumber(formData, key));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function getReturnTo(formData: FormData) {
  const value = getString(formData, "return_to");
  return value.startsWith("/") ? value : null;
}

function withReturnMessage(returnTo: string, key: string, message: string) {
  const [rawPath, rawQuery = ""] = returnTo.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set(key, message);
  const query = params.toString();
  return query ? `${rawPath}?${query}` : rawPath;
}

function isChecked(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "1" || value === "on" || value === "true";
}

function revalidateProjectPages() {
  revalidatePath("/");
  revalidatePath("/projects");
}

async function requireEditorActionUser() {
  const user = await requireAuthUser();
  if (!canManageData(user.role)) {
    redirect("/");
  }
  return user;
}

async function requireDevActionUser() {
  const user = await requireAuthUser();
  if (!canImportData(user.role)) {
    redirect("/");
  }
  return user;
}

function createTimestamp() {
  return new Date().toISOString();
}

function parseProjectInitialCategories(formData: FormData) {
  const raw = getString(formData, "initial_categories");
  return parseCategoryListInput(raw);
}

function buildSupabaseCategoryRows(categories: string[]) {
  return categories.map((category) => ({
    slug: category,
    label: getCostCategoryLabel(category),
  }));
}

async function upsertSupabaseCategories(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>, categories: string[]) {
  const normalized = Array.from(new Set(categories.map((category) => toCategorySlug(category)).filter((category) => category.length > 0)));
  if (normalized.length === 0) {
    return;
  }

  const { error } = await supabase.from("expense_categories").upsert(buildSupabaseCategoryRows(normalized), {
    onConflict: "slug",
    ignoreDuplicates: false,
  });
  if (error) {
    console.warn("[supabase] gagal sinkron kategori biaya.", error.message);
  }
}

function isFirebaseNotFoundError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const withCode = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = withCode.code;
  const message = typeof withCode.message === "string" ? withCode.message.toUpperCase() : "";
  const details = typeof withCode.details === "string" ? withCode.details.toUpperCase() : "";

  return code === 5 || code === "5" || message.includes("NOT_FOUND") || details.includes("NOT_FOUND");
}

let hasWarnedFirebaseWriteDatabaseMissing = false;

async function runFirebaseWriteSafely(task: () => Promise<void>) {
  try {
    await task();
  } catch (error) {
    if (isFirebaseNotFoundError(error)) {
      if (!hasWarnedFirebaseWriteDatabaseMissing) {
        hasWarnedFirebaseWriteDatabaseMissing = true;
        console.warn(
          "[firebase] Tulis data gagal karena Firestore database belum ada. Buat Firestore database terlebih dahulu.",
        );
      }
      return;
    }
    throw error;
  }
}

async function deleteFirebaseDocsByField(
  collectionName: string,
  field: string,
  value: string,
) {
  const firestore = getFirestoreServerClient();
  if (!firestore) {
    return;
  }

  let snapshot;
  try {
    snapshot = await firestore.collection(collectionName).where(field, "==", value).get();
  } catch (error) {
    if (isFirebaseNotFoundError(error)) {
      return;
    }
    throw error;
  }
  if (snapshot.empty) {
    return;
  }

  let batch = firestore.batch();
  let count = 0;
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
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
}

type ParsedTemplateImportData = NonNullable<ReturnType<typeof parseTemplateExcelDataFromBuffer>>;

function normalizeImportText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeImportNumber(value: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildImportExpenseSignature(input: {
  projectId: string;
  category: string;
  requesterName: string | null;
  description: string | null;
  quantity: number;
  unitLabel: string | null;
  usageInfo: string | null;
  unitPrice: number;
  amount: number;
  expenseDate: string;
}) {
  return [
    input.projectId.trim(),
    toCategorySlug(input.category),
    input.expenseDate.slice(0, 10),
    normalizeImportText(input.requesterName),
    normalizeImportText(input.description),
    normalizeImportText(input.unitLabel),
    normalizeImportText(input.usageInfo),
    normalizeImportNumber(input.quantity).toFixed(2),
    normalizeImportNumber(input.unitPrice).toFixed(2),
    normalizeImportNumber(input.amount).toFixed(2),
  ].join("|");
}

function chunkArray<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

async function importTemplateDataToSupabase(parsed: ParsedTemplateImportData) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return;
  }

  const dedupedImportProjects = Array.from(
    new Map(
      parsed.projects
        .filter((project) => project.name.trim().length > 0)
        .map((project) => [normalizeImportText(project.name), project]),
    ).values(),
  );

  const { data: existingProjects } = await supabase.from("projects").select("id, name");
  const projectIdByName = new Map<string, string>();
  for (const row of existingProjects ?? []) {
    const projectName = typeof row.name === "string" ? row.name : "";
    const projectId = String(row.id ?? "");
    if (!projectName || !projectId) {
      continue;
    }
    projectIdByName.set(normalizeImportText(projectName), projectId);
  }

  const projectRowsToInsert = dedupedImportProjects
    .filter((project) => !projectIdByName.has(normalizeImportText(project.name)))
    .map((project) => ({
      name: project.name,
      code: project.code,
      client_name: project.client_name,
      start_date: project.start_date,
      status: project.status,
    }));

  if (projectRowsToInsert.length > 0) {
    const { data: insertedProjects } = await supabase
      .from("projects")
      .insert(projectRowsToInsert)
      .select("id, name");
    for (const row of insertedProjects ?? []) {
      const projectName = typeof row.name === "string" ? row.name : "";
      const projectId = String(row.id ?? "");
      if (!projectName || !projectId) {
        continue;
      }
      projectIdByName.set(normalizeImportText(projectName), projectId);
    }
  }

  const sourceProjectIdToTargetProjectId = new Map<string, string>();
  for (const project of parsed.projects) {
    const mapped = projectIdByName.get(normalizeImportText(project.name));
    if (mapped) {
      sourceProjectIdToTargetProjectId.set(project.id, mapped);
    }
  }

  const importedCategories = Array.from(
    new Set(
      parsed.project_expenses
        .map((expense) => toCategorySlug(expense.category))
        .filter((item) => item.length > 0),
    ),
  );
  await upsertSupabaseCategories(supabase, importedCategories);

  const targetProjectIds = Array.from(new Set(sourceProjectIdToTargetProjectId.values()));
  const existingExpenseSignatures = new Set<string>();
  if (targetProjectIds.length > 0) {
    const { data: existingExpenseRows } = await supabase
      .from("project_expenses")
      .select(
        "project_id, category, requester_name, description, quantity, unit_label, usage_info, unit_price, amount, expense_date",
      )
      .in("project_id", targetProjectIds);
    for (const row of existingExpenseRows ?? []) {
      existingExpenseSignatures.add(
        buildImportExpenseSignature({
          projectId: String(row.project_id ?? ""),
          category: String(row.category ?? ""),
          requesterName: typeof row.requester_name === "string" ? row.requester_name : null,
          description: typeof row.description === "string" ? row.description : null,
          quantity: Number(row.quantity ?? 0),
          unitLabel: typeof row.unit_label === "string" ? row.unit_label : null,
          usageInfo: typeof row.usage_info === "string" ? row.usage_info : null,
          unitPrice: Number(row.unit_price ?? 0),
          amount: Number(row.amount ?? 0),
          expenseDate: String(row.expense_date ?? ""),
        }),
      );
    }
  }

  const expenseRowsToInsert: Array<{
    project_id: string;
    category: string;
    specialist_type: string | null;
    requester_name: string | null;
    description: string | null;
    recipient_name: string | null;
    quantity: number;
    unit_label: string | null;
    usage_info: string | null;
    unit_price: number;
    amount: number;
    expense_date: string;
  }> = [];

  for (const expense of parsed.project_expenses) {
    const targetProjectId = sourceProjectIdToTargetProjectId.get(expense.project_id);
    if (!targetProjectId) {
      continue;
    }

    const signature = buildImportExpenseSignature({
      projectId: targetProjectId,
      category: expense.category,
      requesterName: expense.requester_name,
      description: expense.description,
      quantity: expense.quantity,
      unitLabel: expense.unit_label,
      usageInfo: expense.usage_info,
      unitPrice: expense.unit_price,
      amount: expense.amount,
      expenseDate: expense.expense_date,
    });
    if (existingExpenseSignatures.has(signature)) {
      continue;
    }
    existingExpenseSignatures.add(signature);

    expenseRowsToInsert.push({
      project_id: targetProjectId,
      category: expense.category,
      specialist_type: expense.specialist_type,
      requester_name: expense.requester_name,
      description: expense.description,
      recipient_name: expense.recipient_name,
      quantity: expense.quantity,
      unit_label: expense.unit_label,
      usage_info: expense.usage_info,
      unit_price: expense.unit_price,
      amount: expense.amount,
      expense_date: expense.expense_date,
    });
  }

  for (const chunk of chunkArray(expenseRowsToInsert, 300)) {
    await supabase.from("project_expenses").insert(chunk);
  }
}

async function importTemplateDataToFirebase(parsed: ParsedTemplateImportData) {
  const firestore = getFirestoreServerClient();
  if (!firestore) {
    return;
  }

  await runFirebaseWriteSafely(async () => {
    const existingProjectsSnapshot = await firestore.collection("projects").get();
    const projectIdByName = new Map<string, string>();
    for (const doc of existingProjectsSnapshot.docs) {
      const payload = doc.data() as Record<string, unknown>;
      const name = typeof payload.name === "string" ? payload.name : "";
      if (!name) {
        continue;
      }
      projectIdByName.set(normalizeImportText(name), doc.id);
    }

    const sourceProjectIdToTargetProjectId = new Map<string, string>();
    let projectBatch = firestore.batch();
    let projectBatchCount = 0;
    for (const project of parsed.projects) {
      const normalizedName = normalizeImportText(project.name);
      if (!normalizedName) {
        continue;
      }

      let projectId = projectIdByName.get(normalizedName);
      if (!projectId) {
        projectId = randomUUID();
        projectIdByName.set(normalizedName, projectId);
        projectBatch.set(
          firestore.collection("projects").doc(projectId),
          {
            id: projectId,
            name: project.name,
            code: project.code,
            client_name: project.client_name,
            start_date: project.start_date,
            status: project.status,
            created_at: createTimestamp(),
          },
          { merge: true },
        );
        projectBatchCount += 1;
        if (projectBatchCount >= 400) {
          await projectBatch.commit();
          projectBatch = firestore.batch();
          projectBatchCount = 0;
        }
      }

      sourceProjectIdToTargetProjectId.set(project.id, projectId);
    }
    if (projectBatchCount > 0) {
      await projectBatch.commit();
    }

    const targetProjectIds = new Set(sourceProjectIdToTargetProjectId.values());
    const existingExpensesSnapshot = await firestore.collection("project_expenses").get();
    const existingExpenseSignatures = new Set<string>();
    for (const doc of existingExpensesSnapshot.docs) {
      const payload = doc.data() as Record<string, unknown>;
      const projectId = String(payload.project_id ?? "");
      if (!targetProjectIds.has(projectId)) {
        continue;
      }
      existingExpenseSignatures.add(
        buildImportExpenseSignature({
          projectId,
          category: String(payload.category ?? ""),
          requesterName:
            typeof payload.requester_name === "string" ? payload.requester_name : null,
          description: typeof payload.description === "string" ? payload.description : null,
          quantity: Number(payload.quantity ?? 0),
          unitLabel: typeof payload.unit_label === "string" ? payload.unit_label : null,
          usageInfo: typeof payload.usage_info === "string" ? payload.usage_info : null,
          unitPrice: Number(payload.unit_price ?? 0),
          amount: Number(payload.amount ?? 0),
          expenseDate: String(payload.expense_date ?? ""),
        }),
      );
    }

    let expenseBatch = firestore.batch();
    let expenseBatchCount = 0;
    for (const expense of parsed.project_expenses) {
      const targetProjectId = sourceProjectIdToTargetProjectId.get(expense.project_id);
      if (!targetProjectId) {
        continue;
      }

      const signature = buildImportExpenseSignature({
        projectId: targetProjectId,
        category: expense.category,
        requesterName: expense.requester_name,
        description: expense.description,
        quantity: expense.quantity,
        unitLabel: expense.unit_label,
        usageInfo: expense.usage_info,
        unitPrice: expense.unit_price,
        amount: expense.amount,
        expenseDate: expense.expense_date,
      });
      if (existingExpenseSignatures.has(signature)) {
        continue;
      }
      existingExpenseSignatures.add(signature);

      const id = randomUUID();
      expenseBatch.set(firestore.collection("project_expenses").doc(id), {
        id,
        project_id: targetProjectId,
        category: expense.category,
        specialist_type: expense.specialist_type,
        requester_name: expense.requester_name,
        description: expense.description,
        recipient_name: expense.recipient_name,
        quantity: expense.quantity,
        unit_label: expense.unit_label,
        usage_info: expense.usage_info,
        unit_price: expense.unit_price,
        amount: expense.amount,
        expense_date: expense.expense_date,
        created_at: createTimestamp(),
      });
      expenseBatchCount += 1;
      if (expenseBatchCount >= 400) {
        await expenseBatch.commit();
        expenseBatch = firestore.batch();
        expenseBatchCount = 0;
      }
    }
    if (expenseBatchCount > 0) {
      await expenseBatch.commit();
    }
  });
}

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
    await upsertSupabaseCategories(supabase, initialCategories);
    await supabase.from("projects").insert(payload);
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
  revalidatePath("/attendance");
  revalidatePath("/logs");
  await createActivityLog({
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
  revalidatePath("/attendance");
  revalidatePath("/logs");
  await createActivityLog({
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
    await supabase.from("project_expenses").delete().eq("project_id", projectId);
    await supabase.from("attendance_records").delete().eq("project_id", projectId);
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
  revalidatePath("/attendance");
  revalidatePath("/logs");
  await createActivityLog({
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

    await Promise.all([
      supabase.from("project_expenses").delete().in("project_id", projectIds),
      supabase.from("attendance_records").delete().in("project_id", projectIds),
      supabase.from("payroll_resets").delete().in("project_id", projectIds),
    ]);
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
  revalidatePath("/attendance");
  revalidatePath("/logs");
  await createActivityLog({
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

function getParsedCategory(formData: FormData) {
  const customCategory = toCategorySlug(getString(formData, "category_custom"));
  if (customCategory && !isHiddenCostCategory(customCategory)) {
    return customCategory;
  }

  const selectedCategory = toCategorySlug(getString(formData, "category"));
  if (selectedCategory && !isHiddenCostCategory(selectedCategory)) {
    return selectedCategory;
  }

  return COST_CATEGORIES[0]?.value ?? null;
}

function getSpecialistType(formData: FormData, category: string | null) {
  if (category !== "upah_tim_spesialis") {
    return null;
  }

  const custom = getString(formData, "specialist_type_custom");
  if (custom) {
    return custom;
  }

  return getString(formData, "specialist_type") || null;
}

function getParsedWorkerTeam(formData: FormData): WorkerTeam {
  const team = getString(formData, "team_type");
  return WORKER_TEAMS.some((item) => item.value === team) ? (team as WorkerTeam) : "tukang";
}

function getParsedReimburseType(formData: FormData): ReimburseType | null {
  const reimburseType = getString(formData, "reimburse_type");
  return REIMBURSE_TYPES.some((item) => item.value === reimburseType)
    ? (reimburseType as ReimburseType)
    : null;
}

function resolveAmountByMode(formData: FormData, baseAmount: number) {
  const mode = getString(formData, "amount_mode");
  if (mode === "kurangi") {
    return -Math.abs(baseAmount);
  }
  return Math.abs(baseAmount);
}

function getExpenseTargetProjectIds(formData: FormData) {
  const selectedIds = getStringList(formData, "project_ids");
  const primaryProjectId = getString(formData, "project_id");
  if (primaryProjectId) {
    selectedIds.unshift(primaryProjectId);
  }
  return Array.from(new Set(selectedIds));
}

export async function createExpenseAction(formData: FormData) {
  const actor = await requireEditorActionUser();
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
    return;
  }
  const returnTo = getReturnTo(formData);
  const specialistType = getSpecialistType(formData, parsedCategory);

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
    await upsertSupabaseCategories(supabase, [basePayload.category]);
    await supabase.from("project_expenses").insert(
      projectIds.map((projectId) => ({
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
    );
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      const batch = firestore.batch();
      for (const projectId of projectIds) {
        const id = randomUUID();
        batch.set(firestore.collection("project_expenses").doc(id), {
          id,
          ...basePayload,
          project_id: projectId,
          created_at: createTimestamp(),
        });
      }
      await batch.commit();
    });
  } else {
    return;
  }

  revalidateProjectPages();
  revalidatePath("/logs");
  await createActivityLog({
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
  if (returnTo) {
    const successMessage =
      projectIds.length > 1
        ? `Biaya berhasil disimpan ke ${projectIds.length} project.`
        : "Biaya berhasil disimpan.";
    redirect(withReturnMessage(returnTo, "success", successMessage));
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
  revalidatePath("/logs");
  await createActivityLog({
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
  const applyRequesterName = isChecked(formData, "apply_requester_name");
  const applyDescription = isChecked(formData, "apply_description");
  const applyUsageInfo = isChecked(formData, "apply_usage_info");
  const applyRecipientName = isChecked(formData, "apply_recipient_name");

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
  if (applyExpenseDate) {
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

  const updateFields = Object.keys(patch);
  if (updateFields.length === 0) {
    return;
  }

  if (activeDataSource === "excel") {
    updateManyExcelExpenses(expenseIds, patch);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    if (patch.category) {
      await upsertSupabaseCategories(supabase, [patch.category]);
    }
    await supabase.from("project_expenses").update(patch).in("id", expenseIds);
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      const batch = firestore.batch();
      for (const expenseId of expenseIds) {
        batch.set(firestore.collection("project_expenses").doc(expenseId), patch, { merge: true });
      }
      await batch.commit();
    });
  } else {
    return;
  }

  revalidateProjectPages();
  revalidatePath("/logs");
  await createActivityLog({
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
  revalidatePath("/logs");
  await createActivityLog({
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

export async function importExcelTemplateAction(formData: FormData) {
  const actor = await requireDevActionUser();
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
  revalidatePath("/attendance");
  revalidatePath("/logs");
  await createActivityLog({
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

export async function createAttendanceAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const projectId = getString(formData, "project_id");
  const workerName = getString(formData, "worker_name");
  if (!projectId || !workerName) {
    return;
  }
  const returnTo = getReturnTo(formData);

  const status = getString(formData, "status");
  const parsedStatus: AttendanceStatus = ATTENDANCE_STATUSES.some((item) => item.value === status)
    ? (status as AttendanceStatus)
    : "hadir";

  const teamType = getParsedWorkerTeam(formData);
  const specialistTeamNameRaw = getString(formData, "specialist_team_name");
  const specialistTeamName = teamType === "spesialis" ? specialistTeamNameRaw || null : null;
  const dailyWage = getNumber(formData, "daily_wage");
  const overtimeHours = Math.max(getNumber(formData, "overtime_hours"), 0);
  const overtimeWage = Math.max(getNumber(formData, "overtime_wage"), 0);
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
    parsedStatus === "hadir" && Number.isFinite(overtimeWage) ? overtimeWage : 0;
  const workDays = Math.min(getPositiveInteger(formData, "work_days", 1), 31);
  const attendanceDate =
    getString(formData, "attendance_date") || new Date().toISOString().slice(0, 10);

  const payload = {
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
    notes: getString(formData, "notes") || null,
  };

  if (activeDataSource === "excel") {
    insertExcelAttendance(payload);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase.from("attendance_records").insert({
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
    });
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    const id = randomUUID();
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("attendance_records").doc(id).set({
        id,
        ...payload,
        created_at: createTimestamp(),
      });
    });
  } else {
    return;
  }

  revalidatePath("/");
  revalidatePath("/attendance");
  revalidatePath("/logs");
  await createActivityLog({
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
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function updateAttendanceAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const attendanceId = getString(formData, "attendance_id");
  const projectId = getString(formData, "project_id");
  const workerName = getString(formData, "worker_name");
  if (!attendanceId || !projectId || !workerName) {
    return;
  }

  const status = getString(formData, "status");
  const parsedStatus: AttendanceStatus = ATTENDANCE_STATUSES.some((item) => item.value === status)
    ? (status as AttendanceStatus)
    : "hadir";

  const teamType = getParsedWorkerTeam(formData);
  const specialistTeamNameRaw = getString(formData, "specialist_team_name");
  const specialistTeamName = teamType === "spesialis" ? specialistTeamNameRaw || null : null;
  const dailyWage = getNumber(formData, "daily_wage");
  const overtimeHours = Math.max(getNumber(formData, "overtime_hours"), 0);
  const overtimeWage = Math.max(getNumber(formData, "overtime_wage"), 0);
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
    parsedStatus === "hadir" && Number.isFinite(overtimeWage) ? overtimeWage : 0;

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
    attendance_date:
      getString(formData, "attendance_date") || new Date().toISOString().slice(0, 10),
    notes: getString(formData, "notes") || null,
  };
  const returnTo = getReturnTo(formData);

  if (activeDataSource === "excel") {
    updateExcelAttendance(payload);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase
      .from("attendance_records")
      .update({
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
      })
      .eq("id", payload.id);
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
  revalidatePath("/logs");
  await createActivityLog({
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
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function deleteAttendanceAction(formData: FormData) {
  const actor = await requireEditorActionUser();
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
  revalidatePath("/logs");
  await createActivityLog({
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

export async function confirmPayrollPaidAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const projectId = getString(formData, "project_id");
  const teamType = getParsedWorkerTeam(formData);
  if (!projectId) {
    return;
  }

  const paidUntilDate =
    getString(formData, "paid_until_date") || new Date().toISOString().slice(0, 10);
  const specialistTeamNameRaw = getString(formData, "specialist_team_name");
  const specialistTeamName = teamType === "spesialis" ? specialistTeamNameRaw || null : null;
  const workerName = getString(formData, "worker_name") || null;
  const payload = {
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
    const { error } = await supabase.from("payroll_resets").insert(payload);
    if (error) {
      // fallback when table is not available yet
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    const id = randomUUID();
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("payroll_resets").doc(id).set({
        id,
        ...payload,
        created_at: createTimestamp(),
      });
    });
  } else {
    return;
  }

  revalidatePath("/");
  revalidatePath("/attendance");
  revalidatePath("/logs");
  await createActivityLog({
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

export async function updateActivityLogAction(formData: FormData) {
  const actor = await requireDevActionUser();
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
  await createActivityLog({
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
