import { COST_CATEGORIES, WORKER_TEAMS, WORKER_TEAM_LABEL } from "@/lib/constants";
import { readExcelDatabase } from "@/lib/excel-db";
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
    dailyWage: 250000,
    kasbonAmount: 150000,
    reimburseType: null,
    reimburseAmount: 0,
    netPay: 100000,
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
    dailyWage: 230000,
    kasbonAmount: 50000,
    reimburseType: null,
    reimburseAmount: 0,
    netPay: 180000,
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
    dailyWage: 0,
    kasbonAmount: 0,
    reimburseType: null,
    reimburseAmount: 0,
    netPay: 0,
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

function buildCategoryTotals(expenses: ExpenseEntry[]): CategoryTotal[] {
  return COST_CATEGORIES.map((category) => ({
    category: category.value,
    total: expenses
      .filter((expense) => expense.category === category.value)
      .reduce((sum, expense) => sum + expense.amount, 0),
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
    projectTotal.totalDailyWage += row.dailyWage;
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
    summary.totalDailyWage += row.dailyWage;
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
    summary.totalDailyWage += row.dailyWage;
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
      };
    }

    const summary = totals[key];
    if (row.status === "hadir") {
      summary.workDays += 1;
    }
    summary.totalDailyWage += row.dailyWage;
    summary.totalKasbon += row.kasbonAmount;
    summary.totalNetPay += row.netPay;
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

function applyPayrollResets(
  rows: AttendanceRecord[],
  resets: Array<{
    projectId: string;
    teamType: "tukang" | "laden" | "spesialis";
    specialistTeamName: string | null;
    workerName: string | null;
    paidUntilDate: string;
  }>,
) {
  return rows.filter((row) => {
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

    return !latestPaidUntil || toDateOnly(row.attendanceDate) > latestPaidUntil;
  });
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
  return {
    id: String(row.id ?? ""),
    projectId: String(row.project_id ?? ""),
    projectName,
    category:
      row.category === "material" ||
      row.category === "upah_kasbon_tukang" ||
      row.category === "upah_staff_pelaksana" ||
      row.category === "upah_tim_spesialis" ||
      row.category === "alat" ||
      row.category === "operasional"
        ? row.category
        : "operasional",
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
  const dailyWage = Number.isFinite(rawWage) ? rawWage : 0;
  const kasbonAmount = Number.isFinite(rawKasbon) ? rawKasbon : 0;
  const reimburseAmount = Number.isFinite(rawReimburse) ? rawReimburse : 0;
  const reimburseType =
    row.reimburse_type === "material" || row.reimburse_type === "kekurangan_dana"
      ? row.reimburse_type
      : null;
  const netPay = Math.max(dailyWage - kasbonAmount + reimburseAmount, 0);

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
    status:
      row.status === "hadir" ||
      row.status === "izin" ||
      row.status === "sakit" ||
      row.status === "alpa"
        ? row.status
        : "hadir",
    dailyWage,
    kasbonAmount,
    reimburseType,
    reimburseAmount,
    netPay,
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

  return sampleProjects;
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
        "id, project_id, category, description, recipient_name, amount, expense_date, created_at, projects(name)",
      )
      .eq("id", expenseId)
      .maybeSingle();
    if (error || !data) {
      return null;
    }

    return mapExpense(data, resolveJoinName(data.projects));
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
        "id, project_id, worker_name, status, daily_wage, kasbon_amount, attendance_date, notes, created_at, projects(name)",
      )
      .eq("id", attendanceId)
      .maybeSingle();
    if (error || !data) {
      return null;
    }

    return mapAttendance(data, resolveJoinName(data.projects));
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

    return {
      project,
      expenses,
      categoryTotals: buildCategoryTotals(expenses),
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
            "id, project_id, category, description, recipient_name, amount, expense_date, created_at",
          )
          .eq("project_id", projectId)
          .order("expense_date", { ascending: false }),
      ]);

    if (projectError || !projectRow) {
      return null;
    }

    if (expenseError || !expenseRows) {
      return {
        project: mapProject(projectRow),
        expenses: [],
        categoryTotals: buildCategoryTotals([]),
      };
    }

    const expenses = expenseRows.map((row) => mapExpense(row, String(projectRow.name ?? "")));
    return {
      project: mapProject(projectRow),
      expenses,
      categoryTotals: buildCategoryTotals(expenses),
    };
  }

  const project = sampleProjects.find((item) => item.id === projectId);
  if (!project) {
    return null;
  }

  const expenses = sampleExpenses.filter((item) => item.projectId === projectId);
  return {
    project,
    expenses,
    categoryTotals: buildCategoryTotals(expenses),
  };
}

