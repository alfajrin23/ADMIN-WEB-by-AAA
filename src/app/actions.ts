"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type AttendanceStatus,
  ATTENDANCE_STATUSES,
  type CostCategory,
  COST_CATEGORIES,
  type ProjectStatus,
  PROJECT_STATUSES,
  type ReimburseType,
  REIMBURSE_TYPES,
  type WorkerTeam,
  WORKER_TEAMS,
} from "@/lib/constants";
import {
  deleteExcelAttendance,
  deleteExcelExpense,
  deleteExcelProject,
  importTemplateExcelDatabase,
  importTemplateExcelDatabaseFromBuffer,
  insertManyExcelAttendance,
  insertExcelExpense,
  insertExcelPayrollReset,
  insertExcelProject,
  updateExcelAttendance,
  updateExcelExpense,
  updateExcelProject,
} from "@/lib/excel-db";
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

function shiftDate(baseDate: string, daysOffset: number) {
  const parsed = new Date(`${baseDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return baseDate;
  }
  parsed.setUTCDate(parsed.getUTCDate() + daysOffset);
  return parsed.toISOString().slice(0, 10);
}

function revalidateProjectPages() {
  revalidatePath("/");
  revalidatePath("/projects");
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

  if (activeDataSource === "excel") {
    insertExcelProject(payload);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase.from("projects").insert(payload);
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
  const category = getString(formData, "category");
  return COST_CATEGORIES.some((item) => item.value === category)
    ? (category as CostCategory)
    : null;
}

function getSpecialistType(formData: FormData, category: CostCategory | null) {
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

export async function createExpenseAction(formData: FormData) {
  const projectId = getString(formData, "project_id");
  const requesterName = getString(formData, "requester_name");
  const description = getString(formData, "description");
  const amount = getNumber(formData, "amount");
  const parsedCategory = getParsedCategory(formData);
  if (
    !projectId ||
    !requesterName ||
    !description ||
    !parsedCategory ||
    !Number.isFinite(amount) ||
    amount <= 0
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
    await supabase.from("project_expenses").insert({
      project_id: excelPayload.project_id,
      category: excelPayload.category,
      description: excelPayload.description,
      recipient_name: excelPayload.recipient_name,
      amount: excelPayload.amount,
      expense_date: excelPayload.expense_date,
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
  const amount = getNumber(formData, "amount");
  const parsedCategory = getParsedCategory(formData);
  if (!expenseId || !projectId || !parsedCategory || !Number.isFinite(amount) || amount <= 0) {
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
    await supabase
      .from("project_expenses")
      .update({
        project_id: excelPayload.project_id,
        category: excelPayload.category,
        description: excelPayload.description,
        recipient_name: excelPayload.recipient_name,
        amount: excelPayload.amount,
        expense_date: excelPayload.expense_date,
      })
      .eq("id", excelPayload.id);
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
  } else {
    return;
  }

  revalidateProjectPages();
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function importExcelTemplateAction(formData: FormData) {
  if (activeDataSource !== "excel") {
    return;
  }

  const returnTo = getReturnTo(formData);
  const uploadedFile = formData.get("template_file");
  if (uploadedFile instanceof File && uploadedFile.size > 0) {
    const fileName = uploadedFile.name.toLowerCase();
    if (fileName.endsWith(".xlsx")) {
      const arrayBuffer = await uploadedFile.arrayBuffer();
      importTemplateExcelDatabaseFromBuffer(new Uint8Array(arrayBuffer));
    }
  } else {
    const templatePath = getString(formData, "template_path") || undefined;
    importTemplateExcelDatabase(templatePath);
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
    attendance_date: attendanceDate,
    notes: getString(formData, "notes") || null,
  };
  const payloadRows = Array.from({ length: workDays }, (_, index) => ({
    ...payload,
    reimburse_amount: index === 0 ? normalizedReimburseAmount : 0,
    attendance_date: shiftDate(attendanceDate, -index),
  }));

  if (activeDataSource === "excel") {
    insertManyExcelAttendance(payloadRows);
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return;
    }
    await supabase.from("attendance_records").insert(
      payloadRows.map((row) => ({
        project_id: row.project_id,
        worker_name: row.worker_name,
        status: row.status,
        daily_wage: row.daily_wage,
        kasbon_amount: row.kasbon_amount,
        attendance_date: row.attendance_date,
        notes: row.notes,
      })),
    );
  } else {
    return;
  }

  revalidatePath("/");
  revalidatePath("/attendance");
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
        status: payload.status,
        daily_wage: payload.daily_wage,
        kasbon_amount: payload.kasbon_amount,
        attendance_date: payload.attendance_date,
        notes: payload.notes,
      })
      .eq("id", payload.id);
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
  } else {
    return;
  }

  revalidatePath("/");
  revalidatePath("/attendance");
  if (returnTo) {
    redirect(returnTo);
  }
}
