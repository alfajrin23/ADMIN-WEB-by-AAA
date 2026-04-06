"use server";

import { createHash, randomUUID } from "node:crypto";
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

function getStringValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((item) => (typeof item === "string" ? item.trim() : ""));
}

function getNumberValues(formData: FormData, key: string) {
  return getStringValues(formData, key).map((rawValue) => {
    const normalized = rawValue.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function getPositiveInteger(formData: FormData, key: string, fallback = 1) {
  const parsed = Math.floor(getNumber(formData, key));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseYearInput(value: string) {
  if (!/^\d{4}$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 9999) {
    return null;
  }
  return parsed;
}

function replaceDateYearKeepingMonthDay(value: string, year: number) {
  const dateOnly = value.trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) {
    return `${year}-01-01`;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return `${year}-01-01`;
  }
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.max(1, Math.min(day, maxDay));
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function getReturnTo(formData: FormData, key = "return_to") {
  const value = getString(formData, key);
  return value.startsWith("/") ? value : null;
}

function withReturnMessage(returnTo: string, key: string, message: string) {
  const [rawPath, rawQuery = ""] = returnTo.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set(key, message);
  const query = params.toString();
  return query ? `${rawPath}?${query}` : rawPath;
}

function withReturnParams(
  returnTo: string,
  mutator: (params: URLSearchParams) => void,
) {
  const url = new URL(returnTo, "http://localhost");
  const params = new URLSearchParams(url.search);
  mutator(params);
  const query = params.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function isChecked(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "1" || value === "on" || value === "true";
}

function revalidateProjectPages() {
  revalidatePath("/");
  revalidatePath("/projects");
}

function revalidateProjectCache() {
  revalidateTag(CACHE_TAGS.projects, "max");
}

function revalidateExpenseCache() {
  revalidateTag(CACHE_TAGS.expenses, "max");
  revalidateTag(CACHE_TAGS.expenseCategories, "max");
}

function revalidateAttendanceCache() {
  revalidateTag(CACHE_TAGS.attendance, "max");
  revalidateTag(CACHE_TAGS.payrollResets, "max");
}

async function requireEditorActionUser() {
  const user = await requireAuthUser();
  if (!canManageProjects(user)) {
    redirect("/");
  }
  return user;
}

async function requireAttendanceActionUser() {
  const user = await requireAuthUser();
  if (!canManageAttendance(user)) {
    redirect("/");
  }
  return user;
}

async function requireImportActionUser() {
  const user = await requireAuthUser();
  if (!canImportData(user)) {
    redirect("/");
  }
  return user;
}

async function requireLogsActionUser() {
  const user = await requireAuthUser();
  if (!canManageModule(user, "logs")) {
    redirect("/");
  }
  return user;
}

function createTimestamp() {
  return new Date().toISOString();
}

function createDeterministicUuid(seed: string) {
  const hash = createHash("sha256").update(seed).digest("hex");
  const version = `5${hash.slice(13, 16)}`;
  const variant = `${(8 + (parseInt(hash.slice(16, 17), 16) % 4)).toString(16)}${hash.slice(17, 20)}`;
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${version}-${variant}-${hash.slice(20, 32)}`;
}

async function ensureSupabaseAttendanceDraftProjectId(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
) {
  const existing = await supabase
    .from("projects")
    .select("id")
    .eq("code", ATTENDANCE_DRAFT_PROJECT_CODE)
    .maybeSingle();
  if (existing.error) {
    return null;
  }
  if (existing.data?.id) {
    return String(existing.data.id);
  }

  const created = await supabase
    .from("projects")
    .insert({
      name: ATTENDANCE_DRAFT_PROJECT_NAME,
      code: ATTENDANCE_DRAFT_PROJECT_CODE,
      client_name: "SYSTEM",
      start_date: getCurrentJakartaDate(),
      status: "aktif",
    })
    .select("id")
    .single();
  if (created.error || !created.data?.id) {
    return null;
  }
  return String(created.data.id);
}

function resolveDraftAttendanceNotes(input: {
  currentNotes: string | null;
  specialistTeamName: string | null;
  source: "manual-input" | "excel-import";
  sourceWorkbook?: string | null;
}) {
  if (input.currentNotes && !isAttendanceDraftNote(input.currentNotes)) {
    return input.currentNotes;
  }

  return buildAttendanceDraftNote({
    isDraft: true,
    source: input.source,
    originSpecialistGroup: input.specialistTeamName,
    specialistTeamName: input.specialistTeamName,
    importedAt: new Date().toISOString(),
    sourceWorkbook: input.sourceWorkbook ?? null,
  });
}

function resolveFinalAttendanceNotes(
  value: string | null | undefined,
  specialistTeamName: string | null,
) {
  if (specialistTeamName) {
    return buildAttendanceDraftNote({
      isDraft: false,
      specialistTeamName,
      importedAt: new Date().toISOString(),
    });
  }

  if (!value || isAttendanceDraftNote(value)) {
    return null;
  }
  return value;
}

function parseAttendanceStatusValue(value: string): AttendanceStatus {
  return ATTENDANCE_STATUSES.some((item) => item.value === value)
    ? (value as AttendanceStatus)
    : "hadir";
}

function parseWorkerTeamValue(value: string): WorkerTeam {
  return WORKER_TEAMS.some((item) => item.value === value) ? (value as WorkerTeam) : "tukang";
}

function normalizeAttendanceIdentityText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function createAttendanceMutationId(input: {
  projectId: string;
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  attendanceDate: string;
}) {
  return createDeterministicUuid(
    [
      "attendance",
      input.projectId.trim(),
      input.attendanceDate.trim(),
      normalizeAttendanceIdentityText(input.workerName),
      input.teamType,
      normalizeAttendanceIdentityText(input.specialistTeamName),
    ].join("|"),
  );
}

function createPayrollResetMutationId(input: {
  projectId: string;
  workerName: string | null;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  paidUntilDate: string;
}) {
  return createDeterministicUuid(
    [
      "payroll-reset",
      input.projectId.trim(),
      input.paidUntilDate.trim(),
      input.teamType,
      normalizeAttendanceIdentityText(input.workerName),
      normalizeAttendanceIdentityText(input.specialistTeamName),
    ].join("|"),
  );
}

function resolveAutoOvertimeWage(dailyWage: number) {
  if (!Number.isFinite(dailyWage) || dailyWage <= 0) {
    return 0;
  }
  return Math.max(dailyWage / 8, 0);
}

type AttendanceDuplicateCheckInput = {
  id?: string;
  projectId: string;
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  attendanceDate: string;
};

type AttendanceDuplicateCheckRow = {
  id: string;
  projectId: string;
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  attendanceDate: string;
};

function hasSameAttendanceIdentity(
  row: AttendanceDuplicateCheckRow,
  input: AttendanceDuplicateCheckInput,
) {
  return (
    row.projectId === input.projectId &&
    row.attendanceDate === input.attendanceDate &&
    row.teamType === input.teamType &&
    normalizeAttendanceIdentityText(row.workerName) ===
      normalizeAttendanceIdentityText(input.workerName) &&
    normalizeAttendanceIdentityText(row.specialistTeamName) ===
      normalizeAttendanceIdentityText(input.specialistTeamName)
  );
}

async function findDuplicateAttendanceRecord(
  inputs: AttendanceDuplicateCheckInput[],
): Promise<AttendanceDuplicateCheckRow | null> {
  if (inputs.length === 0) {
    return null;
  }

  if (activeDataSource === "excel") {
    const rows = readExcelDatabase().attendance_records.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      workerName: row.worker_name,
      teamType: row.team_type,
      specialistTeamName: row.specialist_team_name,
      attendanceDate: row.attendance_date,
    }));

    for (const input of inputs) {
      const found = rows.find((row) => row.id !== input.id && hasSameAttendanceIdentity(row, input));
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return null;
    }

    const pairKeys = Array.from(
      new Set(inputs.map((item) => `${item.projectId}|${item.attendanceDate}`)),
    );

    const rows = (
      await Promise.all(
        pairKeys.map(async (pairKey) => {
          const [projectId, attendanceDate] = pairKey.split("|");
          const result = await withSupabaseSpecialistTeamNameFallback<Record<string, unknown>[]>(
            ({ omitSpecialistTeamName }) => {
              const query = supabase
                .from("attendance_records")
                .select(
                  getSupabaseAttendanceSelect({
                    identityOnly: true,
                    omitSpecialistTeamName,
                  }),
                )
                .eq("attendance_date", attendanceDate);

              return projectId ? query.eq("project_id", projectId) : query;
            },
          );

          if (result.error || !Array.isArray(result.data)) {
            return [];
          }

          return result.data
            .filter((row) => !isAttendanceWorkerPresetNote(typeof row.notes === "string" ? row.notes : null))
            .map((row) => {
              const draftNote =
                typeof row.notes === "string" ? parseAttendanceDraftNote(row.notes) : null;
              return {
                id: String(row.id ?? ""),
                projectId: draftNote?.isDraft ? "" : String(row.project_id ?? ""),
                workerName: String(row.worker_name ?? ""),
                teamType: parseWorkerTeamValue(String(row.team_type ?? "")),
                specialistTeamName:
                  !result.omitSpecialistTeamName && typeof row.specialist_team_name === "string"
                    ? row.specialist_team_name
                    : draftNote?.specialistTeamName ?? draftNote?.originSpecialistGroup ?? null,
                attendanceDate: String(row.attendance_date ?? ""),
              };
            });
        }),
      )
    ).flat();

    for (const input of inputs) {
      const found = rows.find((row) => row.id !== input.id && hasSameAttendanceIdentity(row, input));
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return null;
    }

    const pairKeys = Array.from(
      new Set(inputs.map((item) => `${item.projectId}|${item.attendanceDate}`)),
    );
    const rows = (
      await Promise.all(
        pairKeys.map(async (pairKey) => {
          const [projectId, attendanceDate] = pairKey.split("|");
          const snapshot = await firestore
            .collection("attendance_records")
            .where("project_id", "==", projectId)
            .where("attendance_date", "==", attendanceDate)
            .get();

          return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: String(data.id ?? doc.id),
              projectId: String(data.project_id ?? ""),
              workerName: String(data.worker_name ?? ""),
              teamType: parseWorkerTeamValue(String(data.team_type ?? "")),
              specialistTeamName:
                typeof data.specialist_team_name === "string" ? data.specialist_team_name : null,
              attendanceDate: String(data.attendance_date ?? ""),
            };
          });
        }),
      )
    ).flat();

    for (const input of inputs) {
      const found = rows.find((row) => row.id !== input.id && hasSameAttendanceIdentity(row, input));
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function getExpenseSubmissionToken(formData: FormData) {
  return getString(formData, "expense_submission_token") || randomUUID();
}

function createExpenseMutationId(input: {
  mode: "standard" | "hok_kmp_cianjur";
  submissionToken: string;
  projectId: string;
}) {
  return createDeterministicUuid(
    ["expense", input.mode, input.submissionToken.trim(), input.projectId.trim()].join("|"),
  );
}

function shouldSyncExpenseCategory(formData: FormData) {
  const customCategory = toCategorySlug(getString(formData, "category_custom"));
  return Boolean(customCategory && !isHiddenCostCategory(customCategory));
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

function parsePositiveAmount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.abs(value) : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const normalizedDigits = value.replace(/[^\d]/g, "");
  if (!normalizedDigits) {
    return 0;
  }

  const parsed = Number(normalizedDigits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function createHokExpenseEntries(
  actor: Awaited<ReturnType<typeof requireEditorActionUser>>,
  formData: FormData,
  successReturnTo: string | null,
  errorReturnTo: string | null,
) {
  const rawRows = getString(formData, "hok_rows_json");
  let parsedRows: unknown;
  try {
    parsedRows = rawRows ? JSON.parse(rawRows) : [];
  } catch {
    if (errorReturnTo) {
      redirect(withReturnMessage(errorReturnTo, "error", "Data project HOK tidak valid."));
    }
    return;
  }

  if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
    if (errorReturnTo) {
      redirect(withReturnMessage(errorReturnTo, "error", "Pilih minimal satu project HOK."));
    }
    return;
  }

  const rows = parsedRows
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const projectId =
        typeof (item as { projectId?: unknown }).projectId === "string"
          ? (item as { projectId: string }).projectId.trim()
          : "";
      const projectName =
        typeof (item as { projectName?: unknown }).projectName === "string"
          ? (item as { projectName: string }).projectName.trim()
          : "";
      const requesterName =
        typeof (item as { requesterName?: unknown }).requesterName === "string"
          ? (item as { requesterName: string }).requesterName.trim()
          : "";
      const amount = parsePositiveAmount((item as { amount?: unknown }).amount);
      if (!projectId || !projectName || !requesterName || amount <= 0) {
        return null;
      }

      return {
        projectId,
        projectName,
        requesterName,
        amount,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (rows.length === 0) {
    if (errorReturnTo) {
      redirect(
        withReturnMessage(
          errorReturnTo,
          "error",
          "Nominal HOK wajib diisi untuk setiap project yang dipilih.",
        ),
      );
    }
    return;
  }

  const expenseDate = getString(formData, "expense_date") || new Date().toISOString().slice(0, 10);
  const basePayload = {
    category: "upah_kasbon_tukang",
    specialist_type: null,
    description: "HOK",
    recipient_name: null,
    quantity: 1,
    unit_label: null,
    usage_info: null,
    unit_price: 0,
    expense_date: expenseDate,
  };
  const submissionToken = getExpenseSubmissionToken(formData);

  if (activeDataSource === "excel") {
    for (const row of rows) {
      insertExcelExpense({
        ...basePayload,
        project_id: row.projectId,
        requester_name: row.requesterName,
        amount: row.amount,
      });
    }
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    const { error } = await supabase.from("project_expenses").upsert(
      rows.map((row) => ({
        id: createExpenseMutationId({
          mode: "hok_kmp_cianjur",
          submissionToken,
          projectId: row.projectId,
        }),
        project_id: row.projectId,
        category: basePayload.category,
        specialist_type: basePayload.specialist_type,
        requester_name: row.requesterName,
        description: basePayload.description,
        recipient_name: basePayload.recipient_name,
        quantity: basePayload.quantity,
        unit_label: basePayload.unit_label,
        usage_info: basePayload.usage_info,
        unit_price: basePayload.unit_price,
        amount: row.amount,
        expense_date: basePayload.expense_date,
      })),
      {
        onConflict: "id",
      },
    );
    if (error) {
      if (errorReturnTo) {
        redirect(withReturnMessage(errorReturnTo, "error", "Gagal menyimpan data HOK. Silakan coba lagi."));
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
      for (const row of rows) {
        const id = createExpenseMutationId({
          mode: "hok_kmp_cianjur",
          submissionToken,
          projectId: row.projectId,
        });
        batch.set(firestore.collection("project_expenses").doc(id), {
          id,
          ...basePayload,
          project_id: row.projectId,
          requester_name: row.requesterName,
          amount: row.amount,
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
    description: `Menambah data HOK KMP Cianjur ke ${rows.length} project.`,
    payload: {
      expense_mode: "hok_kmp_cianjur",
      project_ids: rows.map((row) => row.projectId),
      project_names: rows.map((row) => row.projectName),
      requester_names: rows.map((row) => row.requesterName),
      description: basePayload.description,
      category: basePayload.category,
      expense_date: basePayload.expense_date,
      total_amount: rows.reduce((sum, row) => sum + row.amount, 0),
    },
  });
  if (successReturnTo) {
    redirect(
      withReturnMessage(
        successReturnTo,
        "success",
        `HOK berhasil disimpan ke ${rows.length} project.`,
      ),
    );
  }
}

export async function createExpenseAction(formData: FormData) {
  const actor = await requireEditorActionUser();
  const successReturnTo = getReturnTo(formData);
  const errorReturnTo = getReturnTo(formData, "error_return_to") ?? successReturnTo;
  if (getString(formData, "expense_input_mode") === "hok_kmp_cianjur") {
    await createHokExpenseEntries(actor, formData, successReturnTo, errorReturnTo);
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
  const applyRequesterName = isChecked(formData, "apply_requester_name");
  const applyDescription = isChecked(formData, "apply_description");
  const applyUsageInfo = isChecked(formData, "apply_usage_info");
  const applyRecipientName = isChecked(formData, "apply_recipient_name");
  const expenseYear = applyExpenseYear ? parseYearInput(getString(formData, "expense_year")) : null;
  if (applyExpenseYear && expenseYear === null) {
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
  if (applyExpenseDate && !applyExpenseYear) {
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
  const hasUniformPatch = Object.keys(patch).length > 0;
  const updateFields = [
    ...Object.keys(patch),
    ...(applyExpenseYearOnly ? ["expense_year"] : []),
  ];
  if (updateFields.length === 0) {
    return;
  }

  if (activeDataSource === "excel") {
    if (hasUniformPatch) {
      updateManyExcelExpenses(expenseIds, patch);
    }
    if (applyExpenseYearOnly) {
      updateManyExcelExpenseYears(expenseIds, expenseYear);
    }
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    if (patch.category) {
      await upsertSupabaseCategories(supabase, [patch.category]);
    }
    if (applyExpenseYearOnly) {
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
            const nextExpenseDate = replaceDateYearKeepingMonthDay(
              String(row.expense_date ?? ""),
              expenseYear,
            );
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
    if (applyExpenseYearOnly) {
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
            const nextExpenseDate = replaceDateYearKeepingMonthDay(
              String(snapshot.data()?.expense_date ?? ""),
              expenseYear,
            );
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

type AttendanceRecapRowInput = {
  id: string;
  project_id: string;
  worker_name: string;
  team_type: WorkerTeam;
  specialist_team_name: string | null;
  status: AttendanceStatus;
  work_days: number;
  daily_wage: number;
  overtime_hours: number;
  overtime_wage: number;
  kasbon_amount: number;
  reimburse_type: ReimburseType | null;
  reimburse_amount: number;
  attendance_date: string;
  notes: string | null;
};

function resolveAttendanceExportRowId(input: {
  rawId: string;
  projectId: string;
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  attendanceDate: string;
}) {
  const rawId = input.rawId.trim();
  if (rawId.length > 0 && !rawId.startsWith("new:")) {
    return rawId;
  }

  return createDeterministicUuid(
    [
      "attendance-export-segment",
      rawId,
      input.projectId.trim(),
      normalizeAttendanceIdentityText(input.workerName),
      input.teamType,
      normalizeAttendanceIdentityText(input.specialistTeamName),
      input.attendanceDate.trim(),
    ].join("|"),
  );
}

function buildAttendanceRecapRowsFromFormData(formData: FormData): AttendanceRecapRowInput[] {
  const attendanceIds = getStringValues(formData, "attendance_id");
  const currentProjectIds = getStringValues(formData, "project_id_current");
  const workerNames = getStringValues(formData, "worker_name");
  const teamTypes = getStringValues(formData, "team_type");
  const currentSpecialistTeamNames = getStringValues(formData, "specialist_team_name_current");
  const statuses = getStringValues(formData, "status");
  const workDaysValues = getNumberValues(formData, "work_days");
  const dailyWages = getNumberValues(formData, "daily_wage");
  const overtimeHoursValues = getNumberValues(formData, "overtime_hours");
  const kasbonAmounts = getNumberValues(formData, "kasbon_amount");
  const reimburseTypes = getStringValues(formData, "attendance_reimburse_type");
  const reimburseAmounts = getNumberValues(formData, "attendance_reimburse_amount");
  const attendanceDates = getStringValues(formData, "attendance_date");
  const notes = getStringValues(formData, "notes");
  const globalProjectId = getString(formData, "project_id_global");

  return attendanceIds
    .map((attendanceId, index) => {
      const projectId = globalProjectId || currentProjectIds[index] || "";
      const workerName = workerNames[index] ?? "";
      const teamType = parseWorkerTeamValue(teamTypes[index] ?? "");
      const specialistTeamNameCurrent = currentSpecialistTeamNames[index] ?? "";
      const specialistTeamName =
        teamType === "spesialis"
          ? specialistTeamNameCurrent || null
          : null;
      const status = parseAttendanceStatusValue(statuses[index] ?? "hadir");
      const workDays = Math.min(Math.max(Math.floor(workDaysValues[index] ?? 1), 1), 31);
      const dailyWage = Math.max(dailyWages[index] ?? 0, 0);
      const overtimeHours =
        status === "hadir" ? Math.max(overtimeHoursValues[index] ?? 0, 0) : 0;
      const overtimeWage = status === "hadir" ? resolveAutoOvertimeWage(dailyWage) : 0;
      const kasbonAmount = Math.max(kasbonAmounts[index] ?? 0, 0);
      const reimburseTypeRaw = reimburseTypes[index] ?? "";
      const reimburseType =
        reimburseTypeRaw === "material" || reimburseTypeRaw === "kekurangan_dana"
          ? (reimburseTypeRaw as ReimburseType)
          : null;
      const reimburseAmount =
        reimburseType && Number.isFinite(reimburseAmounts[index]) && reimburseAmounts[index] > 0
          ? reimburseAmounts[index]
          : 0;
      const attendanceDate = attendanceDates[index] ?? getCurrentJakartaDate();
      const note = notes[index] ?? "";

      if (!attendanceId || !workerName) {
        return null;
      }

      return {
        id: resolveAttendanceExportRowId({
          rawId: attendanceId,
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
        status,
        work_days: workDays,
        daily_wage: dailyWage,
        overtime_hours: overtimeHours,
        overtime_wage: overtimeWage,
        kasbon_amount: kasbonAmount,
        reimburse_type: reimburseType,
        reimburse_amount: reimburseAmount,
        attendance_date: attendanceDate,
        notes: resolveFinalAttendanceNotes(note || null, specialistTeamName),
      };
    })
    .filter((row): row is AttendanceRecapRowInput => Boolean(row));
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
