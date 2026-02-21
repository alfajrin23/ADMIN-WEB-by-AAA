"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  toCategorySlug,
  type WorkerTeam,
  WORKER_TEAMS,
} from "@/lib/constants";
import {
  deleteExcelAttendance,
  deleteExcelExpense,
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
  updateExcelProject,
} from "@/lib/excel-db";
import { getFirestoreServerClient } from "@/lib/firebase";
import { activeDataSource } from "@/lib/storage";
import { getSupabaseServerClient } from "@/lib/supabase";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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

function revalidateProjectPages() {
  revalidatePath("/");
  revalidatePath("/projects");
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
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function updateProjectAction(formData: FormData) {
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
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function deleteProjectAction(formData: FormData) {
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
  if (returnTo) {
    redirect(returnTo);
  }
}

function getParsedCategory(formData: FormData) {
  const customCategory = toCategorySlug(getString(formData, "category_custom"));
  if (customCategory) {
    return customCategory;
  }

  const selectedCategory = toCategorySlug(getString(formData, "category"));
  if (selectedCategory) {
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

export async function createExpenseAction(formData: FormData) {
  const projectId = getString(formData, "project_id");
  const requesterName = getString(formData, "requester_name");
  const description = getString(formData, "description");
  const amountInput = getNumber(formData, "amount");
  const amount = resolveAmountByMode(formData, amountInput);
  const parsedCategory = getParsedCategory(formData);
  if (
    !projectId ||
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

  const excelPayload = {
    project_id: projectId,
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
    insertExcelExpense(excelPayload);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await upsertSupabaseCategories(supabase, [excelPayload.category]);
    await supabase.from("project_expenses").insert({
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
    });
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    const id = randomUUID();
    await runFirebaseWriteSafely(async () => {
      await firestore.collection("project_expenses").doc(id).set({
        id,
        ...excelPayload,
        created_at: createTimestamp(),
      });
    });
  } else {
    return;
  }

  revalidateProjectPages();
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function updateExpenseAction(formData: FormData) {
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
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function deleteExpenseAction(formData: FormData) {
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
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function importExcelTemplateAction(formData: FormData) {
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
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function createAttendanceAction(formData: FormData) {
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
  const kasbonAmount = getNumber(formData, "kasbon_amount");
  const reimburseType = getParsedReimburseType(formData);
  const reimburseAmount = getNumber(formData, "reimburse_amount");
  const normalizedReimburseAmount =
    reimburseType && Number.isFinite(reimburseAmount) && reimburseAmount > 0 ? reimburseAmount : 0;
  const normalizedDailyWage =
    parsedStatus === "hadir" && Number.isFinite(dailyWage) ? dailyWage : 0;
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
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function updateAttendanceAction(formData: FormData) {
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
  const kasbonAmount = getNumber(formData, "kasbon_amount");
  const reimburseType = getParsedReimburseType(formData);
  const reimburseAmount = getNumber(formData, "reimburse_amount");
  const normalizedReimburseAmount =
    reimburseType && Number.isFinite(reimburseAmount) && reimburseAmount > 0 ? reimburseAmount : 0;
  const normalizedDailyWage =
    parsedStatus === "hadir" && Number.isFinite(dailyWage) ? dailyWage : 0;

  const payload = {
    id: attendanceId,
    project_id: projectId,
    worker_name: workerName,
    team_type: teamType,
    specialist_team_name: specialistTeamName,
    status: parsedStatus,
    work_days: Math.min(getPositiveInteger(formData, "work_days", 1), 31),
    daily_wage: normalizedDailyWage,
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
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function deleteAttendanceAction(formData: FormData) {
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
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function confirmPayrollPaidAction(formData: FormData) {
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
  if (returnTo) {
    redirect(returnTo);
  }
}
