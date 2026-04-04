import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  COST_CATEGORIES,
  type ExpenseCategoryOption,
  getCostCategoryLabel,
  isHiddenCostCategory,
  mergeExpenseCategoryOptions,
  PROJECT_STATUSES,
  resolveSummaryCostCategory,
  toCategorySlug,
  WORKER_TEAMS,
  WORKER_TEAM_LABEL,
} from "@/lib/constants";
import { readExcelDatabase } from "@/lib/excel-db";
import { getFirestoreServerClient } from "@/lib/firebase";
import { activeDataSource } from "@/lib/storage";
import {
  getSupabaseAttendanceSelect,
  getSupabasePayrollResetSelect,
  getSupabaseServerClient,
  withSupabaseSpecialistTeamNameFallback,
} from "@/lib/supabase";
import type {
  AttendanceRecord,
  CategoryTotal,
  ClientCategoryTotal,
  DashboardData,
  ExpenseEntry,
  Project,
  ProjectDetail,
  ProjectExpenseSearchResult,
  WageProjectSummary,
  WageProjectTeamSummary,
  WageRecap,
  WageTeamSummary,
  WageWorkerSummary,
} from "@/lib/types";

const sampleProjects: Project[] = [
  {
    id: "sample-1",
    name: "Renovasi Kantor Selatan",
    code: "RKS-001",
    clientName: "PT Sumber Jaya",
    startDate: "2026-01-10",
    status: "aktif",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "sample-2",
    name: "Pembangunan Gudang Timur",
    code: "PGT-014",
    clientName: "CV Maju Beton",
    startDate: "2025-12-18",
    status: "aktif",
    createdAt: "2025-12-18T07:00:00.000Z",
  },
];

const sampleExpenses: ExpenseEntry[] = [
  {
    id: "exp-1",
    projectId: "sample-1",
    projectName: "Renovasi Kantor Selatan",
    category: "material",
    specialistType: null,
    requesterName: "Mandor Lapangan",
    description: "Pembelian semen dan cat",
    recipientName: "TB Sinar Bangun",
    quantity: 1,
    unitLabel: "paket",
    usageInfo: "Kebutuhan finishing area lobby",
    unitPrice: 9200000,
    amount: 9200000,
    expenseDate: "2026-02-12",
    createdAt: "2026-02-12T10:00:00.000Z",
  },
  {
    id: "exp-2",
    projectId: "sample-1",
    projectName: "Renovasi Kantor Selatan",
    category: "upah_kasbon_tukang",
    specialistType: null,
    requesterName: "Rian",
    description: "Kasbon mingguan tim tukang",
    recipientName: "Mandor lapangan",
    quantity: 1,
    unitLabel: "transaksi",
    usageInfo: "Kasbon mingguan",
    unitPrice: 2750000,
    amount: 2750000,
    expenseDate: "2026-02-11",
    createdAt: "2026-02-11T11:00:00.000Z",
  },
  {
    id: "exp-3",
    projectId: "sample-2",
    projectName: "Pembangunan Gudang Timur",
    category: "operasional",
    specialistType: null,
    requesterName: "Admin Proyek",
    description: "Bensin, tol, konsumsi",
    recipientName: "Operasional Proyek",
    quantity: 1,
    unitLabel: "paket",
    usageInfo: "Operasional harian",
    unitPrice: 1350000,
    amount: 1350000,
    expenseDate: "2026-02-09",
    createdAt: "2026-02-09T11:00:00.000Z",
  },
];

const sampleAttendance: AttendanceRecord[] = [
  {
    id: "att-1",
    projectId: "sample-1",
    projectName: "Renovasi Kantor Selatan",
    workerName: "Dedi",
    teamType: "tukang",
    specialistTeamName: null,
    status: "hadir",
    workDays: 1,
    dailyWage: 250000,
    overtimeHours: 2,
    overtimeWage: 25000,
    overtimePay: 50000,
    kasbonAmount: 150000,
    reimburseType: null,
    reimburseAmount: 0,
    netPay: 150000,
    payrollPaid: false,
    attendanceDate: "2026-02-14",
    notes: "Lembur 2 jam",
    createdAt: "2026-02-14T17:00:00.000Z",
  },
  {
    id: "att-2",
    projectId: "sample-2",
    projectName: "Pembangunan Gudang Timur",
    workerName: "Joko",
    teamType: "laden",
    specialistTeamName: null,
    status: "hadir",
    workDays: 1,
    dailyWage: 230000,
    overtimeHours: 0,
    overtimeWage: 0,
    overtimePay: 0,
    kasbonAmount: 50000,
    reimburseType: null,
    reimburseAmount: 0,
    netPay: 180000,
    payrollPaid: false,
    attendanceDate: "2026-02-14",
    notes: null,
    createdAt: "2026-02-14T17:20:00.000Z",
  },
  {
    id: "att-3",
    projectId: "sample-1",
    projectName: "Renovasi Kantor Selatan",
    workerName: "Rian",
    teamType: "spesialis",
    specialistTeamName: "Tim Baja",
    status: "izin",
    workDays: 1,
    dailyWage: 0,
    overtimeHours: 0,
    overtimeWage: 0,
    overtimePay: 0,
    kasbonAmount: 0,
    reimburseType: null,
    reimburseAmount: 0,
    netPay: 0,
    payrollPaid: false,
    attendanceDate: "2026-02-13",
    notes: "Izin keluarga",
    createdAt: "2026-02-13T17:20:00.000Z",
  },
];

const samplePayrollResets: Array<{
  projectId: string;
  teamType: "tukang" | "laden" | "spesialis";
  specialistTeamName: string | null;
  workerName: string | null;
  paidUntilDate: string;
}> = [];

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function resolveWorkDays(value: unknown) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

function getAttendanceTotalWage(row: AttendanceRecord) {
  if (row.status !== "hadir") {
    return 0;
  }
  return row.dailyWage * row.workDays;
}

function getAttendanceOvertimePay(row: AttendanceRecord) {
  if (row.status !== "hadir") {
    return 0;
  }
  return row.overtimePay;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function resolveClientScopeName(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || "Tanpa Klien";
}

function resolveLegacySpecialistTeamName(params: {
  teamType: string;
  specialistTeamName: string | null;
  projectName?: string;
}) {
  if (params.teamType !== "spesialis" || params.specialistTeamName) {
    return params.specialistTeamName;
  }

  const projectLabel = params.projectName?.trim() ?? "";
  if (!projectLabel) {
    return null;
  }

  const match = /^TIM\s+SPESIALIS\s+(.+)$/i.exec(projectLabel);
  if (!match) {
    return null;
  }

  const derivedTeamName = match[1]?.trim() ?? "";
  return derivedTeamName || null;
}

function resolveClientScopeKey(value: string | null | undefined) {
  return resolveClientScopeName(value).toLowerCase();
}

function getMonthStartDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function resolveJoinName(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object" && "name" in first) {
      const name = (first as { name?: unknown }).name;
      return typeof name === "string" ? name : undefined;
    }
  }

  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : undefined;
  }

  return undefined;
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

let hasWarnedFirebaseDatabaseMissing = false;

function mapFirebaseRecord(id: string, data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  return { id, ...(data as Record<string, unknown>) };
}

async function getFirebaseCollectionRows(collectionName: string): Promise<Record<string, unknown>[]> {
  const firestore = getFirestoreServerClient();
  if (!firestore) {
    return [];
  }

  try {
    const snapshot = await firestore.collection(collectionName).get();
    return snapshot.docs
      .map((doc) => mapFirebaseRecord(doc.id, doc.data()))
      .filter((row): row is Record<string, unknown> => Boolean(row));
  } catch (error) {
    if (isFirebaseNotFoundError(error)) {
      if (!hasWarnedFirebaseDatabaseMissing) {
        hasWarnedFirebaseDatabaseMissing = true;
        console.warn(
          "[firebase] Firestore database belum ditemukan. Buat database dulu di Firebase Console (Firestore).",
        );
      }
    } else {
      console.warn(`[firebase] gagal membaca koleksi "${collectionName}".`, error);
    }
    return [];
  }
}

async function getFirebaseDocRow(
  collectionName: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const firestore = getFirestoreServerClient();
  if (!firestore) {
    return null;
  }

  try {
    const doc = await firestore.collection(collectionName).doc(id).get();
    if (!doc.exists) {
      return null;
    }

    return mapFirebaseRecord(doc.id, doc.data());
  } catch (error) {
    if (isFirebaseNotFoundError(error)) {
      if (!hasWarnedFirebaseDatabaseMissing) {
        hasWarnedFirebaseDatabaseMissing = true;
        console.warn(
          "[firebase] Firestore database belum ditemukan. Buat database dulu di Firebase Console (Firestore).",
        );
      }
    } else {
      console.warn(`[firebase] gagal membaca dokumen "${collectionName}/${id}".`, error);
    }
    return null;
  }
}

type SupabasePagedRowsQuery = {
  eq(column: string, value: unknown): SupabasePagedRowsQuery;
  order(column: string, options?: { ascending?: boolean }): SupabasePagedRowsQuery;
  range(
    from: number,
    to: number,
  ): Promise<{
    data: Record<string, unknown>[] | null;
    error: unknown;
  }>;
};

async function getAllSupabaseRows(
  table: string,
  select: string,
  configure?: (query: SupabasePagedRowsQuery) => SupabasePagedRowsQuery,
  pageSize = 1000,
): Promise<Record<string, unknown>[]> {
  const result = await getAllSupabaseRowsResult(table, select, configure, pageSize);
  return result.data ?? [];
}

async function getAllSupabaseRowsResult(
  table: string,
  select: string,
  configure?: (query: SupabasePagedRowsQuery) => SupabasePagedRowsQuery,
  pageSize = 1000,
): Promise<{
  data: Record<string, unknown>[] | null;
  error: unknown;
}> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return {
      data: [],
      error: null,
    };
  }

  const rows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(select) as unknown as SupabasePagedRowsQuery;
    if (configure) {
      query = configure(query);
    }

    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error || !data) {
      return {
        data: null,
        error,
      };
    }

    rows.push(...data);
    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return {
    data: rows,
    error: null,
  };
}

const SUPABASE_CACHE_REVALIDATE_SECONDS = 60;
const SUPABASE_PROJECT_SELECT =
  "id, name, code, client_name, start_date, status, created_at";
