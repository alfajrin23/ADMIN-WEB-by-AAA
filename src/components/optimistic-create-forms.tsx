"use client";

import { useRef, type FormEvent, type ReactNode } from "react";
import type { AttendanceRecord, ExpenseEntry, Project } from "@/lib/types";
import { useOptimisticCreateStore } from "@/components/optimistic-create-store";

type NativeServerAction = (formData: FormData) => void | Promise<void>;

type OptimisticCreateFormProps = {
  action: NativeServerAction;
  children: ReactNode;
  className?: string;
  id?: string;
};

type OptimisticAttendanceCreateFormProps = OptimisticCreateFormProps & {
  attendanceDate: string;
};

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string) {
  const parsed = Number(getText(formData, key).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLooseAmount(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function createTempId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function OptimisticAttendanceCreateForm({
  action,
  attendanceDate,
  children,
  className,
  id,
}: OptimisticAttendanceCreateFormProps) {
  const { addPendingAttendances } = useOptimisticCreateStore();
  const isSubmittingRef = useRef(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (event.defaultPrevented || isSubmittingRef.current) {
      if (isSubmittingRef.current) {
        event.preventDefault();
      }
      return;
    }
    isSubmittingRef.current = true;
    const formData = new FormData(event.currentTarget);
    const teamType = getText(formData, "team_type") as AttendanceRecord["teamType"];
    const dailyWage = getNumber(formData, "daily_wage");
    const row: AttendanceRecord = {
      id: createTempId("pending-attendance"),
      projectId: "",
      workerName: getText(formData, "worker_name"),
      teamType,
      specialistTeamName: teamType === "spesialis" ? getText(formData, "specialist_team_name") || null : null,
      status: "hadir",
      workDays: 1,
      dailyWage,
      overtimeHours: 0,
      overtimeWage: 0,
      overtimePay: 0,
      kasbonAmount: 0,
      reimburseType: null,
      reimburseAmount: 0,
      netPay: dailyWage,
      payrollPaid: false,
      attendanceDate: getText(formData, "attendance_date") || attendanceDate,
      notes: null,
      createdAt: new Date().toISOString(),
    };
    addPendingAttendances([row]);
  };

  return (
    <form id={id} action={action} onSubmit={handleSubmit} className={className}>
      {children}
    </form>
  );
}

export function OptimisticExpenseCreateForm({
  action,
  children,
  className,
  id,
}: OptimisticCreateFormProps) {
  const { addPendingExpenses } = useOptimisticCreateStore();
  const isSubmittingRef = useRef(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (event.defaultPrevented || isSubmittingRef.current) {
      if (isSubmittingRef.current) {
        event.preventDefault();
      }
      return;
    }
    isSubmittingRef.current = true;
    const formData = new FormData(event.currentTarget);
    const mode = getText(formData, "expense_input_mode");
    const now = new Date().toISOString();
    let rows: ExpenseEntry[] = [];

    if (mode === "hok_kmp_cianjur") {
      try {
        const hokRows = JSON.parse(getText(formData, "hok_rows_json")) as Array<{
          projectId?: unknown;
          projectName?: unknown;
          requesterName?: unknown;
          amount?: unknown;
        }>;
        rows = hokRows.map((item) => ({
          id: createTempId("pending-expense"),
          projectId: String(item.projectId ?? "").trim(),
          projectName: String(item.projectName ?? "").trim() || undefined,
          category: "upah_kasbon_tukang",
          specialistType: null,
          requesterName: String(item.requesterName ?? "").trim() || null,
          description: "HOK",
          recipientName: null,
          quantity: 1,
          unitLabel: null,
          usageInfo: "Menyimpan HOK ke database...",
          unitPrice: 0,
          amount: getLooseAmount(item.amount),
          expenseDate: getText(formData, "expense_date") || now.slice(0, 10),
          createdAt: now,
        }));
      } catch {
        return;
      }
    } else if (mode === "continue") {
      try {
        const continueRows = JSON.parse(getText(formData, "continue_rows_json")) as Array<{
          projectId?: unknown;
          projectName?: unknown;
          category?: unknown;
          requesterName?: unknown;
          description?: unknown;
          amount?: unknown;
          expenseDate?: unknown;
        }>;
        rows = continueRows.map((item) => ({
          id: createTempId("pending-expense"),
          projectId: String(item.projectId ?? "").trim(),
          projectName: String(item.projectName ?? "").trim() || undefined,
          category: String(item.category ?? "").trim(),
          specialistType: null,
          requesterName: String(item.requesterName ?? "").trim() || null,
          description: String(item.description ?? "").trim() || null,
          recipientName: null,
          quantity: 0,
          unitLabel: null,
          usageInfo: "Menyimpan biaya continue ke database...",
          unitPrice: 0,
          amount: getLooseAmount(item.amount),
          expenseDate: String(item.expenseDate ?? "").trim() || now.slice(0, 10),
          createdAt: now,
        }));
      } catch {
        return;
      }
    } else if (mode === "kmp_material_check") {
      try {
        const materialRows = JSON.parse(getText(formData, "kmp_material_rows_json")) as Array<{
          projectId?: unknown;
          projectName?: unknown;
          materialName?: unknown;
          amountMode?: unknown;
          systemAmount?: unknown;
          manualAmount?: unknown;
        }>;
        rows = materialRows.map((item) => {
          const amountMode = String(item.amountMode ?? "").trim();
          const amount =
            amountMode === "manual"
              ? getLooseAmount(item.manualAmount)
              : amountMode === "system"
                ? getLooseAmount(item.systemAmount)
                : 0;
          return {
            id: createTempId("pending-expense"),
            projectId: String(item.projectId ?? "").trim(),
            projectName: String(item.projectName ?? "").trim() || undefined,
            category: "material",
            specialistType: null,
            requesterName: null,
            description: String(item.materialName ?? "").trim() || null,
            recipientName: null,
            quantity: 1,
            unitLabel: null,
            usageInfo: "Menyimpan checklist material ke database...",
            unitPrice: 0,
            amount,
            expenseDate: getText(formData, "expense_date") || now.slice(0, 10),
            createdAt: now,
          };
        });
      } catch {
        return;
      }
    } else if (mode !== "standard") {
      return;
    }

    const projectIds = Array.from(
      new Set(
        [getText(formData, "project_id"), ...formData.getAll("project_ids").map(String)]
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
    const amount = getNumber(formData, "amount");
    if (mode === "standard") {
      rows = projectIds.map((projectId) => ({
        id: createTempId("pending-expense"),
        projectId,
        category: getText(formData, "category_custom") || getText(formData, "category"),
        specialistType: getText(formData, "specialist_type_custom") || getText(formData, "specialist_type") || null,
        requesterName: getText(formData, "requester_name") || null,
        description: getText(formData, "description") || null,
        recipientName: getText(formData, "recipient_name") || null,
        quantity: getNumber(formData, "quantity"),
        unitLabel: getText(formData, "unit_label") || null,
        usageInfo: getText(formData, "usage_info") || "Menyimpan ke database...",
        unitPrice: getNumber(formData, "unit_price"),
        amount,
        expenseDate: getText(formData, "expense_date") || now.slice(0, 10),
        createdAt: now,
      }));
    }
    addPendingExpenses(
      rows.filter((row) => row.projectId && (mode === "kmp_material_check" || row.amount > 0)),
    );
  };

  return (
    <form id={id} action={action} onSubmit={handleSubmit} className={className}>
      {children}
    </form>
  );
}

export function OptimisticProjectCreateForm({
  action,
  children,
  className,
  id,
}: OptimisticCreateFormProps) {
  const { addPendingProjects } = useOptimisticCreateStore();
  const isSubmittingRef = useRef(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (event.defaultPrevented || isSubmittingRef.current) {
      if (isSubmittingRef.current) {
        event.preventDefault();
      }
      return;
    }
    isSubmittingRef.current = true;
    const formData = new FormData(event.currentTarget);
    const row: Project = {
      id: createTempId("pending-project"),
      name: getText(formData, "name"),
      code: getText(formData, "code") || null,
      clientName: getText(formData, "client_name") || null,
      startDate: getText(formData, "start_date") || null,
      status: (getText(formData, "status") || "aktif") as Project["status"],
      createdAt: new Date().toISOString(),
    };
    addPendingProjects([row]);
  };

  return (
    <form id={id} action={action} onSubmit={handleSubmit} className={className}>
      {children}
    </form>
  );
}
