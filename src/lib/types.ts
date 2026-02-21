import type {
  AttendanceStatus,
  CostCategory,
  ProjectStatus,
  ReimburseType,
  WorkerTeam,
} from "@/lib/constants";

export type Project = {
  id: string;
  name: string;
  code: string | null;
  clientName: string | null;
  startDate: string | null;
  status: ProjectStatus;
  createdAt: string;
};

export type ExpenseEntry = {
  id: string;
  projectId: string;
  projectName?: string;
  category: CostCategory;
  specialistType: string | null;
  requesterName: string | null;
  description: string | null;
  recipientName: string | null;
  quantity: number;
  unitLabel: string | null;
  usageInfo: string | null;
  unitPrice: number;
  amount: number;
  expenseDate: string;
  createdAt: string;
};

export type CategoryTotal = {
  category: CostCategory;
  label: string;
  total: number;
};

export type AttendanceRecord = {
  id: string;
  projectId: string;
  projectName?: string;
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  status: AttendanceStatus;
  workDays: number;
  dailyWage: number;
  kasbonAmount: number;
  reimburseType: ReimburseType | null;
  reimburseAmount: number;
  netPay: number;
  payrollPaid: boolean;
  attendanceDate: string;
  notes: string | null;
  createdAt: string;
};

export type WageProjectSummary = {
  projectId: string;
  projectName: string;
  totalDailyWage: number;
  totalKasbon: number;
  totalNetPay: number;
  workerCount: number;
};

export type WageTeamSummary = {
  key: string;
  label: string;
  totalDailyWage: number;
  totalKasbon: number;
  totalNetPay: number;
  workerCount: number;
};

export type WageProjectTeamSummary = {
  key: string;
  projectId: string;
  projectName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  label: string;
  totalDailyWage: number;
  totalKasbon: number;
  totalNetPay: number;
  workerCount: number;
  latestAttendanceDate: string;
};

export type WageWorkerSummary = {
  key: string;
  workerName: string;
  projectId: string | null;
  projectName: string | null;
  workDays: number;
  totalDailyWage: number;
  totalKasbon: number;
  totalNetPay: number;
  totalNetPayUnpaid: number;
  latestAttendanceDate: string;
  payrollPaid: boolean;
};

export type WageRecap = {
  from: string;
  to: string;
  recapMode: "gabung" | "per_project";
  rows: AttendanceRecord[];
  projectSummaries: WageProjectSummary[];
  teamSummaries: WageTeamSummary[];
  projectTeamSummaries: WageProjectTeamSummary[];
  workerSummaries: WageWorkerSummary[];
  totalDailyWage: number;
  totalKasbon: number;
  totalReimburse: number;
  totalNetPay: number;
};

export type ProjectDetail = {
  project: Project;
  expenses: ExpenseEntry[];
  categoryTotals: CategoryTotal[];
};

export type DashboardData = {
  totalProjects: number;
  totalExpense: number;
  monthExpense: number;
  totalKasbon: number;
  categoryTotals: CategoryTotal[];
  recentExpenses: ExpenseEntry[];
  projectExpenseTotals: Array<{
    projectId: string;
    projectName: string;
    transactionCount: number;
    totalExpense: number;
  }>;
  projectCountByClient: Array<{
    clientName: string;
    count: number;
  }>;
};