const SUPABASE_EXPENSE_METADATA_SELECT = "project_id, requester_name, description, category";
const SUPABASE_EXPENSE_FULL_SELECT =
  "id, project_id, category, specialist_type, requester_name, description, recipient_name, quantity, unit_label, usage_info, unit_price, amount, expense_date, created_at";

type CachedSupabaseExpenseMetadata = {
  categoryRows: Record<string, unknown>[];
  expenseRows: Record<string, unknown>[];
};

const getCachedSupabaseProjectRows = unstable_cache(
  async (): Promise<Record<string, unknown>[]> => {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return [];
    }

    const { data, error } = await supabase
      .from("projects")
      .select(SUPABASE_PROJECT_SELECT)
      .order("created_at", { ascending: false });

    if (error || !data) {
      return [];
    }

    return data;
  },
  ["supabase-project-rows"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.projects],
  },
);

const getCachedSupabaseExpenseMetadata = unstable_cache(
  async (): Promise<CachedSupabaseExpenseMetadata> => {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return {
        categoryRows: [],
        expenseRows: [],
      };
    }

    const [{ data: categoryRows, error: categoryError }, expenseRows] = await Promise.all([
      supabase.from("expense_categories").select("slug, label").order("created_at", { ascending: true }),
      getAllSupabaseRows(
        "project_expenses",
        SUPABASE_EXPENSE_METADATA_SELECT,
        (query) => query.order("expense_date", { ascending: false }),
      ),
    ]);

    return {
      categoryRows: !categoryError && Array.isArray(categoryRows) ? categoryRows : [],
      expenseRows,
    };
  },
  ["supabase-expense-metadata"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.expenses, CACHE_TAGS.expenseCategories],
  },
);

const getCachedSupabaseProjectRowById = unstable_cache(
  async (projectId: string): Promise<Record<string, unknown> | null> => {
    const supabase = getSupabaseServerClient();
    if (!supabase || !projectId) {
      return null;
    }

    const { data, error } = await supabase
      .from("projects")
      .select(SUPABASE_PROJECT_SELECT)
      .eq("id", projectId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data;
  },
  ["supabase-project-row-by-id"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.projects],
  },
);

const getCachedSupabaseProjectExpenseRows = unstable_cache(
  async (projectId: string): Promise<Record<string, unknown>[]> => {
    if (!projectId) {
      return [];
    }

    return getAllSupabaseRows(
      "project_expenses",
      SUPABASE_EXPENSE_FULL_SELECT,
      (query) => query.eq("project_id", projectId).order("expense_date", { ascending: true }),
    );
  },
  ["supabase-project-expenses-by-project"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.expenses],
  },
);

const getCachedSupabaseAllExpenseRows = unstable_cache(
  async (): Promise<Record<string, unknown>[]> =>
    getAllSupabaseRows("project_expenses", SUPABASE_EXPENSE_FULL_SELECT),
  ["supabase-all-expenses"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.expenses],
  },
);

const getCachedSupabaseAllAttendanceRows = unstable_cache(
  async (): Promise<Record<string, unknown>[]> => {
    const result = await withSupabaseSpecialistTeamNameFallback<Record<string, unknown>[]>(
      ({ omitSpecialistTeamName }) =>
        getAllSupabaseRowsResult(
          "attendance_records",
          getSupabaseAttendanceSelect({ omitSpecialistTeamName }),
        ),
    );
    return result.data ?? [];
  },
  ["supabase-all-attendance"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.attendance],
  },
);

const getCachedSupabasePayrollResetRows = unstable_cache(
  async (): Promise<Record<string, unknown>[]> => {
    const result = await withSupabaseSpecialistTeamNameFallback<Record<string, unknown>[]>(
      ({ omitSpecialistTeamName }) =>
        getAllSupabaseRowsResult(
          "payroll_resets",
          getSupabasePayrollResetSelect({ omitSpecialistTeamName }),
        ),
    );
    return result.data ?? [];
  },
  ["supabase-payroll-resets"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.payrollResets],
  },
);

type PayrollResetRow = {
  projectId: string;
  teamType: "tukang" | "laden" | "spesialis";
  specialistTeamName: string | null;
  workerName: string | null;
  paidUntilDate: string;
};

function mapPayrollResetRow(row: Record<string, unknown>): PayrollResetRow | null {
  const teamTypeValue = String(row.team_type ?? "");
  if (teamTypeValue !== "tukang" && teamTypeValue !== "laden" && teamTypeValue !== "spesialis") {
    return null;
  }

  return {
    projectId: String(row.project_id ?? ""),
    teamType: teamTypeValue,
    specialistTeamName:
      typeof row.specialist_team_name === "string" ? row.specialist_team_name : null,
    workerName: typeof row.worker_name === "string" ? row.worker_name : null,
    paidUntilDate: String(row.paid_until_date ?? ""),
  };
}

function buildCategoryTotals(
  expenses: ExpenseEntry[],
  categoryOptions?: ExpenseCategoryOption[],
): CategoryTotal[] {
  const totalsByCategory = new Map<string, number>();
  for (const expense of expenses) {
    const category = resolveSummaryCostCategory({
      category: expense.category,
      description: expense.description,
      usageInfo: expense.usageInfo,
    });
    if (!category) {
      continue;
    }
    totalsByCategory.set(category, (totalsByCategory.get(category) ?? 0) + expense.amount);
  }

  const mergedOptions =
    categoryOptions && categoryOptions.length > 0
      ? mergeExpenseCategoryOptions(categoryOptions, Array.from(totalsByCategory.keys()))
      : mergeExpenseCategoryOptions(Array.from(totalsByCategory.keys()));

  return mergedOptions.map((item) => ({
    category: item.value,
    label: item.label,
    total: totalsByCategory.get(item.value) ?? 0,
  }));
}

function buildCategoryTotalsByClient(
  expenses: ExpenseEntry[],
  projects: Project[],
  categoryOptions?: ExpenseCategoryOption[],
): ClientCategoryTotal[] {
  const projectById = new Map(projects.map((project) => [project.id, project] as const));
  const projectCountByClientKey = new Map<string, { clientName: string; count: number }>();
  for (const project of projects) {
    const clientName = resolveClientScopeName(project.clientName);
    const clientKey = resolveClientScopeKey(project.clientName);
    if (!projectCountByClientKey.has(clientKey)) {
      projectCountByClientKey.set(clientKey, {
        clientName,
        count: 0,
      });
    }
    projectCountByClientKey.get(clientKey)!.count += 1;
  }

  const totalsByClientKey = new Map<
    string,
    {
      clientName: string;
      totalExpense: number;
      totalsByCategory: Map<string, number>;
    }
  >();

  for (const expense of expenses) {
    const project = projectById.get(expense.projectId);
    const clientName = resolveClientScopeName(project?.clientName);
    const clientKey = resolveClientScopeKey(project?.clientName);
    const category = resolveSummaryCostCategory({
      category: expense.category,
      description: expense.description,
      usageInfo: expense.usageInfo,
    });
    if (!category) {
      continue;
    }

    if (!totalsByClientKey.has(clientKey)) {
      totalsByClientKey.set(clientKey, {
        clientName,
        totalExpense: 0,
        totalsByCategory: new Map<string, number>(),
      });
    }

    const clientTotals = totalsByClientKey.get(clientKey)!;
    clientTotals.totalExpense += expense.amount;
    clientTotals.totalsByCategory.set(
      category,
      (clientTotals.totalsByCategory.get(category) ?? 0) + expense.amount,
    );
  }

  return Array.from(totalsByClientKey.entries())
    .map(([clientKey, summary]) => {
      const mergedOptions =
        categoryOptions && categoryOptions.length > 0
          ? mergeExpenseCategoryOptions(categoryOptions, Array.from(summary.totalsByCategory.keys()))
          : mergeExpenseCategoryOptions(Array.from(summary.totalsByCategory.keys()));

      return {
        clientName: summary.clientName,
        projectCount: projectCountByClientKey.get(clientKey)?.count ?? 0,
        totalExpense: summary.totalExpense,
        categoryTotals: mergedOptions
          .map((item) => ({
            category: item.value,
            label: item.label,
            total: summary.totalsByCategory.get(item.value) ?? 0,
          }))
          .filter((item) => item.total !== 0),
      };
    })
    .sort((a, b) => {
      if (b.totalExpense !== a.totalExpense) {
        return b.totalExpense - a.totalExpense;
      }
      return a.clientName.localeCompare(b.clientName, "id-ID");
    });
}

function buildWageSummary(rows: AttendanceRecord[]) {
  const totals: Record<string, WageProjectSummary & { workerNames: Set<string> }> = {};

  for (const row of rows) {
    if (!totals[row.projectId]) {
      totals[row.projectId] = {
        projectId: row.projectId,
        projectName: row.projectName ?? "Project",
        totalDailyWage: 0,
        totalKasbon: 0,
        totalNetPay: 0,
        workerCount: 0,
        workerNames: new Set<string>(),
      };
    }

    const projectTotal = totals[row.projectId];
    projectTotal.totalDailyWage += getAttendanceTotalWage(row);
    projectTotal.totalKasbon += row.kasbonAmount;
    projectTotal.totalNetPay += row.netPay;
    projectTotal.workerNames.add(row.workerName);
  }

  return Object.values(totals)
    .map((item) => ({
      projectId: item.projectId,
      projectName: item.projectName,
      totalDailyWage: item.totalDailyWage,
      totalKasbon: item.totalKasbon,
      totalNetPay: item.totalNetPay,
      workerCount: item.workerNames.size,
    }))
    .sort((a, b) => b.totalNetPay - a.totalNetPay);
}

