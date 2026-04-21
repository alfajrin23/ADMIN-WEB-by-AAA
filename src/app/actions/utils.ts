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
export function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
export function getStringList(formData: FormData, key: string) {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  );
}
export function getNumber(formData: FormData, key: string) {
  const rawValue = getString(formData, key);
  const normalized = rawValue.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
export function getStringValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((item) => (typeof item === "string" ? item.trim() : ""));
}
export function getNumberValues(formData: FormData, key: string) {
  return getStringValues(formData, key).map((rawValue) => {
    const normalized = rawValue.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}
export function getPositiveInteger(formData: FormData, key: string, fallback = 1) {
  const parsed = Math.floor(getNumber(formData, key));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}
export function parseYearInput(value: string) {
  if (!/^\d{4}$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 9999) {
    return null;
  }
  return parsed;
}
export function replaceDateYearKeepingMonthDay(value: string, year: number) {
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
export function getReturnTo(formData: FormData, key = "return_to") {
  const value = getString(formData, key);
  return value.startsWith("/") ? value : null;
}
export function withReturnMessage(returnTo: string, key: string, message: string) {
  const [rawPath, rawQuery = ""] = returnTo.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set(key, message);
  const query = params.toString();
  return query ? `${rawPath}?${query}` : rawPath;
}
export function withReturnParams(
  returnTo: string,
  mutator: (params: URLSearchParams) => void,
) {
  const url = new URL(returnTo, "http://localhost");
  const params = new URLSearchParams(url.search);
  mutator(params);
  const query = params.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}
export function isChecked(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "1" || value === "on" || value === "true";
}
export function revalidateProjectPages() {
  revalidatePath("/");
  revalidatePath("/projects");
}
export function revalidateProjectCache() {
  revalidateTag(CACHE_TAGS.projects, "max");
}
export function revalidateExpenseCache() {
  revalidateTag(CACHE_TAGS.expenses, "max");
  revalidateTag(CACHE_TAGS.expenseCategories, "max");
}
export function revalidateAttendanceCache() {
  revalidateTag(CACHE_TAGS.attendance, "max");
  revalidateTag(CACHE_TAGS.payrollResets, "max");
}
export async function requireEditorActionUser() {
  const user = await requireAuthUser();
  if (!canManageProjects(user)) {
    redirect("/");
  }
  return user;
}
export async function requireAttendanceActionUser() {
  const user = await requireAuthUser();
  if (!canManageAttendance(user)) {
    redirect("/");
  }
  return user;
}
export async function requireImportActionUser() {
  const user = await requireAuthUser();
  if (!canImportData(user)) {
    redirect("/");
  }
  return user;
}
export async function requireLogsActionUser() {
  const user = await requireAuthUser();
  if (!canManageModule(user, "logs")) {
    redirect("/");
  }
  return user;
}
export function createTimestamp() {
  return new Date().toISOString();
}
export function createDeterministicUuid(seed: string) {
  const hash = createHash("sha256").update(seed).digest("hex");
  const version = `5${hash.slice(13, 16)}`;
  const variant = `${(8 + (parseInt(hash.slice(16, 17), 16) % 4)).toString(16)}${hash.slice(17, 20)}`;
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${version}-${variant}-${hash.slice(20, 32)}`;
}
export async function ensureSupabaseAttendanceDraftProjectId(
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
export function resolveDraftAttendanceNotes(input: {
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
export function resolveFinalAttendanceNotes(
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
export function parseAttendanceStatusValue(value: string): AttendanceStatus {
  return ATTENDANCE_STATUSES.some((item) => item.value === value)
    ? (value as AttendanceStatus)
    : "hadir";
}
export function parseWorkerTeamValue(value: string): WorkerTeam {
  return WORKER_TEAMS.some((item) => item.value === value) ? (value as WorkerTeam) : "tukang";
}
export function normalizeAttendanceIdentityText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}
export function createAttendanceMutationId(input: {
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
export function createPayrollResetMutationId(input: {
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
export function resolveAutoOvertimeWage(dailyWage: number) {
  if (!Number.isFinite(dailyWage) || dailyWage <= 0) {
    return 0;
  }
  return Math.max(dailyWage / 8, 0);
}
export type AttendanceDuplicateCheckInput = {
  id?: string;
  projectId: string;
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  attendanceDate: string;
};
export type AttendanceDuplicateCheckRow = {
  id: string;
  projectId: string;
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  attendanceDate: string;
};
export function hasSameAttendanceIdentity(
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
export async function findDuplicateAttendanceRecord(
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
export function getExpenseSubmissionToken(formData: FormData) {
  return getString(formData, "expense_submission_token") || randomUUID();
}
export function createExpenseMutationId(input: {
  mode: "standard" | "hok_kmp_cianjur" | "scraper";
  submissionToken: string;
  projectId: string;
  rowKey?: string;
}) {
  const seedParts = ["expense", input.mode, input.submissionToken.trim(), input.projectId.trim()];
  const rowKey = input.rowKey?.trim();
  if (rowKey) {
    seedParts.push(rowKey);
  }
  return createDeterministicUuid(
    seedParts.join("|"),
  );
}
export function shouldSyncExpenseCategory(formData: FormData) {
  const customCategory = toCategorySlug(getString(formData, "category_custom"));
  return Boolean(customCategory && !isHiddenCostCategory(customCategory));
}
export function parseProjectInitialCategories(formData: FormData) {
  const raw = getString(formData, "initial_categories");
  return parseCategoryListInput(raw);
}
export function buildSupabaseCategoryRows(categories: string[]) {
  return categories.map((category) => ({
    slug: category,
    label: getCostCategoryLabel(category),
  }));
}
export async function upsertSupabaseCategories(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>, categories: string[]) {
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
export function isFirebaseNotFoundError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const withCode = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = withCode.code;
  const message = typeof withCode.message === "string" ? withCode.message.toUpperCase() : "";
  const details = typeof withCode.details === "string" ? withCode.details.toUpperCase() : "";

  return code === 5 || code === "5" || message.includes("NOT_FOUND") || details.includes("NOT_FOUND");
}
export let hasWarnedFirebaseWriteDatabaseMissing = false;
export async function runFirebaseWriteSafely(task: () => Promise<void>) {
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
export async function deleteFirebaseDocsByField(
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
export type ParsedTemplateImportData = NonNullable<ReturnType<typeof parseTemplateExcelDataFromBuffer>>;
export function normalizeImportText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}
export function normalizeImportNumber(value: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
export function buildImportExpenseSignature(input: {
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
export function chunkArray<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}
export async function importTemplateDataToSupabase(parsed: ParsedTemplateImportData) {
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
export async function importTemplateDataToFirebase(parsed: ParsedTemplateImportData) {
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
export function getParsedCategory(formData: FormData) {
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
export function getSpecialistType(formData: FormData, category: string | null) {
  if (category !== "upah_tim_spesialis") {
    return null;
  }

  const custom = getString(formData, "specialist_type_custom");
  if (custom) {
    return custom;
  }

  return getString(formData, "specialist_type") || null;
}
export function getParsedWorkerTeam(formData: FormData): WorkerTeam {
  const team = getString(formData, "team_type");
  return WORKER_TEAMS.some((item) => item.value === team) ? (team as WorkerTeam) : "tukang";
}
export function getParsedReimburseType(formData: FormData): ReimburseType | null {
  const reimburseType = getString(formData, "reimburse_type");
  return REIMBURSE_TYPES.some((item) => item.value === reimburseType)
    ? (reimburseType as ReimburseType)
    : null;
}
export function resolveAmountByMode(formData: FormData, baseAmount: number) {
  const mode = getString(formData, "amount_mode");
  if (mode === "kurangi") {
    return -Math.abs(baseAmount);
  }
  return Math.abs(baseAmount);
}
export function getExpenseTargetProjectIds(formData: FormData) {
  const selectedIds = getStringList(formData, "project_ids");
  const primaryProjectId = getString(formData, "project_id");
  if (primaryProjectId) {
    selectedIds.unshift(primaryProjectId);
  }
  return Array.from(new Set(selectedIds));
}
export function parsePositiveAmount(value: unknown) {
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
export async function createHokExpenseEntries(
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

  const parsedCandidateRows = parsedRows
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
      if (!projectId || !projectName) {
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

  if (parsedCandidateRows.length === 0) {
    if (errorReturnTo) {
      redirect(
        withReturnMessage(
          errorReturnTo,
          "error",
          "Data project HOK tidak lengkap. Pastikan nama pengajuan dan nominal terisi.",
        ),
      );
    }
    return;
  }

  const missingRequesterCount = parsedCandidateRows.filter((row) => !row.requesterName).length;
  if (missingRequesterCount > 0) {
    if (errorReturnTo) {
      redirect(
        withReturnMessage(
          errorReturnTo,
          "error",
          `Nama pengajuan wajib diisi untuk ${missingRequesterCount} project HOK.`,
        ),
      );
    }
    return;
  }

  const missingAmountCount = parsedCandidateRows.filter((row) => row.amount <= 0).length;
  if (missingAmountCount > 0) {
    if (errorReturnTo) {
      redirect(
        withReturnMessage(
          errorReturnTo,
          "error",
          `Nominal HOK wajib diisi untuk ${missingAmountCount} project yang dipilih.`,
        ),
      );
    }
    return;
  }

  const rows = parsedCandidateRows;

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
export async function createScraperExpenseEntries(
  actor: Awaited<ReturnType<typeof requireEditorActionUser>>,
  formData: FormData,
  successReturnTo: string | null,
  errorReturnTo: string | null,
) {
  const rawRows = getString(formData, "scraper_rows_json");
  let parsedRows: unknown;
  try {
    parsedRows = rawRows ? JSON.parse(rawRows) : [];
  } catch {
    if (errorReturnTo) {
      redirect(withReturnMessage(errorReturnTo, "error", "Data mode scraper tidak valid."));
    }
    return;
  }

  if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
    if (errorReturnTo) {
      redirect(withReturnMessage(errorReturnTo, "error", "Tambahkan minimal satu baris project scraper."));
    }
    return;
  }

  const requesterName = getString(formData, "requester_name");
  const description = getString(formData, "description");
  const parsedCategory = getParsedCategory(formData);
  if (!requesterName || !description || !parsedCategory) {
    if (errorReturnTo) {
      redirect(
        withReturnMessage(
          errorReturnTo,
          "error",
          "Lengkapi nama pengajuan, kategori, dan keterangan untuk mode scraper.",
        ),
      );
    }
    return;
  }

  const specialistType = getSpecialistType(formData, parsedCategory);
  const recipientName = getString(formData, "recipient_name") || null;
  const usageInfo = getString(formData, "usage_info") || null;
  const quantity = getNumber(formData, "quantity");
  const unitLabel = getString(formData, "unit_label") || null;
  const unitPrice = getNumber(formData, "unit_price");
  const expenseDate = getString(formData, "expense_date") || new Date().toISOString().slice(0, 10);

  const rows = parsedRows
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const rowId =
        typeof (item as { id?: unknown }).id === "string"
          ? (item as { id: string }).id.trim()
          : `row-${index + 1}`;
      const projectId =
        typeof (item as { projectId?: unknown }).projectId === "string"
          ? (item as { projectId: string }).projectId.trim()
          : "";
      const projectName =
        typeof (item as { projectName?: unknown }).projectName === "string"
          ? (item as { projectName: string }).projectName.trim()
          : "";
      const amount = parsePositiveAmount((item as { amount?: unknown }).amount);
      if (!projectId || amount <= 0) {
        return null;
      }

      return {
        rowId,
        projectId,
        projectName,
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
          "Setiap baris scraper wajib memiliki project dan nominal yang valid.",
        ),
      );
    }
    return;
  }

  const duplicateProjectIds = Array.from(
    rows.reduce((duplicates, row, index) => {
      if (rows.findIndex((item) => item.projectId === row.projectId) !== index) {
        duplicates.add(row.projectId);
      }
      return duplicates;
    }, new Set<string>()),
  );
  if (duplicateProjectIds.length > 0) {
    if (errorReturnTo) {
      redirect(
        withReturnMessage(
          errorReturnTo,
          "error",
          "Project pada mode scraper tidak boleh dipilih lebih dari satu kali dalam sekali simpan.",
        ),
      );
    }
    return;
  }

  const submissionToken = getExpenseSubmissionToken(formData);
  const shouldSyncCategory = shouldSyncExpenseCategory(formData);
  const basePayload = {
    category: parsedCategory,
    specialist_type: specialistType,
    requester_name: requesterName,
    description,
    recipient_name: recipientName,
    quantity,
    unit_label: unitLabel,
    usage_info: usageInfo,
    unit_price: unitPrice,
    expense_date: expenseDate,
  };

  if (activeDataSource === "excel") {
    for (const row of rows) {
      insertExcelExpense({
        ...basePayload,
        project_id: row.projectId,
        amount: row.amount,
      });
    }
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }

    const saveExpensePromise = supabase.from("project_expenses").upsert(
      rows.map((row) => ({
        id: createExpenseMutationId({
          mode: "scraper",
          submissionToken,
          projectId: row.projectId,
          rowKey: row.rowId,
        }),
        project_id: row.projectId,
        category: basePayload.category,
        specialist_type: basePayload.specialist_type,
        requester_name: basePayload.requester_name,
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
    const expenseResult = shouldSyncCategory
      ? (await Promise.all([upsertSupabaseCategories(supabase, [basePayload.category]), saveExpensePromise]))[1]
      : await saveExpensePromise;
    if (expenseResult.error) {
      if (errorReturnTo) {
        redirect(withReturnMessage(errorReturnTo, "error", "Gagal menyimpan data scraper. Silakan coba lagi."));
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
          mode: "scraper",
          submissionToken,
          projectId: row.projectId,
          rowKey: row.rowId,
        });
        batch.set(
          firestore.collection("project_expenses").doc(id),
          {
            id,
            ...basePayload,
            project_id: row.projectId,
            amount: row.amount,
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

  revalidateProjectPages();
  revalidateExpenseCache();
  revalidatePath("/logs");
  queueActivityLog({
    actor,
    actionType: "create",
    module: "expense",
    description: `Menambah data biaya mode scraper ke ${rows.length} project.`,
    payload: {
      expense_mode: "scraper",
      project_ids: rows.map((row) => row.projectId),
      project_names: rows.map((row) => row.projectName || row.projectId),
      requester_name: basePayload.requester_name,
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
        `Data scraper berhasil disimpan ke ${rows.length} project.`,
      ),
    );
  }
}
export type AttendanceRecapRowInput = {
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
export function resolveAttendanceExportRowId(input: {
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
export function buildAttendanceRecapRowsFromFormData(formData: FormData): AttendanceRecapRowInput[] {
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