export async function getWageRecap(options?: {
  from?: string;
  to?: string;
  limit?: number;
  projectId?: string;
  teamType?: "tukang" | "laden" | "spesialis";
  specialistTeamName?: string;
  recapMode?: "gabung" | "per_project";
}): Promise<WageRecap> {
  const from = options?.from ?? getMonthStartDate();
  const to = options?.to ?? getTodayDate();
  const limit = options?.limit;
  const projectId = options?.projectId?.trim() || null;
  const teamType = options?.teamType ?? null;
  const specialistTeamName = options?.specialistTeamName?.trim().toLowerCase() || null;
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
      ),
      payrollResets,
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
      totalDailyWage: rows.reduce((sum, row) => sum + row.dailyWage, 0),
      totalKasbon: rows.reduce((sum, row) => sum + row.kasbonAmount, 0),
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
        totalNetPay: 0,
      };
    }

    let query = supabase
      .from("attendance_records")
      .select(
        "id, project_id, worker_name, status, daily_wage, kasbon_amount, attendance_date, notes, created_at, projects(name)",
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
        totalNetPay: 0,
      };
    }

    const rows = applyPayrollResets(
      data
      .map((row) => mapAttendance(row, resolveJoinName(row.projects)))
      .filter((row) => (projectId ? row.projectId === projectId : true))
      .filter((row) => (teamType ? row.teamType === teamType : true))
      .filter((row) =>
        specialistTeamName
          ? (row.specialistTeamName ?? "").toLowerCase().includes(specialistTeamName)
          : true,
      ),
      [],
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
      totalDailyWage: rows.reduce((sum, row) => sum + row.dailyWage, 0),
      totalKasbon: rows.reduce((sum, row) => sum + row.kasbonAmount, 0),
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
    ),
    samplePayrollResets,
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
    totalDailyWage: rows.reduce((sum, row) => sum + row.dailyWage, 0),
    totalKasbon: rows.reduce((sum, row) => sum + row.kasbonAmount, 0),
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
      categoryTotals: buildCategoryTotals(expenses),
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

    const [{ data: projectRows }, { data: expenseRows }, { data: attendanceRows }, { data: recentRows }] =
      await Promise.all([
        supabase.from("projects").select("id, name, code, client_name, start_date, status, created_at"),
        supabase
          .from("project_expenses")
          .select(
            "id, project_id, category, description, recipient_name, amount, expense_date, created_at",
          ),
        supabase
          .from("attendance_records")
          .select(
            "id, project_id, worker_name, status, daily_wage, kasbon_amount, attendance_date, notes, created_at",
          ),
        supabase
          .from("project_expenses")
          .select(
            "id, project_id, category, description, recipient_name, amount, expense_date, created_at, projects(name)",
          )
          .order("expense_date", { ascending: false })
          .limit(8),
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
      categoryTotals: buildCategoryTotals(expenses),
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
    categoryTotals: buildCategoryTotals(sampleExpenses),
    recentExpenses: sampleExpenses,
    projectExpenseTotals: buildProjectExpenseTotals(sampleExpenses),
    projectCountByClient: buildProjectCountByClient(sampleProjects),
  };
}