function buildWageTeamSummary(rows: AttendanceRecord[]) {
  const totals: Record<string, WageTeamSummary & { workerNames: Set<string> }> = {};

  for (const row of rows) {
    const key =
      row.teamType === "spesialis"
        ? `spesialis:${(row.specialistTeamName ?? "Tim Spesialis").toLowerCase()}`
        : row.teamType;
    const label =
      row.teamType === "spesialis"
        ? `Tim Spesialis - ${row.specialistTeamName ?? "Lainnya"}`
        : row.teamType === "laden"
          ? "Laden"
          : "Tukang";

    if (!totals[key]) {
      totals[key] = {
        key,
        label,
        totalDailyWage: 0,
        totalKasbon: 0,
        totalNetPay: 0,
        workerCount: 0,
        workerNames: new Set<string>(),
      };
    }

    const summary = totals[key];
    summary.totalDailyWage += getAttendanceTotalWage(row);
    summary.totalKasbon += row.kasbonAmount;
    summary.totalNetPay += row.netPay;
    summary.workerNames.add(row.workerName);
  }

  return Object.values(totals)
    .map((item) => ({
      key: item.key,
      label: item.label,
      totalDailyWage: item.totalDailyWage,
      totalKasbon: item.totalKasbon,
      totalNetPay: item.totalNetPay,
      workerCount: item.workerNames.size,
    }))
    .sort((a, b) => b.totalNetPay - a.totalNetPay);
}

function buildWageProjectTeamSummary(rows: AttendanceRecord[]) {
  const totals: Record<string, WageProjectTeamSummary & { workerNames: Set<string> }> = {};

  for (const row of rows) {
    const normalizedSpecialist = row.specialistTeamName?.trim().toLowerCase() ?? "";
    const key = `${row.projectId}|${row.teamType}|${normalizedSpecialist}`;
    const teamLabel =
      row.teamType === "spesialis"
        ? `Tim Spesialis - ${row.specialistTeamName ?? "Lainnya"}`
        : WORKER_TEAM_LABEL[row.teamType];
    if (!totals[key]) {
      totals[key] = {
        key,
        projectId: row.projectId,
        projectName: row.projectName ?? "Project",
        teamType: row.teamType,
        specialistTeamName: row.teamType === "spesialis" ? row.specialistTeamName : null,
        label: teamLabel,
        totalDailyWage: 0,
        totalKasbon: 0,
        totalNetPay: 0,
        workerCount: 0,
        latestAttendanceDate: "",
        workerNames: new Set<string>(),
      };
    }

    const summary = totals[key];
    summary.totalDailyWage += getAttendanceTotalWage(row);
    summary.totalKasbon += row.kasbonAmount;
    summary.totalNetPay += row.netPay;
    summary.workerNames.add(row.workerName);
    const attendanceDate = toDateOnly(row.attendanceDate);
    if (attendanceDate > summary.latestAttendanceDate) {
      summary.latestAttendanceDate = attendanceDate;
    }
  }

  return Object.values(totals)
    .map((item) => ({
      key: item.key,
      projectId: item.projectId,
      projectName: item.projectName,
      teamType: item.teamType,
      specialistTeamName: item.specialistTeamName,
      label: item.label,
      totalDailyWage: item.totalDailyWage,
      totalKasbon: item.totalKasbon,
      totalNetPay: item.totalNetPay,
      workerCount: item.workerNames.size,
      latestAttendanceDate: item.latestAttendanceDate,
    }))
    .sort((a, b) => {
      if (a.projectName !== b.projectName) {
        return a.projectName.localeCompare(b.projectName);
      }
      return b.totalNetPay - a.totalNetPay;
    });
}

function buildWageWorkerSummary(
  rows: AttendanceRecord[],
  recapMode: "gabung" | "per_project",
) {
  type WorkerAccumulator = WageWorkerSummary;
  const totals: Record<string, WorkerAccumulator> = {};

  for (const row of rows) {
    const normalizedName = row.workerName.trim().toLowerCase();
    const key =
      recapMode === "gabung" ? normalizedName : `${row.projectId}|${normalizedName}`;
    if (!totals[key]) {
      totals[key] = {
        key,
        workerName: row.workerName,
        projectId: recapMode === "per_project" ? row.projectId : null,
        projectName: recapMode === "per_project" ? (row.projectName ?? "Project") : null,
        workDays: 0,
        totalDailyWage: 0,
        totalKasbon: 0,
        totalNetPay: 0,
        totalNetPayUnpaid: 0,
        latestAttendanceDate: "",
        payrollPaid: false,
      };
    }

    const summary = totals[key];
    if (row.status === "hadir") {
      summary.workDays += row.workDays;
    }
    summary.totalDailyWage += getAttendanceTotalWage(row);
    summary.totalKasbon += row.kasbonAmount;
    summary.totalNetPay += row.netPay;
    if (!row.payrollPaid) {
      summary.totalNetPayUnpaid += row.netPay;
    }
    const attendanceDate = toDateOnly(row.attendanceDate);
    if (attendanceDate > summary.latestAttendanceDate) {
      summary.latestAttendanceDate = attendanceDate;
    }
    summary.payrollPaid = summary.totalNetPayUnpaid <= 0;
  }

  return Object.values(totals).sort((a, b) => {
    if (b.totalNetPay !== a.totalNetPay) {
      return b.totalNetPay - a.totalNetPay;
    }

    if (a.workerName !== b.workerName) {
      return a.workerName.localeCompare(b.workerName);
    }

    return (a.projectName ?? "").localeCompare(b.projectName ?? "");
  });
}

function buildProjectCountByClient(projects: Project[]) {
  const totals: Record<string, { clientName: string; count: number }> = {};

  for (const project of projects) {
    const clientName = resolveClientScopeName(project.clientName);
    const key = resolveClientScopeKey(project.clientName);
    if (!totals[key]) {
      totals[key] = {
        clientName,
        count: 0,
      };
    }
    totals[key].count += 1;
  }

  return Object.values(totals).sort((a, b) => {
    if (a.count !== b.count) {
      return b.count - a.count;
    }
    return a.clientName.localeCompare(b.clientName);
  });
}

function getProjectStatusRank(status: Project["status"] | undefined) {
  if (status === "selesai") {
    return 0;
  }
  if (status === "aktif") {
    return 1;
  }
  if (status === "tertunda") {
    return 2;
  }
  return 3;
}

function buildProjectExpenseTotals(expenses: ExpenseEntry[], projects: Project[] = []) {
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const projectStatusById = new Map(projects.map((project) => [project.id, project.status]));
  const totals: Record<
    string,
    {
      projectId: string;
      projectName: string;
      projectStatus: Project["status"];
      transactionCount: number;
      totalExpense: number;
      latestExpenseDate: string;
    }
  > = {};

  for (const expense of expenses) {
    const key = expense.projectId || "unknown-project";
    const expenseDate = toDateOnly(expense.expenseDate);
    if (!totals[key]) {
      const projectName =
        expense.projectName?.trim() || projectNameById.get(expense.projectId) || "Project";
      const projectStatus = projectStatusById.get(expense.projectId) ?? "aktif";
      totals[key] = {
        projectId: expense.projectId || "",
        projectName,
        projectStatus,
        transactionCount: 0,
        totalExpense: 0,
        latestExpenseDate: expenseDate,
      };
    }

    totals[key].transactionCount += 1;
    totals[key].totalExpense += expense.amount;
    if (expenseDate > totals[key].latestExpenseDate) {
      totals[key].latestExpenseDate = expenseDate;
    }
  }

  return Object.values(totals).sort((a, b) => {
    const statusRankDiff = getProjectStatusRank(a.projectStatus) - getProjectStatusRank(b.projectStatus);
    if (statusRankDiff !== 0) {
      return statusRankDiff;
    }
    if (b.totalExpense !== a.totalExpense) {
      return b.totalExpense - a.totalExpense;
    }
    return a.projectName.localeCompare(b.projectName);
  });
}

function buildProjectStatusTotals(projects: Project[]) {
  const totals = new Map<Project["status"], number>();
  for (const project of projects) {
    totals.set(project.status, (totals.get(project.status) ?? 0) + 1);
  }

  return PROJECT_STATUSES.map((item) => ({
    status: item.value,
    label: item.label,
    total: totals.get(item.value) ?? 0,
  }));
}

function buildExpenseTrend(expenses: ExpenseEntry[], monthCount = 6) {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    month: "short",
    year: "2-digit",
  });
  const now = new Date();
  const buckets = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (monthCount - index - 1), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: formatter.format(date),
      totalExpense: 0,
      transactionCount: 0,
    };
  });
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket] as const));

  for (const expense of expenses) {
    const key = toDateOnly(expense.expenseDate).slice(0, 7);
    const bucket = bucketByKey.get(key);
    if (!bucket) {
      continue;
    }
    bucket.totalExpense += expense.amount;
    bucket.transactionCount += 1;
  }

  return buckets;
}

function buildAttendanceTrend(attendance: AttendanceRecord[], dayCount = 14) {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
  });
  const today = new Date();
  const buckets = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (dayCount - index - 1));
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      label: formatter.format(date),
      total: 0,
      hadir: 0,
      izin: 0,
      sakit: 0,
      alpa: 0,
    };
  });
  const bucketByDate = new Map(buckets.map((bucket) => [bucket.date, bucket] as const));

  for (const row of attendance) {
    const key = toDateOnly(row.attendanceDate);
    const bucket = bucketByDate.get(key);
    if (!bucket) {
      continue;
    }
    bucket.total += 1;
    bucket[row.status] += 1;
  }

  return buckets;
}

function buildActiveWorkerCount(attendance: AttendanceRecord[], days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(days - 1, 0));
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const workerNames = new Set<string>();

  for (const row of attendance) {
    if (toDateOnly(row.attendanceDate) < cutoffDate) {
      continue;
    }
    const normalizedName = row.workerName.trim().toLowerCase();
    if (normalizedName) {
      workerNames.add(normalizedName);
    }
  }

  return workerNames.size;
}

function getLatestPaidUntil(
  row: AttendanceRecord,
  resets: Array<{
    projectId: string;
    teamType: "tukang" | "laden" | "spesialis";
    specialistTeamName: string | null;
    workerName: string | null;
    paidUntilDate: string;
  }>,
) {
  let latestPaidUntil = "";
  for (const reset of resets) {
    if (reset.projectId !== row.projectId) {
      continue;
    }
    if (reset.teamType !== row.teamType) {
      continue;
    }

    if (row.teamType === "spesialis" && reset.specialistTeamName) {
      if (normalizeText(reset.specialistTeamName) !== normalizeText(row.specialistTeamName)) {
        continue;
      }
    }

    if (reset.workerName) {
      if (normalizeText(reset.workerName) !== normalizeText(row.workerName)) {
        continue;
      }
    }

    if (reset.paidUntilDate > latestPaidUntil) {
      latestPaidUntil = reset.paidUntilDate;
    }
  }

  return latestPaidUntil;
}

