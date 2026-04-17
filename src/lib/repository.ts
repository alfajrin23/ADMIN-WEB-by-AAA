/**
 * Repository Pattern — Data Access Layer Interface
 * ================================================
 * 
 * Interface ini mendefinisikan kontrak untuk semua operasi data.
 * Setiap backend (Supabase, Firebase, Excel) harus mengimplementasikan interface ini.
 * 
 * Tujuan:
 * - Menghilangkan if/else branching per data source di actions.ts dan data.ts
 * - Memudahkan penambahan backend baru
 * - Memudahkan testing dengan mock implementation
 * 
 * Penggunaan:
 *   const repo = getRepository();
 *   const projects = await repo.getProjects();
 */

import type { Project, ExpenseEntry, AttendanceRecord, DashboardData, ProjectDetail, CategoryTotal, WageRecap } from "@/lib/types";
import type { ExpenseCategoryOption } from "@/lib/constants";

// ============================================================
// Project Repository
// ============================================================

export type CreateProjectInput = {
  name: string;
  code?: string | null;
  clientName?: string | null;
  startDate?: string | null;
  status?: string;
};

export type UpdateProjectInput = CreateProjectInput & {
  id: string;
};

// ============================================================
// Expense Repository
// ============================================================

export type CreateExpenseInput = {
  projectId: string;
  category: string;
  specialistType?: string | null;
  requesterName?: string | null;
  description?: string | null;
  recipientName?: string | null;
  quantity: number;
  unitLabel?: string | null;
  usageInfo?: string | null;
  unitPrice: number;
  amount: number;
  expenseDate: string;
};

export type UpdateExpenseInput = CreateExpenseInput & {
  id: string;
};

// ============================================================
// Attendance Repository
// ============================================================

export type CreateAttendanceInput = {
  projectId: string;
  workerName: string;
  teamType: string;
  specialistTeamName?: string | null;
  status: string;
  workDays: number;
  dailyWage: number;
  overtimeHours: number;
  overtimeWage: number;
  kasbonAmount: number;
  reimburseType?: string | null;
  reimburseAmount: number;
  attendanceDate: string;
  notes?: string | null;
};

export type UpdateAttendanceInput = CreateAttendanceInput & {
  id: string;
};

// ============================================================
// Main Repository Interface
// ============================================================

export interface DataRepository {
  // Projects
  getProjects(): Promise<Project[]>;
  getProjectById(id: string): Promise<Project | null>;
  getProjectDetail(id: string): Promise<ProjectDetail | null>;
  createProject(input: CreateProjectInput): Promise<string>;
  updateProject(input: UpdateProjectInput): Promise<void>;
  deleteProject(id: string): Promise<void>;

  // Expenses
  getExpenseById(id: string): Promise<ExpenseEntry | null>;
  getExpenseCategories(): Promise<ExpenseCategoryOption[]>;
  createExpense(input: CreateExpenseInput): Promise<string>;
  updateExpense(input: UpdateExpenseInput): Promise<void>;
  deleteExpense(id: string): Promise<void>;

  // Attendance
  getAttendanceById(id: string): Promise<AttendanceRecord | null>;
  createAttendance(input: CreateAttendanceInput): Promise<string>;
  updateAttendance(input: UpdateAttendanceInput): Promise<void>;
  deleteAttendance(id: string): Promise<void>;

  // Aggregates
  getDashboardData(): Promise<DashboardData>;
  getWageRecap(options?: {
    from?: string;
    to?: string;
    projectId?: string;
    includePaid?: boolean;
    recapMode?: "gabung" | "per_project";
    attendanceIds?: string[];
  }): Promise<WageRecap>;
}

// ============================================================
// Repository Factory (placeholder — koppel met bestaande implementatie)
// ============================================================
// 
// Toekomstige implementatie:
//
// import { activeDataSource } from "@/lib/storage";
// import { SupabaseRepository } from "@/lib/repositories/supabase-repository";
// import { FirebaseRepository } from "@/lib/repositories/firebase-repository";
// import { ExcelRepository } from "@/lib/repositories/excel-repository";
//
// export function getRepository(): DataRepository {
//   switch (activeDataSource) {
//     case "supabase": return new SupabaseRepository();
//     case "firebase": return new FirebaseRepository();
//     case "excel": return new ExcelRepository();
//     default: return new DemoRepository();
//   }
// }
//
// Saat ini, fungsi-fungsi di data.ts dan actions.ts masih menggunakan
// if/else branching langsung. Interface ini adalah fondasi untuk
// migrasi bertahap ke repository pattern.
// ============================================================
