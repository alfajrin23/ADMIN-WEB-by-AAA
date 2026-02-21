import {
  COST_CATEGORIES,
  type ExpenseCategoryOption,
  getCostCategoryLabel,
  mergeExpenseCategoryOptions,
  toCategorySlug,
  WORKER_TEAMS,
  WORKER_TEAM_LABEL,
} from "@/lib/constants";
import { readExcelDatabase } from "@/lib/excel-db";
import { getFirestoreServerClient } from "@/lib/firebase";
import { activeDataSource } from "@/lib/storage";
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  AttendanceRecord,
  CategoryTotal,
  DashboardData,
  ExpenseEntry,
  Project,
  ProjectDetail,
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
    kasbonAmount: 150000,
    reimburseType: null,
    reimburseAmount: 0,
    netPay: 100000,
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

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
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

function buildCategoryTotals(
  expenses: ExpenseEntry[],
  categoryOptions?: ExpenseCategoryOption[],
): CategoryTotal[] {
  const totalsByCategory = new Map<string, number>();
  for (const expense of expenses) {
    const category = toCategorySlug(expense.category);
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
    const clientName = project.clientName?.trim() || "Tanpa Klien";
    const key = clientName.toLowerCase();
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

function buildProjectExpenseTotals(expenses: ExpenseEntry[]) {
  const totals: Record<
    string,
    {
      projectId: string;
      projectName: string;
      transactionCount: number;
      totalExpense: number;
    }
  > = {};

  for (const expense of expenses) {
    const key = expense.projectId || "unknown-project";
    if (!totals[key]) {
      totals[key] = {
        projectId: expense.projectId || "",
        projectName: expense.projectName?.trim() || "Project",
        transactionCount: 0,
        totalExpense: 0,
      };
    }

    totals[key].transactionCount += 1;
    totals[key].totalExpense += expense.amount;
  }

  return Object.values(totals).sort((a, b) => {
    if (b.totalExpense !== a.totalExpense) {
      return b.totalExpense - a.totalExpense;
    }
    return a.projectName.localeCompare(b.projectName);
  });
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
  const mappedRows = rows.map((row) => {
    const latestPaidUntil = getLatestPaidUntil(row, resets);
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

function mapAttendance(row: Record<string, unknown>, projectName?: string): AttendanceRecord {
  const rawWage = Number(row.daily_wage ?? 0);
  const rawKasbon = Number(row.kasbon_amount ?? 0);
  const rawReimburse = Number(row.reimburse_amount ?? 0);
  const workDays = resolveWorkDays(row.work_days);
  const dailyWage = Number.isFinite(rawWage) ? rawWage : 0;
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
  const netPay = Math.max(totalWage - kasbonAmount + reimburseAmount, 0);

  return {
    id: String(row.id ?? ""),
    projectId: String(row.project_id ?? ""),
    projectName,
    workerName: String(row.worker_name ?? ""),
    teamType: WORKER_TEAMS.some((item) => item.value === row.team_type)
      ? (row.team_type as AttendanceRecord["teamType"])
      : "tukang",
    specialistTeamName:
      typeof row.specialist_team_name === "string" ? row.specialist_team_name : null,
    status,
    workDays,
    dailyWage,
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

export async function getProjects(): Promise<Project[]> {
  if (activeDataSource === "excel") {
    return getExcelProjectsMapped();
  }

  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return [];
    }

    const { data, error } = await supabase
      .from("projects")
      .select("id, name, code, client_name, start_date, status, created_at")
      .order("created_at", { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => mapProject(row));
  }

  if (activeDataSource === "firebase") {
    const rows = await getFirebaseCollectionRows("projects");
    return rows
      .map((row) => mapProject(row))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return sampleProjects;
}

export async function getExpenseCategories(): Promise<ExpenseCategoryOption[]> {
  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    return mergeExpenseCategoryOptions(db.project_expenses.map((row) => row.category));
  }

  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return mergeExpenseCategoryOptions();
    }

    const [{ data: categoryRows, error: categoryError }, { data: expenseRows }] = await Promise.all([
      supabase.from("expense_categories").select("slug, label").order("created_at", { ascending: true }),
      supabase.from("project_expenses").select("category"),
    ]);

    const registeredOptions =
      !categoryError && Array.isArray(categoryRows)
        ? categoryRows
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
    const expenseValues = (expenseRows ?? [])
      .map((row) => toCategorySlug(String(row.category ?? "")))
      .filter((value) => value.length > 0);

    return mergeExpenseCategoryOptions(registeredOptions, expenseValues);
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

export async function getProjectById(projectId: string): Promise<Project | null> {
  if (!projectId) {
    return null;
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

    const { data, error } = await supabase
      .from("attendance_records")
      .select(
        "id, project_id, worker_name, team_type, specialist_team_name, status, work_days, daily_wage, kasbon_amount, reimburse_type, reimburse_amount, attendance_date, notes, created_at, projects(name)",
      )
      .eq("id", attendanceId)
      .maybeSingle();
    if (error || !data) {
      return null;
    }

    return mapAttendance(data, resolveJoinName(data.projects));
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
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
    const categoryOptions = mergeExpenseCategoryOptions(db.project_expenses.map((row) => row.category));

    return {
      project,
      expenses,
      categoryTotals: buildCategoryTotals(expenses, categoryOptions),
    };
  }

  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return null;
    }

    const [{ data: projectRow, error: projectError }, { data: expenseRows, error: expenseError }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("id, name, code, client_name, start_date, status, created_at")
          .eq("id", projectId)
          .maybeSingle(),
        supabase
          .from("project_expenses")
          .select(
            "id, project_id, category, specialist_type, requester_name, description, recipient_name, quantity, unit_label, usage_info, unit_price, amount, expense_date, created_at",
          )
          .eq("project_id", projectId)
          .order("expense_date", { ascending: false }),
      ]);

    if (projectError || !projectRow) {
      return null;
    }

    if (expenseError || !expenseRows) {
      const categoryOptions = await getExpenseCategories();
      return {
        project: mapProject(projectRow),
        expenses: [],
        categoryTotals: buildCategoryTotals([], categoryOptions),
      };
    }

    const expenses = expenseRows.map((row) => mapExpense(row, String(projectRow.name ?? "")));
    const categoryOptions = await getExpenseCategories();
    return {
      project: mapProject(projectRow),
      expenses,
      categoryTotals: buildCategoryTotals(expenses, categoryOptions),
    };
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
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
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

  const expenses = sampleExpenses.filter((item) => item.projectId === projectId);
  const categoryOptions = mergeExpenseCategoryOptions(sampleExpenses.map((item) => item.category));
  return {
    project,
    expenses,
    categoryTotals: buildCategoryTotals(expenses, categoryOptions),
  };
}

export async function getWageRecap(options?: {
  from?: string;
  to?: string;
  limit?: number;
  projectId?: string;
  teamType?: "tukang" | "laden" | "spesialis";
  specialistTeamName?: string;
  workerNames?: string[];
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
      totalKasbon: rows.reduce((sum, row) => sum + row.kasbonAmount, 0),
      totalReimburse: rows.reduce((sum, row) => sum + row.reimburseAmount, 0),
      totalNetPay: rows.reduce((sum, row) => sum + row.netPay, 0),
    };
  }

  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return {
        from,
        to,
        recapMode,
        rows: [],
        projectSummaries: [],
        teamSummaries: [],
        projectTeamSummaries: [],
        workerSummaries: [],
        totalDailyWage: 0,
        totalKasbon: 0,
        totalReimburse: 0,
        totalNetPay: 0,
      };
    }

    let query = supabase
      .from("attendance_records")
      .select(
        "id, project_id, worker_name, team_type, specialist_team_name, status, work_days, daily_wage, kasbon_amount, reimburse_type, reimburse_amount, attendance_date, notes, created_at, projects(name)",
      )
      .gte("attendance_date", from)
      .lte("attendance_date", to)
      .order("attendance_date", { ascending: false });

    if (typeof limit === "number") {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error || !data) {
      return {
        from,
        to,
        recapMode,
        rows: [],
        projectSummaries: [],
        teamSummaries: [],
        projectTeamSummaries: [],
        workerSummaries: [],
        totalDailyWage: 0,
        totalKasbon: 0,
        totalReimburse: 0,
        totalNetPay: 0,
      };
    }

    const { data: resetRows } = await supabase
      .from("payroll_resets")
      .select("project_id, team_type, specialist_team_name, worker_name, paid_until_date");

    const payrollResets = Array.isArray(resetRows)
      ? resetRows
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
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
      : [];

    const rows = applyPayrollResets(
      data
        .map((row) => mapAttendance(row, resolveJoinName(row.projects)))
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
        ),
      payrollResets,
      includePaid,
    );
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

export async function getDashboardData(): Promise<DashboardData> {
  if (activeDataSource === "excel") {
    const db = readExcelDatabase();
    const projectMap = Object.fromEntries(db.projects.map((project) => [project.id, project.name]));
    const expenses = db.project_expenses.map((row) => mapExpense(row, projectMap[row.project_id]));
    const attendance = db.attendance_records.map((row) => mapAttendance(row));
    const monthKey = new Date().toISOString().slice(0, 7);
    const projects = db.projects.map((row) => mapProject(row));

    return {
      totalProjects: db.projects.length,
      totalExpense: expenses.reduce((sum, item) => sum + item.amount, 0),
      monthExpense: expenses
        .filter((item) => item.expenseDate.startsWith(monthKey))
        .reduce((sum, item) => sum + item.amount, 0),
      totalKasbon: attendance.reduce((sum, item) => sum + item.kasbonAmount, 0),
      categoryTotals: buildCategoryTotals(
        expenses,
        mergeExpenseCategoryOptions(db.project_expenses.map((row) => row.category)),
      ),
      recentExpenses: expenses
        .slice()
        .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
        .slice(0, 8),
      projectExpenseTotals: buildProjectExpenseTotals(expenses),
      projectCountByClient: buildProjectCountByClient(projects),
    };
  }

  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return {
        totalProjects: 0,
        totalExpense: 0,
        monthExpense: 0,
        totalKasbon: 0,
        categoryTotals: buildCategoryTotals([]),
        recentExpenses: [],
        projectExpenseTotals: [],
        projectCountByClient: [],
      };
    }

    const [{ data: projectRows }, { data: expenseRows }, { data: attendanceRows }, { data: recentRows }, categoryOptions] =
      await Promise.all([
        supabase.from("projects").select("id, name, code, client_name, start_date, status, created_at"),
        supabase
          .from("project_expenses")
          .select(
            "id, project_id, category, specialist_type, requester_name, description, recipient_name, quantity, unit_label, usage_info, unit_price, amount, expense_date, created_at",
          ),
        supabase
          .from("attendance_records")
          .select(
            "id, project_id, worker_name, team_type, specialist_team_name, status, work_days, daily_wage, kasbon_amount, reimburse_type, reimburse_amount, attendance_date, notes, created_at",
          ),
        supabase
          .from("project_expenses")
          .select(
            "id, project_id, category, specialist_type, requester_name, description, recipient_name, quantity, unit_label, usage_info, unit_price, amount, expense_date, created_at, projects(name)",
          )
          .order("expense_date", { ascending: false })
          .limit(8),
        getExpenseCategories(),
      ]);

    const projectNameMap = Object.fromEntries(
      (projectRows ?? []).map((row) => [String(row.id), String(row.name ?? "Project")]),
    );
    const expenses = (expenseRows ?? []).map((row) =>
      mapExpense(row, projectNameMap[String(row.project_id)]),
    );
    const attendance = (attendanceRows ?? []).map((row) => mapAttendance(row));
    const recentExpenses = (recentRows ?? []).map((row) =>
      mapExpense(row, resolveJoinName(row.projects)),
    );
    const projects = (projectRows ?? []).map((row) => mapProject(row));
    const monthKey = new Date().toISOString().slice(0, 7);

    return {
      totalProjects: projects.length,
      totalExpense: expenses.reduce((sum, item) => sum + item.amount, 0),
      monthExpense: expenses
        .filter((item) => item.expenseDate.startsWith(monthKey))
        .reduce((sum, item) => sum + item.amount, 0),
      totalKasbon: attendance.reduce((sum, item) => sum + item.kasbonAmount, 0),
      categoryTotals: buildCategoryTotals(expenses, categoryOptions),
      recentExpenses,
      projectExpenseTotals: buildProjectExpenseTotals(expenses),
      projectCountByClient: buildProjectCountByClient(projects),
    };
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
    const expenses = expenseRows.map((row) =>
      mapExpense(row, projectNameMap[String(row.project_id ?? "")]),
    );
    const attendance = attendanceRows.map((row) => mapAttendance(row));
    const projects = projectRows.map((row) => mapProject(row));
    const recentExpenses = expenses
      .slice()
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
      .slice(0, 8);
    const monthKey = new Date().toISOString().slice(0, 7);

    return {
      totalProjects: projects.length,
      totalExpense: expenses.reduce((sum, item) => sum + item.amount, 0),
      monthExpense: expenses
        .filter((item) => item.expenseDate.startsWith(monthKey))
        .reduce((sum, item) => sum + item.amount, 0),
      totalKasbon: attendance.reduce((sum, item) => sum + item.kasbonAmount, 0),
      categoryTotals: buildCategoryTotals(
        expenses,
        mergeExpenseCategoryOptions(expenseRows.map((row) => String(row.category ?? ""))),
      ),
      recentExpenses,
      projectExpenseTotals: buildProjectExpenseTotals(expenses),
      projectCountByClient: buildProjectCountByClient(projects),
    };
  }

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthExpense = sampleExpenses
    .filter((item) => item.expenseDate.startsWith(thisMonth))
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    totalProjects: sampleProjects.length,
    totalExpense: sampleExpenses.reduce((sum, item) => sum + item.amount, 0),
    monthExpense,
    totalKasbon: sampleAttendance.reduce((sum, item) => sum + item.kasbonAmount, 0),
    categoryTotals: buildCategoryTotals(
      sampleExpenses,
      mergeExpenseCategoryOptions(sampleExpenses.map((item) => item.category)),
    ),
    recentExpenses: sampleExpenses,
    projectExpenseTotals: buildProjectExpenseTotals(sampleExpenses),
    projectCountByClient: buildProjectCountByClient(sampleProjects),
  };
}