function isPayrollResetExpired(paidUntilDate: string, resetIntervalDays = 3): boolean {
  const paidDate = new Date(paidUntilDate);
  if (Number.isNaN(paidDate.getTime())) {
    return true;
  }
  const now = new Date();
  const diffMs = now.getTime() - paidDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > resetIntervalDays;
}

function applyPayrollResets(
  rows: AttendanceRecord[],
  resets: Array<{
    projectId: string;
    teamType: "tukang" | "laden" | "spesialis";
    specialistTeamName: string | null;
    workerName: string | null;
    paidUntilDate: string;
  }>,
  includePaid = false,
) {
  const activeResets = resets.filter(
    (reset) => !isPayrollResetExpired(reset.paidUntilDate),
  );

  const mappedRows = rows.map((row) => {
    const latestPaidUntil = getLatestPaidUntil(row, activeResets);
    const payrollPaid = Boolean(latestPaidUntil && toDateOnly(row.attendanceDate) <= latestPaidUntil);
    return {
      ...row,
      payrollPaid,
    };
  });

  if (includePaid) {
    return mappedRows;
  }

  return mappedRows.filter((row) => !row.payrollPaid);
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    code: typeof row.code === "string" ? row.code : null,
    clientName: typeof row.client_name === "string" ? row.client_name : null,
    startDate: typeof row.start_date === "string" ? row.start_date : null,
    status:
      row.status === "aktif" || row.status === "selesai" || row.status === "tertunda"
        ? row.status
        : "aktif",
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapExpense(row: Record<string, unknown>, projectName?: string): ExpenseEntry {
  const rawQty = Number(row.quantity ?? 0);
  const rawUnitPrice = Number(row.unit_price ?? 0);
  const parsedCategory = toCategorySlug(String(row.category ?? "")) || COST_CATEGORIES[0]?.value || "operasional";
  return {
    id: String(row.id ?? ""),
    projectId: String(row.project_id ?? ""),
    projectName,
    category: parsedCategory,
    specialistType: typeof row.specialist_type === "string" ? row.specialist_type : null,
    requesterName: typeof row.requester_name === "string" ? row.requester_name : null,
    description: typeof row.description === "string" ? row.description : null,
    recipientName: typeof row.recipient_name === "string" ? row.recipient_name : null,
    quantity: Number.isFinite(rawQty) ? rawQty : 0,
    unitLabel: typeof row.unit_label === "string" ? row.unit_label : null,
    usageInfo: typeof row.usage_info === "string" ? row.usage_info : null,
    unitPrice: Number.isFinite(rawUnitPrice) ? rawUnitPrice : 0,
    amount: Number(row.amount ?? 0),
    expenseDate: String(row.expense_date ?? new Date().toISOString()),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function isVisibleExpense(entry: ExpenseEntry) {
  return !isHiddenCostCategory(entry.category);
}

function filterVisibleExpenses(entries: ExpenseEntry[]) {
  return entries.filter((entry) => isVisibleExpense(entry));
}

function mapAttendance(row: Record<string, unknown>, projectName?: string): AttendanceRecord {
  const rawWage = Number(row.daily_wage ?? 0);
  const rawOvertimeHours = Number(row.overtime_hours ?? 0);
  const rawOvertimeWage = Number(row.overtime_wage ?? 0);
  const rawKasbon = Number(row.kasbon_amount ?? 0);
  const rawReimburse = Number(row.reimburse_amount ?? 0);
  const workDays = resolveWorkDays(row.work_days);
  const dailyWage = Number.isFinite(rawWage) ? rawWage : 0;
  const overtimeHours = Number.isFinite(rawOvertimeHours) ? Math.max(rawOvertimeHours, 0) : 0;
  const overtimeWage = Number.isFinite(rawOvertimeWage) ? Math.max(rawOvertimeWage, 0) : 0;
  const overtimePay = overtimeHours * overtimeWage;
  const kasbonAmount = Number.isFinite(rawKasbon) ? rawKasbon : 0;
  const reimburseAmount = Number.isFinite(rawReimburse) ? rawReimburse : 0;
  const reimburseType =
    row.reimburse_type === "material" || row.reimburse_type === "kekurangan_dana"
      ? row.reimburse_type
      : null;
  const status: AttendanceRecord["status"] =
    row.status === "hadir" ||
      row.status === "izin" ||
      row.status === "sakit" ||
      row.status === "alpa"
      ? row.status
      : "hadir";
  const totalWage = status === "hadir" ? dailyWage * workDays : 0;
  const netPay = Math.max(totalWage + overtimePay - kasbonAmount + reimburseAmount, 0);

  return {
    id: String(row.id ?? ""),
    projectId: String(row.project_id ?? ""),
    projectName,
    workerName: String(row.worker_name ?? ""),
    teamType: WORKER_TEAMS.some((item) => item.value === row.team_type)
      ? (row.team_type as AttendanceRecord["teamType"])
      : "tukang",
    specialistTeamName: resolveLegacySpecialistTeamName({
      teamType: String(row.team_type ?? ""),
      specialistTeamName:
        typeof row.specialist_team_name === "string" ? row.specialist_team_name : null,
      projectName,
    }),
    status,
    workDays,
    dailyWage,
    overtimeHours,
    overtimeWage,
    overtimePay,
    kasbonAmount,
    reimburseType,
    reimburseAmount,
    netPay,
    payrollPaid: false,
    attendanceDate: String(row.attendance_date ?? new Date().toISOString()),
    notes: typeof row.notes === "string" ? row.notes : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function getExcelProjectsMapped() {
  const db = readExcelDatabase();
  return db.projects
    .map((row) => mapProject(row))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const getCachedSupabaseProjects = unstable_cache(
  async (): Promise<Project[]> => {
    const rows = await getCachedSupabaseProjectRows();
    return rows.map((row) => mapProject(row));
  },
  ["supabase-projects-mapped"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.projects],
  },
);

export async function getProjects(): Promise<Project[]> {
  if (activeDataSource === "excel") {
    return getExcelProjectsMapped();
  }

  if (activeDataSource === "supabase") {
    return getCachedSupabaseProjects();
  }

  if (activeDataSource === "firebase") {
    const rows = await getFirebaseCollectionRows("projects");
    return rows
      .map((row) => mapProject(row))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return sampleProjects;
}

function normalizeRequesterName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function isKmpCianjurClientName(value: string | null | undefined) {
  return resolveClientScopeKey(value).includes("kmp cianjur");
}

function isHokExpenseDescription(entry: Pick<ExpenseEntry, "description" | "usageInfo">) {
  const haystack = [entry.description, entry.usageInfo]
    .map((value) => value?.trim().toLowerCase() ?? "")
    .filter((value) => value.length > 0)
    .join(" ");
  return /\bhok\b/.test(haystack);
}

function incrementRequesterCounter(counter: Map<string, number>, requesterName: string) {
  counter.set(requesterName, (counter.get(requesterName) ?? 0) + 1);
}

function incrementRequesterCounterByProject(
  target: Map<string, Map<string, number>>,
  projectId: string,
  requesterName: string,
) {
  const current = target.get(projectId) ?? new Map<string, number>();
  incrementRequesterCounter(current, requesterName);
  target.set(projectId, current);
}

function pickTopRequester(counter: Map<string, number> | undefined) {
  if (!counter || counter.size === 0) {
    return "";
  }

  return (
    Array.from(counter.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0], "id-ID");
      })[0]?.[0] ?? ""
  );
}

function buildKmpCianjurHokProjectPresets(projects: Project[], expenses: ExpenseEntry[]) {
  const kmpProjects = projects
    .filter((project) => isKmpCianjurClientName(project.clientName))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "id-ID"));
  if (kmpProjects.length === 0) {
    return [];
  }

  const projectIdSet = new Set(kmpProjects.map((project) => project.id));
  const projectHokRequesterCounts = new Map<string, Map<string, number>>();
  const projectUpahRequesterCounts = new Map<string, Map<string, number>>();
  const clientHokRequesterCounts = new Map<string, number>();
  const clientUpahRequesterCounts = new Map<string, number>();

  for (const expense of expenses) {
    if (!isVisibleExpense(expense) || !projectIdSet.has(expense.projectId)) {
      continue;
    }

    const requesterName = normalizeRequesterName(expense.requesterName);
    if (!requesterName) {
      continue;
    }

    const isUpahKasbonTukang = toCategorySlug(expense.category) === "upah_kasbon_tukang";
    const isHokExpense = isHokExpenseDescription(expense);

    if (isHokExpense) {
      incrementRequesterCounter(clientHokRequesterCounts, requesterName);
      incrementRequesterCounterByProject(projectHokRequesterCounts, expense.projectId, requesterName);
    }

    if (isUpahKasbonTukang) {
      incrementRequesterCounter(clientUpahRequesterCounts, requesterName);
      incrementRequesterCounterByProject(projectUpahRequesterCounts, expense.projectId, requesterName);
    }
  }

  const clientHokRequester = pickTopRequester(clientHokRequesterCounts);
  const clientUpahRequester = pickTopRequester(clientUpahRequesterCounts);
  const fallbackRequester = clientHokRequester || clientUpahRequester || "MANDOR HOK";

  return kmpProjects.map((project) => {
    const projectHokRequester = pickTopRequester(projectHokRequesterCounts.get(project.id));
    const projectUpahRequester = pickTopRequester(projectUpahRequesterCounts.get(project.id));
    const requesterName = projectHokRequester || projectUpahRequester || fallbackRequester;
    const requesterSource: "project_hok" | "project_upah" | "client_hok" | "client_upah" | "fallback" =
      projectHokRequester
        ? "project_hok"
        : projectUpahRequester
          ? "project_upah"
          : clientHokRequester
            ? "client_hok"
            : clientUpahRequester
              ? "client_upah"
              : "fallback";

    return {
      projectId: project.id,
      projectName: project.name,
      clientName: project.clientName,
      requesterName,
      requesterSource,
      defaultSelected: Boolean(projectHokRequester || projectUpahRequester),
    };
  });
}

type KmpCianjurHokProjectPreset = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  requesterName: string;
  requesterSource: "project_hok" | "project_upah" | "client_hok" | "client_upah" | "fallback";
  defaultSelected: boolean;
};

const getCachedSupabaseKmpCianjurHokProjectPresets = unstable_cache(
  async (): Promise<KmpCianjurHokProjectPreset[]> => {
    const [projects, expenseRows] = await Promise.all([
      getCachedSupabaseProjects(),
      getCachedSupabaseAllExpenseRows(),
    ]);
    const projectNameMap = Object.fromEntries(
      projects.map((project) => [project.id, project.name] as const),
    );
    const expenses = expenseRows.map((row) => mapExpense(row, projectNameMap[String(row.project_id)]));
    return buildKmpCianjurHokProjectPresets(projects, expenses);
  },
  ["supabase-kmp-cianjur-hok-project-presets"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.projects, CACHE_TAGS.expenses],
  },
);

export async function getKmpCianjurHokProjectPresets(): Promise<
  KmpCianjurHokProjectPreset[]
> {
  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const projects = db.projects.map((row) => mapProject(row));
    const projectNameMap = Object.fromEntries(db.projects.map((project) => [project.id, project.name]));
    const expenses = db.project_expenses.map((row) => mapExpense(row, projectNameMap[row.project_id]));
    return buildKmpCianjurHokProjectPresets(projects, expenses);
  }

  if (activeDataSource === "supabase") {
    return getCachedSupabaseKmpCianjurHokProjectPresets();
  }

  if (activeDataSource === "firebase") {
    const [projectRows, expenseRows] = await Promise.all([
      getFirebaseCollectionRows("projects"),
      getFirebaseCollectionRows("project_expenses"),
    ]);
    const projectNameMap = Object.fromEntries(
      projectRows.map((row) => [String(row.id ?? ""), String(row.name ?? "Project")]),
    );
    const projects = projectRows.map((row) => mapProject(row));
    const expenses = expenseRows.map((row) => mapExpense(row, projectNameMap[String(row.project_id ?? "")]));
    return buildKmpCianjurHokProjectPresets(projects, expenses);
  }

  return buildKmpCianjurHokProjectPresets(sampleProjects, sampleExpenses);
}

export async function getExpenseCategories(): Promise<ExpenseCategoryOption[]> {
  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    return mergeExpenseCategoryOptions(db.project_expenses.map((row) => row.category));
  }

  if (activeDataSource === "supabase") {
    const { expenseCategories } = await getCachedSupabaseExpenseDerivedData();
    return expenseCategories;
  }

  if (activeDataSource === "firebase") {
    const [categoryRows, expenseRows] = await Promise.all([
      getFirebaseCollectionRows("expense_categories"),
      getFirebaseCollectionRows("project_expenses"),
    ]);
    const registeredOptions = categoryRows
      .map((row) => {
        const value = toCategorySlug(String(row.slug ?? row.value ?? ""));
        if (!value) {
          return null;
        }
        const labelRaw = typeof row.label === "string" ? row.label.trim() : "";
        return {
          value,
          label: labelRaw || getCostCategoryLabel(value),
        };
      })
      .filter((row): row is ExpenseCategoryOption => Boolean(row));
    const expenseValues = expenseRows
      .map((row) => toCategorySlug(String(row.category ?? "")))
      .filter((value) => value.length > 0);

    return mergeExpenseCategoryOptions(registeredOptions, expenseValues);
  }

  return mergeExpenseCategoryOptions(sampleExpenses.map((item) => item.category));
}

type ProjectTextSuggestionRow = {
  projectId: string;
  value: string | null;
};

function buildProjectTextSuggestionMap(rows: ProjectTextSuggestionRow[]) {
  const suggestionSetByProject = new Map<string, Set<string>>();

  for (const row of rows) {
    const projectId = row.projectId.trim();
    const textValue = (row.value ?? "").trim();
    if (!projectId || !textValue) {
      continue;
    }

    const current = suggestionSetByProject.get(projectId) ?? new Set<string>();
    current.add(textValue);
    suggestionSetByProject.set(projectId, current);
  }

  return Object.fromEntries(
    Array.from(suggestionSetByProject.entries()).map(([projectId, names]) => [
      projectId,
      Array.from(names).sort((a, b) => a.localeCompare(b, "id-ID")),
    ]),
  );
}

type CachedSupabaseExpenseDerivedData = {
  expenseCategories: ExpenseCategoryOption[];
  requesterSuggestionsByProject: Record<string, string[]>;
  descriptionSuggestionsByProject: Record<string, string[]>;
};

function buildSupabaseExpenseDerivedData(
  metadata: CachedSupabaseExpenseMetadata,
): CachedSupabaseExpenseDerivedData {
  const registeredOptions =
    Array.isArray(metadata.categoryRows)
      ? metadata.categoryRows
        .map((row) => {
          const value = toCategorySlug(String(row.slug ?? ""));
          if (!value) {
            return null;
          }
          const labelRaw = typeof row.label === "string" ? row.label.trim() : "";
          return {
            value,
            label: labelRaw || getCostCategoryLabel(value),
          };
        })
        .filter((row): row is ExpenseCategoryOption => Boolean(row))
      : [];

  const expenseValues: string[] = [];
  const requesterRows: ProjectTextSuggestionRow[] = [];
  const descriptionRows: ProjectTextSuggestionRow[] = [];

  for (const row of metadata.expenseRows) {
    const parsedCategory = toCategorySlug(String(row.category ?? ""));
    if (!parsedCategory || isHiddenCostCategory(parsedCategory)) {
      continue;
    }

    expenseValues.push(parsedCategory);

    const projectId = String(row.project_id ?? "");
    requesterRows.push({
      projectId,
      value: typeof row.requester_name === "string" ? row.requester_name : null,
    });
    descriptionRows.push({
      projectId,
      value: typeof row.description === "string" ? row.description : null,
    });
  }

  return {
    expenseCategories: mergeExpenseCategoryOptions(registeredOptions, expenseValues),
    requesterSuggestionsByProject: buildProjectTextSuggestionMap(requesterRows),
    descriptionSuggestionsByProject: buildProjectTextSuggestionMap(descriptionRows),
  };
}

const getCachedSupabaseExpenseDerivedData = unstable_cache(
  async (): Promise<CachedSupabaseExpenseDerivedData> =>
    buildSupabaseExpenseDerivedData(await getCachedSupabaseExpenseMetadata()),
  ["supabase-expense-derived-data"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.expenses, CACHE_TAGS.expenseCategories],
  },
);

export async function getRequesterSuggestionsByProject(): Promise<Record<string, string[]>> {
  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const rows = db.project_expenses
      .map((row) => mapExpense(row))
      .filter((row) => isVisibleExpense(row))
      .map((row) => ({
        projectId: row.projectId,
        value: row.requesterName,
      }));
    return buildProjectTextSuggestionMap(rows);
  }

  if (activeDataSource === "supabase") {
    const { requesterSuggestionsByProject } = await getCachedSupabaseExpenseDerivedData();
    return requesterSuggestionsByProject;
  }

  if (activeDataSource === "firebase") {
    const rows = (await getFirebaseCollectionRows("project_expenses"))
      .map((row) => mapExpense(row))
      .filter((row) => isVisibleExpense(row))
      .map((row) => ({
        projectId: row.projectId,
        value: row.requesterName,
      }));
    return buildProjectTextSuggestionMap(rows);
  }

  return buildProjectTextSuggestionMap(
    sampleExpenses
      .filter((row) => isVisibleExpense(row))
      .map((row) => ({
        projectId: row.projectId,
        value: row.requesterName,
      })),
  );
}

export async function getDescriptionSuggestionsByProject(): Promise<Record<string, string[]>> {
  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const rows = db.project_expenses
      .map((row) => mapExpense(row))
      .filter((row) => isVisibleExpense(row))
      .map((row) => ({
        projectId: row.projectId,
        value: row.description,
      }));
    return buildProjectTextSuggestionMap(rows);
  }

  if (activeDataSource === "supabase") {
    const { descriptionSuggestionsByProject } = await getCachedSupabaseExpenseDerivedData();
    return descriptionSuggestionsByProject;
  }

  if (activeDataSource === "firebase") {
    const rows = (await getFirebaseCollectionRows("project_expenses"))
      .map((row) => mapExpense(row))
      .filter((row) => isVisibleExpense(row))
      .map((row) => ({
        projectId: row.projectId,
        value: row.description,
      }));
    return buildProjectTextSuggestionMap(rows);
  }

  return buildProjectTextSuggestionMap(
    sampleExpenses
      .filter((row) => isVisibleExpense(row))
      .map((row) => ({
        projectId: row.projectId,
        value: row.description,
      })),
  );
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  if (!projectId) {
    return null;
  }

  if (activeDataSource === "supabase") {
    const row = await getCachedSupabaseProjectRowById(projectId);
    return row ? mapProject(row) : null;
  }

  const projects = await getProjects();
  return projects.find((project) => project.id === projectId) ?? null;
}

export async function getExpenseById(expenseId: string): Promise<ExpenseEntry | null> {
  if (!expenseId) {
    return null;
  }

  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const projectMap = Object.fromEntries(db.projects.map((project) => [project.id, project.name]));
    const row = db.project_expenses.find((item) => item.id === expenseId);
    if (!row) {
      return null;
    }
    return mapExpense(row, projectMap[row.project_id]);
  }

  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from("project_expenses")
      .select(
        "id, project_id, category, specialist_type, requester_name, description, recipient_name, quantity, unit_label, usage_info, unit_price, amount, expense_date, created_at, projects(name)",
      )
      .eq("id", expenseId)
      .maybeSingle();
    if (error || !data) {
      return null;
    }

    return mapExpense(data, resolveJoinName(data.projects));
  }

  if (activeDataSource === "firebase") {
    const row = await getFirebaseDocRow("project_expenses", expenseId);
    if (!row) {
      return null;
    }

    const projectId = typeof row.project_id === "string" ? row.project_id : "";
    const projectRow = projectId ? await getFirebaseDocRow("projects", projectId) : null;
    const projectName = projectRow?.name;
    return mapExpense(
      row,
      typeof projectName === "string" ? projectName : undefined,
    );
  }

  return sampleExpenses.find((item) => item.id === expenseId) ?? null;
}

export async function getAttendanceById(attendanceId: string): Promise<AttendanceRecord | null> {
  if (!attendanceId) {
    return null;
  }

  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const projectMap = Object.fromEntries(db.projects.map((project) => [project.id, project.name]));
    const row = db.attendance_records.find((item) => item.id === attendanceId);
    if (!row) {
      return null;
    }
    return mapAttendance(row, projectMap[row.project_id]);
  }

  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return null;
    }

    const attendanceResult = await withSupabaseSpecialistTeamNameFallback<
      Record<string, unknown> & { projects?: unknown }
    >(
      ({ omitSpecialistTeamName }) =>
        supabase
          .from("attendance_records")
          .select(
            getSupabaseAttendanceSelect({
              includeProjectName: true,
              omitSpecialistTeamName,
            }),
          )
          .eq("id", attendanceId)
          .maybeSingle(),
    );
    if (attendanceResult.error || !attendanceResult.data) {
      return null;
    }

    return mapAttendance(
      attendanceResult.data,
      resolveJoinName(attendanceResult.data.projects),
    );
  }

  if (activeDataSource === "firebase") {
    const row = await getFirebaseDocRow("attendance_records", attendanceId);
    if (!row) {
      return null;
    }

    const projectId = typeof row.project_id === "string" ? row.project_id : "";
    const projectRow = projectId ? await getFirebaseDocRow("projects", projectId) : null;
    const projectName = projectRow?.name;
    return mapAttendance(
      row,
      typeof projectName === "string" ? projectName : undefined,
    );
  }

  return sampleAttendance.find((item) => item.id === attendanceId) ?? null;
}

const getCachedSupabaseProjectDetail = unstable_cache(
  async (projectId: string): Promise<ProjectDetail | null> => {
    if (!projectId) {
      return null;
    }

    const [projectRow, expenseRows, categoryOptions] = await Promise.all([
      getCachedSupabaseProjectRowById(projectId),
      getCachedSupabaseProjectExpenseRows(projectId),
      getExpenseCategories(),
    ]);

    if (!projectRow) {
      return null;
    }

    if (expenseRows.length === 0) {
      return {
        project: mapProject(projectRow),
        expenses: [],
        categoryTotals: buildCategoryTotals([], categoryOptions),
      };
    }

    const projectName = String(projectRow.name ?? "");
    const expenses = expenseRows
      .map((row) => mapExpense(row, projectName))
      .filter((row) => isVisibleExpense(row));

    return {
      project: mapProject(projectRow),
      expenses,
      categoryTotals: buildCategoryTotals(expenses, categoryOptions),
    };
  },
  ["supabase-project-detail"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.projects, CACHE_TAGS.expenses, CACHE_TAGS.expenseCategories],
  },
);

export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  if (!projectId) {
    return null;
  }

  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const projectRow = db.projects.find((row) => row.id === projectId);
    if (!projectRow) {
      return null;
    }

    const project = mapProject(projectRow);
    const expenses = db.project_expenses
      .filter((row) => row.project_id === projectId)
      .map((row) => mapExpense(row, project.name))
      .filter((row) => isVisibleExpense(row))
      .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
    const categoryOptions = mergeExpenseCategoryOptions(db.project_expenses.map((row) => row.category));

    return {
      project,
      expenses,
      categoryTotals: buildCategoryTotals(expenses, categoryOptions),
    };
  }

  if (activeDataSource === "supabase") {
    return getCachedSupabaseProjectDetail(projectId);
  }

  if (activeDataSource === "firebase") {
    const projectRow = await getFirebaseDocRow("projects", projectId);
    if (!projectRow) {
      return null;
    }

    const project = mapProject(projectRow);
    const expenseRows = await getFirebaseCollectionRows("project_expenses");
    const expenses = expenseRows
      .filter((row) => String(row.project_id ?? "") === projectId)
      .map((row) => mapExpense(row, project.name))
      .filter((row) => isVisibleExpense(row))
      .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
    const categoryOptions = await getExpenseCategories();

    return {
      project,
      expenses,
      categoryTotals: buildCategoryTotals(expenses, categoryOptions),
    };
  }

  const project = sampleProjects.find((item) => item.id === projectId);
  if (!project) {
    return null;
  }

  const expenses = sampleExpenses
    .filter((item) => item.projectId === projectId)
    .slice()
    .filter((item) => isVisibleExpense(item))
    .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
  const categoryOptions = mergeExpenseCategoryOptions(sampleExpenses.map((item) => item.category));
  return {
    project,
    expenses,
    categoryTotals: buildCategoryTotals(expenses, categoryOptions),
  };
}

export async function getProjectReportDetail(projectId: string): Promise<{
  project: Project;
  expenses: ExpenseEntry[];
} | null> {
  if (!projectId) {
    return null;
  }

  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const projectRow = db.projects.find((row) => row.id === projectId);
    if (!projectRow) {
      return null;
    }

    const project = mapProject(projectRow);
    const expenses = db.project_expenses
      .filter((row) => row.project_id === projectId)
      .map((row) => mapExpense(row, project.name))
      .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
    return {
      project,
      expenses,
    };
  }

  if (activeDataSource === "supabase") {
    const [projectRow, expenseRows] = await Promise.all([
      getCachedSupabaseProjectRowById(projectId),
      getCachedSupabaseProjectExpenseRows(projectId),
    ]);
    if (!projectRow) {
      return null;
    }

    return {
      project: mapProject(projectRow),
      expenses: expenseRows.map((row) => mapExpense(row, String(projectRow.name ?? ""))),
    };
  }

  if (activeDataSource === "firebase") {
    const projectRow = await getFirebaseDocRow("projects", projectId);
    if (!projectRow) {
      return null;
    }

    const project = mapProject(projectRow);
    const expenseRows = await getFirebaseCollectionRows("project_expenses");
    return {
      project,
      expenses: expenseRows
        .filter((row) => String(row.project_id ?? "") === projectId)
        .map((row) => mapExpense(row, project.name))
        .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate)),
    };
  }

  const project = sampleProjects.find((item) => item.id === projectId);
  if (!project) {
    return null;
  }

  return {
    project,
    expenses: sampleExpenses
      .filter((item) => item.projectId === projectId)
      .slice()
      .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate)),
  };
}

function buildExpenseSearchHaystack(row: {
  requesterName?: string | null;
  description?: string | null;
  usageInfo?: string | null;
  recipientName?: string | null;
  category?: string | null;
  projectName?: string | null;
  amount?: number | null;
}) {
  const amountValue = Number(row.amount ?? 0);
  const normalizedAmount = Number.isFinite(amountValue) ? Math.round(Math.abs(amountValue)) : 0;
  const groupedAmount = normalizedAmount.toLocaleString("id-ID");
  return [
    row.description ?? "",
    row.usageInfo ?? "",
    row.requesterName ?? "",
    `pengaju ${row.requesterName ?? ""}`,
    `atas nama ${row.requesterName ?? ""}`,
    row.recipientName ?? "",
    `penerima ${row.recipientName ?? ""}`,
    `vendor ${row.recipientName ?? ""}`,
    row.projectName ?? "",
    `project ${row.projectName ?? ""}`,
    `proyek ${row.projectName ?? ""}`,
    row.category ? getCostCategoryLabel(row.category) : "",
    row.category ?? "",
    String(amountValue),
    String(normalizedAmount),
    groupedAmount,
    `rp ${groupedAmount}`,
    `rp${groupedAmount}`,
  ]
    .join(" ")
    .toLowerCase();
}

function toCompactSearchToken(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function getSearchDigits(value: string) {
  return value.replace(/\D/g, "");
}

function matchExpenseSearchQuery(
  row: {
    requesterName?: string | null;
    description?: string | null;
    usageInfo?: string | null;
    recipientName?: string | null;
    category?: string | null;
    projectName?: string | null;
    amount?: number | null;
  },
  normalizedQuery: string,
  queryDigits: string,
) {
  const haystack = buildExpenseSearchHaystack(row);
  if (haystack.includes(normalizedQuery)) {
    return true;
  }
  const queryTerms = normalizedQuery.split(" ").filter((item) => item.length > 0);
  if (queryTerms.length > 1 && queryTerms.every((term) => haystack.includes(term))) {
    return true;
  }
  const compactQuery = toCompactSearchToken(normalizedQuery);
  if (compactQuery) {
    const compactHaystack = toCompactSearchToken(haystack);
    if (compactHaystack.includes(compactQuery)) {
      return true;
    }
  }
  if (!queryDigits) {
    return false;
  }
  const amountDigits = getSearchDigits(String(Math.round(Math.abs(Number(row.amount ?? 0)))));
  return amountDigits.includes(queryDigits);
}

function mapExpenseSearchResult(row: ExpenseEntry, projectName: string): ProjectExpenseSearchResult {
  return {
    expenseId: row.id,
    projectId: row.projectId,
    projectName,
    expenseDate: row.expenseDate.slice(0, 10),
    requesterName: row.requesterName,
    description: row.description,
    usageInfo: row.usageInfo,
    category: row.category,
    amount: row.amount,
  };
}

function sortExpenseSearchResults(a: ProjectExpenseSearchResult, b: ProjectExpenseSearchResult) {
  if (a.expenseDate !== b.expenseDate) {
    return b.expenseDate.localeCompare(a.expenseDate);
  }
  if (a.projectName !== b.projectName) {
    return a.projectName.localeCompare(b.projectName);
  }
  return (a.description ?? "").localeCompare(b.description ?? "");
}

type ExpenseDetailSearchFilters = {
  from?: string;
  to?: string;
  year?: number;
};

type NormalizedExpenseDetailDateFilters = {
  from: string | null;
  to: string | null;
  hasFilter: boolean;
  isValid: boolean;
};

function isDateOnlyString(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function normalizeExpenseDetailDateFilters(
  filters: ExpenseDetailSearchFilters | undefined,
): NormalizedExpenseDetailDateFilters {
  const from = isDateOnlyString(filters?.from) ? String(filters?.from) : null;
  const to = isDateOnlyString(filters?.to) ? String(filters?.to) : null;
  const parsedYear = Number(filters?.year);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 9999 ? parsedYear : null;

  let effectiveFrom = from;
  let effectiveTo = to;

  if (year !== null) {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    if (!effectiveFrom || yearStart > effectiveFrom) {
      effectiveFrom = yearStart;
    }
    if (!effectiveTo || yearEnd < effectiveTo) {
      effectiveTo = yearEnd;
    }
  }

  const hasFilter = Boolean(effectiveFrom || effectiveTo || year !== null);
  const isValid = !effectiveFrom || !effectiveTo || effectiveFrom <= effectiveTo;

  return {
    from: effectiveFrom,
    to: effectiveTo,
    hasFilter,
    isValid,
  };
}

function matchesExpenseDetailDateFilter(
  expenseDate: string,
  filters: NormalizedExpenseDetailDateFilters,
) {
  const dateOnly = toDateOnly(expenseDate);
  if (filters.from && dateOnly < filters.from) {
    return false;
  }
  if (filters.to && dateOnly > filters.to) {
    return false;
  }
  return true;
}

export async function searchExpenseDetails(
  queryText: string,
  limit = 200,
  filters?: ExpenseDetailSearchFilters,
): Promise<ProjectExpenseSearchResult[]> {
  const normalizedQuery = queryText.trim().toLowerCase().replace(/\s+/g, " ");
  const dateFilters = normalizeExpenseDetailDateFilters(filters);
  if (!normalizedQuery && !dateFilters.hasFilter) {
    return [];
  }
  if (!dateFilters.isValid) {
    return [];
  }
  const queryDigits = normalizedQuery ? getSearchDigits(normalizedQuery) : "";

  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const projectMap = Object.fromEntries(db.projects.map((project) => [project.id, project.name]));
    return db.project_expenses
      .map((row) => mapExpense(row, projectMap[row.project_id]))
      .filter((row) => isVisibleExpense(row))
      .filter((row) => matchesExpenseDetailDateFilter(row.expenseDate, dateFilters))
      .filter((row) =>
        normalizedQuery ? matchExpenseSearchQuery(row, normalizedQuery, queryDigits) : true,
      )
      .map((row) => mapExpenseSearchResult(row, row.projectName?.trim() || "Project"))
      .sort(sortExpenseSearchResults)
      .slice(0, limit);
  }

  if (activeDataSource === "supabase") {
    const [projects, expenseRows] = await Promise.all([
      getCachedSupabaseProjects(),
      getCachedSupabaseAllExpenseRows(),
    ]);
    const projectNameMap = Object.fromEntries(
      projects.map((project) => [project.id, project.name] as const),
    );

    return expenseRows
      .map((row) => mapExpense(row, projectNameMap[String(row.project_id)]))
      .filter((row) => isVisibleExpense(row))
      .filter((row) => matchesExpenseDetailDateFilter(row.expenseDate, dateFilters))
      .filter((row) =>
        normalizedQuery ? matchExpenseSearchQuery(row, normalizedQuery, queryDigits) : true,
      )
      .map((row) => mapExpenseSearchResult(row, row.projectName?.trim() || "Project"))
      .sort(sortExpenseSearchResults)
      .slice(0, limit);
  }

  if (activeDataSource === "firebase") {
    const [projectRows, expenseRows] = await Promise.all([
      getFirebaseCollectionRows("projects"),
      getFirebaseCollectionRows("project_expenses"),
    ]);
    const projectMap = Object.fromEntries(
      projectRows.map((row) => [String(row.id ?? ""), String(row.name ?? "Project")]),
    );

    return expenseRows
      .map((row) => mapExpense(row, projectMap[String(row.project_id ?? "")]))
      .filter((row) => isVisibleExpense(row))
      .filter((row) => matchesExpenseDetailDateFilter(row.expenseDate, dateFilters))
      .filter((row) =>
        normalizedQuery ? matchExpenseSearchQuery(row, normalizedQuery, queryDigits) : true,
      )
      .map((row) => mapExpenseSearchResult(row, row.projectName?.trim() || "Project"))
      .sort(sortExpenseSearchResults)
      .slice(0, limit);
  }

  return sampleExpenses
    .filter((row) => isVisibleExpense(row))
    .filter((row) => matchesExpenseDetailDateFilter(row.expenseDate, dateFilters))
    .filter((row) => (normalizedQuery ? matchExpenseSearchQuery(row, normalizedQuery, queryDigits) : true))
    .map((row) => mapExpenseSearchResult(row, row.projectName?.trim() || "Project"))
    .sort(sortExpenseSearchResults)
    .slice(0, limit);
}

export async function getWageRecap(options?: {
  from?: string;
  to?: string;
  limit?: number;
  projectId?: string;
  teamType?: "tukang" | "laden" | "spesialis";
  specialistTeamName?: string;
  workerNames?: string[];
  attendanceIds?: string[];
  includePaid?: boolean;
  recapMode?: "gabung" | "per_project";
}): Promise<WageRecap> {
  const from = options?.from ?? getMonthStartDate();
  const to = options?.to ?? getTodayDate();
  const limit = options?.limit;
  const projectId = options?.projectId?.trim() || null;
  const teamType = options?.teamType ?? null;
  const specialistTeamName = options?.specialistTeamName?.trim().toLowerCase() || null;
  const normalizedWorkerNames =
    options?.workerNames
      ?.map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0) ?? [];
  const normalizedAttendanceIds = Array.from(
    new Set(
      options?.attendanceIds
        ?.map((item) => item.trim())
        .filter((item) => item.length > 0) ?? [],
    ),
  );
  const includePaid = options?.includePaid ?? false;
  const recapMode = options?.recapMode ?? "per_project";

  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const projectMap = Object.fromEntries(db.projects.map((project) => [project.id, project.name]));
    const payrollResets = db.payroll_resets.map((row) => ({
      projectId: String(row.project_id),
      teamType: row.team_type,
      specialistTeamName:
        typeof row.specialist_team_name === "string" ? row.specialist_team_name : null,
      workerName: typeof row.worker_name === "string" ? row.worker_name : null,
      paidUntilDate: String(row.paid_until_date ?? ""),
    }));

    let rows = applyPayrollResets(
      db.attendance_records
        .map((row) => mapAttendance(row, projectMap[row.project_id]))
        .filter((row) => toDateOnly(row.attendanceDate) >= from)
        .filter((row) => toDateOnly(row.attendanceDate) <= to)
        .filter((row) => (projectId ? row.projectId === projectId : true))
        .filter((row) => (teamType ? row.teamType === teamType : true))
        .filter((row) =>
          specialistTeamName
            ? (row.specialistTeamName ?? "").toLowerCase().includes(specialistTeamName)
            : true,
        )
        .filter((row) =>
          normalizedWorkerNames.length > 0
            ? normalizedWorkerNames.includes(row.workerName.trim().toLowerCase())
            : true,
        )
        .filter((row) =>
          normalizedAttendanceIds.length > 0
            ? normalizedAttendanceIds.includes(row.id)
            : true,
        ),
      payrollResets,
      includePaid,
    ).sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));

    if (typeof limit === "number") {
      rows = rows.slice(0, limit);
    }

    const projectSummaries = buildWageSummary(rows);
    const teamSummaries = buildWageTeamSummary(rows);
    const projectTeamSummaries = buildWageProjectTeamSummary(rows);
    const workerSummaries = buildWageWorkerSummary(rows, recapMode);
    return {
      from,
      to,
      recapMode,
      rows,
      projectSummaries,
      teamSummaries,
      projectTeamSummaries,
      workerSummaries,
      totalDailyWage: rows.reduce((sum, row) => sum + getAttendanceTotalWage(row), 0),
      totalOvertimePay: rows.reduce((sum, row) => sum + getAttendanceOvertimePay(row), 0),
      totalKasbon: rows.reduce((sum, row) => sum + row.kasbonAmount, 0),
      totalReimburse: rows.reduce((sum, row) => sum + row.reimburseAmount, 0),
      totalNetPay: rows.reduce((sum, row) => sum + row.netPay, 0),
    };
  }

  if (activeDataSource === "supabase") {
    const [projects, attendanceRowsRaw, payrollResetRowsRaw] = await Promise.all([
      getCachedSupabaseProjects(),
      getCachedSupabaseAllAttendanceRows(),
      getCachedSupabasePayrollResetRows(),
    ]);
    const projectNameMap = Object.fromEntries(
      projects.map((project) => [project.id, project.name] as const),
    );

    const payrollResets = payrollResetRowsRaw
      .map((row) => mapPayrollResetRow(row))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => (projectId ? row.projectId === projectId : true))
      .filter((row) => (teamType ? row.teamType === teamType : true))
      .filter((row) =>
        specialistTeamName
          ? (row.specialistTeamName ?? "").toLowerCase().includes(specialistTeamName)
          : true,
      )
      .filter((row) =>
        normalizedWorkerNames.length > 0
          ? normalizedWorkerNames.includes((row.workerName ?? "").trim().toLowerCase())
          : true,
      );

    let rows = applyPayrollResets(
      attendanceRowsRaw
        .map((row) => mapAttendance(row, projectNameMap[String(row.project_id ?? "")]))
        .filter((row) => toDateOnly(row.attendanceDate) >= from)
        .filter((row) => toDateOnly(row.attendanceDate) <= to)
        .filter((row) => (projectId ? row.projectId === projectId : true))
        .filter((row) => (teamType ? row.teamType === teamType : true))
        .filter((row) =>
          specialistTeamName
            ? (row.specialistTeamName ?? "").toLowerCase().includes(specialistTeamName)
            : true,
        )
        .filter((row) =>
          normalizedWorkerNames.length > 0
            ? normalizedWorkerNames.includes(row.workerName.trim().toLowerCase())
            : true,
        )
        .filter((row) =>
          normalizedAttendanceIds.length > 0
            ? normalizedAttendanceIds.includes(row.id)
            : true,
        ),
      payrollResets,
      includePaid,
    );

    rows = rows.sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));
    if (typeof limit === "number") {
      rows = rows.slice(0, limit);
    }

    const projectSummaries = buildWageSummary(rows);
    const teamSummaries = buildWageTeamSummary(rows);
    const projectTeamSummaries = buildWageProjectTeamSummary(rows);
    const workerSummaries = buildWageWorkerSummary(rows, recapMode);

    return {
      from,
      to,
      recapMode,
      rows,
      projectSummaries,
      teamSummaries,
      projectTeamSummaries,
      workerSummaries,
      totalDailyWage: rows.reduce((sum, row) => sum + getAttendanceTotalWage(row), 0),
      totalOvertimePay: rows.reduce((sum, row) => sum + getAttendanceOvertimePay(row), 0),
      totalKasbon: rows.reduce((sum, row) => sum + row.kasbonAmount, 0),
      totalReimburse: rows.reduce((sum, row) => sum + row.reimburseAmount, 0),
      totalNetPay: rows.reduce((sum, row) => sum + row.netPay, 0),
    };
  }

  if (activeDataSource === "firebase") {
    const [attendanceRowsRaw, payrollResetRowsRaw, projectRowsRaw] = await Promise.all([
      getFirebaseCollectionRows("attendance_records"),
      getFirebaseCollectionRows("payroll_resets"),
      getFirebaseCollectionRows("projects"),
    ]);

    const projectMap = Object.fromEntries(
      projectRowsRaw.map((row) => [String(row.id ?? ""), String(row.name ?? "Project")]),
    );
    const payrollResets = payrollResetRowsRaw
      .map((row) => {
        const teamTypeValue = String(row.team_type ?? "");
        if (
          teamTypeValue !== "tukang" &&
          teamTypeValue !== "laden" &&
          teamTypeValue !== "spesialis"
        ) {
          return null;
        }
        return {
          projectId: String(row.project_id ?? ""),
          teamType: teamTypeValue as "tukang" | "laden" | "spesialis",
          specialistTeamName:
            typeof row.specialist_team_name === "string" ? row.specialist_team_name : null,
          workerName: typeof row.worker_name === "string" ? row.worker_name : null,
          paidUntilDate: String(row.paid_until_date ?? ""),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    let rows = applyPayrollResets(
      attendanceRowsRaw
        .map((row) => mapAttendance(row, projectMap[String(row.project_id ?? "")]))
        .filter((row) => toDateOnly(row.attendanceDate) >= from)
        .filter((row) => toDateOnly(row.attendanceDate) <= to)
        .filter((row) => (projectId ? row.projectId === projectId : true))
        .filter((row) => (teamType ? row.teamType === teamType : true))
        .filter((row) =>
          specialistTeamName
            ? (row.specialistTeamName ?? "").toLowerCase().includes(specialistTeamName)
            : true,
        )
        .filter((row) =>
          normalizedWorkerNames.length > 0
            ? normalizedWorkerNames.includes(row.workerName.trim().toLowerCase())
            : true,
        )
        .filter((row) =>
          normalizedAttendanceIds.length > 0
            ? normalizedAttendanceIds.includes(row.id)
            : true,
        ),
      payrollResets,
      includePaid,
    ).sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));

    if (typeof limit === "number") {
      rows = rows.slice(0, limit);
    }

    const projectSummaries = buildWageSummary(rows);
    const teamSummaries = buildWageTeamSummary(rows);
    const projectTeamSummaries = buildWageProjectTeamSummary(rows);
    const workerSummaries = buildWageWorkerSummary(rows, recapMode);

    return {
      from,
      to,
      recapMode,
      rows,
      projectSummaries,
      teamSummaries,
      projectTeamSummaries,
      workerSummaries,
      totalDailyWage: rows.reduce((sum, row) => sum + getAttendanceTotalWage(row), 0),
      totalOvertimePay: rows.reduce((sum, row) => sum + getAttendanceOvertimePay(row), 0),
      totalKasbon: rows.reduce((sum, row) => sum + row.kasbonAmount, 0),
      totalReimburse: rows.reduce((sum, row) => sum + row.reimburseAmount, 0),
      totalNetPay: rows.reduce((sum, row) => sum + row.netPay, 0),
    };
  }

  let rows = applyPayrollResets(
    sampleAttendance
      .filter((item) => toDateOnly(item.attendanceDate) >= from)
      .filter((item) => toDateOnly(item.attendanceDate) <= to)
      .filter((row) => (projectId ? row.projectId === projectId : true))
      .filter((row) => (teamType ? row.teamType === teamType : true))
      .filter((row) =>
        specialistTeamName
          ? (row.specialistTeamName ?? "").toLowerCase().includes(specialistTeamName)
          : true,
      )
      .filter((row) =>
        normalizedWorkerNames.length > 0
          ? normalizedWorkerNames.includes(row.workerName.trim().toLowerCase())
          : true,
      )
      .filter((row) =>
        normalizedAttendanceIds.length > 0
          ? normalizedAttendanceIds.includes(row.id)
          : true,
      ),
    samplePayrollResets,
    includePaid,
  ).sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));

  if (typeof limit === "number") {
    rows = rows.slice(0, limit);
  }

  const projectSummaries = buildWageSummary(rows);
  const teamSummaries = buildWageTeamSummary(rows);
  const projectTeamSummaries = buildWageProjectTeamSummary(rows);
  const workerSummaries = buildWageWorkerSummary(rows, recapMode);
  return {
    from,
    to,
    recapMode,
    rows,
    projectSummaries,
    teamSummaries,
    projectTeamSummaries,
    workerSummaries,
    totalDailyWage: rows.reduce((sum, row) => sum + getAttendanceTotalWage(row), 0),
    totalOvertimePay: rows.reduce((sum, row) => sum + getAttendanceOvertimePay(row), 0),
    totalKasbon: rows.reduce((sum, row) => sum + row.kasbonAmount, 0),
    totalReimburse: rows.reduce((sum, row) => sum + row.reimburseAmount, 0),
    totalNetPay: rows.reduce((sum, row) => sum + row.netPay, 0),
  };
}

export async function getAttendanceFeed(limit = 20): Promise<AttendanceRecord[]> {
  const recap = await getWageRecap({
    from: "1900-01-01",
    to: "2999-12-31",
    limit,
  });
  return recap.rows;
}

function buildDashboardDataFromCollections(input: {
  projects: Project[];
  expenses: ExpenseEntry[];
  attendance: AttendanceRecord[];
  categoryOptions?: ExpenseCategoryOption[];
  recentExpenses?: ExpenseEntry[];
}): DashboardData {
  const monthKey = new Date().toISOString().slice(0, 7);
  const visibleExpenses = filterVisibleExpenses(input.expenses);
  const mergedCategoryOptions =
    input.categoryOptions && input.categoryOptions.length > 0
      ? input.categoryOptions
      : mergeExpenseCategoryOptions(visibleExpenses.map((item) => item.category));
  const projectStatusTotals = buildProjectStatusTotals(input.projects);
  const statusTotalsByKey = new Map(projectStatusTotals.map((item) => [item.status, item.total] as const));
  const recentExpenses = (input.recentExpenses ?? visibleExpenses)
    .slice()
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
    .slice(0, 8);

  return {
    totalProjects: input.projects.length,
    activeProjects: statusTotalsByKey.get("aktif") ?? 0,
    completedProjects: statusTotalsByKey.get("selesai") ?? 0,
    delayedProjects: statusTotalsByKey.get("tertunda") ?? 0,
    activeWorkers: buildActiveWorkerCount(input.attendance),
    totalExpense: visibleExpenses.reduce((sum, item) => sum + item.amount, 0),
    monthExpense: visibleExpenses
      .filter((item) => item.expenseDate.startsWith(monthKey))
      .reduce((sum, item) => sum + item.amount, 0),
    totalKasbon: input.attendance.reduce((sum, item) => sum + item.kasbonAmount, 0),
    categoryTotals: buildCategoryTotals(visibleExpenses, mergedCategoryOptions),
    categoryTotalsByClient: buildCategoryTotalsByClient(
      visibleExpenses,
      input.projects,
      mergedCategoryOptions,
    ),
    recentExpenses,
    projectExpenseTotals: buildProjectExpenseTotals(visibleExpenses, input.projects),
    projectCountByClient: buildProjectCountByClient(input.projects),
    projectStatusTotals,
    attendanceTrend: buildAttendanceTrend(input.attendance),
    expenseTrend: buildExpenseTrend(visibleExpenses),
  };
}

const getCachedSupabaseDashboardData = unstable_cache(
  async (): Promise<DashboardData> => {
    const [projects, expenseRows, attendanceRows, categoryOptions] = await Promise.all([
      getCachedSupabaseProjects(),
      getCachedSupabaseAllExpenseRows(),
      getCachedSupabaseAllAttendanceRows(),
      getExpenseCategories(),
    ]);

    const projectNameMap = Object.fromEntries(
      projects.map((project) => [project.id, project.name] as const),
    );
    const expenses = expenseRows.map((row) => mapExpense(row, projectNameMap[String(row.project_id)]));
    const attendance = attendanceRows.map((row) => mapAttendance(row));

    return buildDashboardDataFromCollections({
      projects,
      expenses,
      attendance,
      categoryOptions,
    });
  },
  ["supabase-dashboard-data"],
  {
    revalidate: SUPABASE_CACHE_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.projects, CACHE_TAGS.expenses, CACHE_TAGS.expenseCategories, CACHE_TAGS.attendance],
  },
);

export async function getDashboardData(): Promise<DashboardData> {
  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const projectMap = Object.fromEntries(db.projects.map((project) => [project.id, project.name]));
    const expenses = db.project_expenses.map((row) => mapExpense(row, projectMap[row.project_id]));
    const attendance = db.attendance_records.map((row) => mapAttendance(row));
    const projects = db.projects.map((row) => mapProject(row));

    return buildDashboardDataFromCollections({
      projects,
      expenses,
      attendance,
      categoryOptions: mergeExpenseCategoryOptions(db.project_expenses.map((row) => row.category)),
    });
  }

  if (activeDataSource === "supabase") {
    return getCachedSupabaseDashboardData();
  }

  if (activeDataSource === "firebase") {
    const [projectRows, expenseRows, attendanceRows] = await Promise.all([
      getFirebaseCollectionRows("projects"),
      getFirebaseCollectionRows("project_expenses"),
      getFirebaseCollectionRows("attendance_records"),
    ]);

    const projectNameMap = Object.fromEntries(
      projectRows.map((row) => [String(row.id ?? ""), String(row.name ?? "Project")]),
    );
    const expenses = expenseRows.map((row) => mapExpense(row, projectNameMap[String(row.project_id ?? "")]));
    const attendance = attendanceRows.map((row) => mapAttendance(row));
    const projects = projectRows.map((row) => mapProject(row));

    return buildDashboardDataFromCollections({
      projects,
      expenses,
      attendance,
      categoryOptions: mergeExpenseCategoryOptions(expenseRows.map((row) => String(row.category ?? ""))),
    });
  }

  return buildDashboardDataFromCollections({
    projects: sampleProjects,
    expenses: sampleExpenses,
    attendance: sampleAttendance,
    categoryOptions: mergeExpenseCategoryOptions(sampleExpenses.map((item) => item.category)),
  });
}
