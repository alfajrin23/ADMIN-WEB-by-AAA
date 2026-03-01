import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx/xlsx.mjs";
import {
  ATTENDANCE_STATUSES,
  COST_CATEGORIES,
  PROJECT_STATUSES,
  toCategorySlug,
  WORKER_TEAMS,
} from "@/lib/constants";
import { excelDbPath } from "@/lib/storage";
import type {
  AttendanceStatus,
  CostCategory,
  ProjectStatus,
  ReimburseType,
  WorkerTeam,
} from "@/lib/constants";

XLSX.set_fs(fs);

type ProjectRow = {
  id: string;
  name: string;
  code: string | null;
  client_name: string | null;
  start_date: string | null;
  status: ProjectStatus;
  created_at: string;
};

type ExpenseRow = {
  id: string;
  project_id: string;
  category: CostCategory;
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
  created_at: string;
};

type AttendanceRow = {
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
  created_at: string;
};

type PayrollResetRow = {
  id: string;
  project_id: string;
  team_type: WorkerTeam;
  specialist_team_name: string | null;
  worker_name: string | null;
  paid_until_date: string;
  created_at: string;
};

type ExcelDb = {
  projects: ProjectRow[];
  project_expenses: ExpenseRow[];
  attendance_records: AttendanceRow[];
  payroll_resets: PayrollResetRow[];
};

export type ImportedTemplateWorkbookData = {
  projects: Array<{
    id: string;
    name: string;
    code: string | null;
    client_name: string | null;
    start_date: string | null;
    status: ProjectStatus;
  }>;
  project_expenses: Array<{
    project_id: string;
    category: CostCategory;
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
  }>;
};

export type DetailReportWorkbookInput = {
  projects: Array<{
    id: string;
    name: string;
  }>;
  project_expenses: Array<{
    project_id: string;
    category: CostCategory;
    requester_name: string | null;
    description: string | null;
    quantity: number;
    unit_label: string | null;
    usage_info: string | null;
    unit_price: number;
    amount: number;
    expense_date: string;
  }>;
};

type DetailColumnMap = {
  no: number;
  requester: number;
  date: number;
  description: number;
  qty: number;
  unit: number;
  usage: number;
  unitPrice: number;
  material: number | null;
  alat: number | null;
  upah: number | null;
  lainLain: number | null;
  ops: number | null;
  listrik: number | null;
  subcont: number | null;
  perawatan: number | null;
  total: number | null;
  maxCol: number;
};

const SHEETS: Array<keyof ExcelDb> = [
  "projects",
  "project_expenses",
  "attendance_records",
  "payroll_resets",
];

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveInteger(value: unknown, fallback = 1) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toStringOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isInternalSheet(sheetName: string) {
  return SHEETS.includes(sheetName as keyof ExcelDb);
}

function isTemplateProjectSheet(workbook: XLSX.WorkBook, sheetName: string) {
  if (isInternalSheet(sheetName)) {
    return false;
  }

  const upperSheetName = sheetName.toUpperCase();
  if (upperSheetName.startsWith("REKAP ") || upperSheetName.startsWith("BACKUP ")) {
    return false;
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return false;
  }

  const firstRows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    defval: null,
    range: 0,
  });
  const rowOne = firstRows[0] ?? [];
  const rowTwo = firstRows[1] ?? [];
  const titleText = rowOne.join(" ").toUpperCase();
  const headerText = rowTwo.join(" ").toUpperCase();

  return titleText.includes("PROJECT") || headerText.includes("NAMA PENGAJUAN");
}

function seedProjectsFromWorkbook(workbook: XLSX.WorkBook): ProjectRow[] {
  const now = new Date().toISOString();
  return workbook.SheetNames.filter((sheetName) => isTemplateProjectSheet(workbook, sheetName)).map(
    (sheetName) => ({
      id: randomUUID(),
      name: sheetName.trim(),
      code: slugify(sheetName).toUpperCase(),
      client_name: "KMP Cianjur",
      start_date: null,
      status: "aktif",
      created_at: now,
    }),
  );
}

function toIsoDateIfValid(yearText: string, monthText: string, dayText: string) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTemplateDate(value: unknown) {
  const todayDate = new Date().toISOString().slice(0, 10);

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${month}-${day}`;
    }
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return todayDate;
    }

    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const resolved = toIsoDateIfValid(iso[1], iso[2], iso[3]);
      if (resolved) {
        return resolved;
      }
    }

    const idMonthMap: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      mei: "05",
      may: "05",
      jun: "06",
      jul: "07",
      agu: "08",
      ags: "08",
      aug: "08",
      sep: "09",
      okt: "10",
      oct: "10",
      nov: "11",
      des: "12",
      dec: "12",
    };
    const localized = trimmed.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[-/. ](\d{2,4})?$/);
    if (localized) {
      const day = String(Number(localized[1])).padStart(2, "0");
      const month = idMonthMap[localized[2].toLowerCase()];
      const yearRaw = localized[3] ?? String(new Date().getFullYear());
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      if (month) {
        const resolved = toIsoDateIfValid(year, month, day);
        if (resolved) {
          return resolved;
        }
      }
    }

    const localDate = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (localDate) {
      const day = String(Number(localDate[1])).padStart(2, "0");
      const month = String(Number(localDate[2])).padStart(2, "0");
      const yearRaw = localDate[3];
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      const resolved = toIsoDateIfValid(year, month, day);
      if (resolved) {
        return resolved;
      }
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return todayDate;
}

function parseTemplateDateOrNull(value: unknown) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }
  return parseTemplateDate(value);
}

function parseTemplateNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  let normalized = trimmed
    .replace(/rp/gi, "")
    .replace(/[^\d,.\-]/g, "")
    .replace(/(?!^)-/g, "");
  if (!normalized) {
    return 0;
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const fractionDigits = normalized.length - lastComma - 1;
    normalized =
      fractionDigits > 0 && fractionDigits <= 2
        ? normalized.replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const fractionDigits = normalized.length - lastDot - 1;
    const dotCount = normalized.split(".").length - 1;
    if (dotCount > 1 || fractionDigits === 3) {
      normalized = normalized.replace(/\./g, "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTemplateCost(value: unknown) {
  const parsed = parseTemplateNumeric(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resolveTemplateCategoryByHeader(headerText: string): CostCategory | null {
  const upper = headerText.toUpperCase();
  if (
    upper.includes("TOTAL COST") ||
    upper.includes("PENGELUARAN PER") ||
    upper.includes("TOTAL COST PER DESA")
  ) {
    return null;
  }
  if (upper.includes("COST MATERIAL")) {
    return "material";
  }
  if (upper.includes("ALAT") || upper.includes("COST ALAT")) {
    return "alat";
  }
  if (upper.includes("UPAH") || upper.includes("KASBON")) {
    return upper.includes("SPESIALIS") ? "upah_tim_spesialis" : "upah_kasbon_tukang";
  }
  if (
    upper.includes("OPS") ||
    upper.includes("OPERASIONAL") ||
    upper.includes("LAIN-LAIN") ||
    upper.includes("LISTRIK") ||
    upper.includes("SUBCONT") ||
    upper.includes("PERAWATAN")
  ) {
    return "operasional";
  }
  return null;
}

function getTemplateCategoryColumns(sheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:Z12");
  const columns: Array<{ column: number; category: CostCategory }> = [];

  for (let col = 8; col <= range.e.c; col += 1) {
    const headerTop = getCellText(sheet, col, 2);
    const headerBottom = getCellText(sheet, col, 3);
    const category = resolveTemplateCategoryByHeader(`${headerTop} ${headerBottom}`.trim());
    if (!category) {
      continue;
    }
    columns.push({ column: col, category });
  }

  if (columns.length > 0) {
    return columns;
  }

  return [
    { column: 8, category: "material" },
    { column: 9, category: "alat" },
    { column: 10, category: "upah_kasbon_tukang" },
    { column: 11, category: "operasional" },
  ];
}

function isTemplateSubtotalRow(row: unknown[], description: string | null) {
  const marker = `${String(row[0] ?? "")} ${description ?? ""}`.toUpperCase();
  return marker.includes("TOTAL PENGELUARAN");
}

function seedExpensesFromWorkbook(workbook: XLSX.WorkBook, projects: ProjectRow[]) {
  const projectBySheet = new Map(
    projects.map((project) => [project.name.trim().toUpperCase(), project.id]),
  );
  const expenses: ExpenseRow[] = [];
  const todayDate = new Date().toISOString().slice(0, 10);

  for (const sheetName of workbook.SheetNames) {
    if (!isTemplateProjectSheet(workbook, sheetName)) {
      continue;
    }
    const projectId = projectBySheet.get(sheetName.trim().toUpperCase());
    if (!projectId) {
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const headerColumns = getHeaderColumns(sheet);
    const categoryColumns = getTemplateCategoryColumns(sheet);
    const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1, defval: null });
    let lastRequesterName: string | null = null;
    let lastExpenseDate: string | null = null;

    for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const no = row[headerColumns.no];
      const rawRequesterName = toStringOrNull(row[headerColumns.requester]);
      const rawExpenseDate = parseTemplateDateOrNull(row[headerColumns.date]);
      const description = toStringOrNull(row[headerColumns.description]);
      const usageInfo = toStringOrNull(row[headerColumns.usage]);
      if (isTemplateSubtotalRow(row, description)) {
        continue;
      }

      const qty = parseTemplateNumeric(row[headerColumns.qty]);
      const unitPrice = parseTemplateNumeric(row[headerColumns.unitPrice]);
      const unitLabel = toStringOrNull(row[headerColumns.unit]);
      const hasTransactionNumber = parseTemplateNumeric(no) > 0;
      const requesterName =
        rawRequesterName ?? (!hasTransactionNumber ? lastRequesterName : null);
      const expenseDate = rawExpenseDate ?? lastExpenseDate ?? todayDate;
      const hasUsageOrDescription = Boolean(description || usageInfo || requesterName);
      const hasPrimaryData = Boolean(
        hasTransactionNumber ||
          description ||
          usageInfo ||
          rawRequesterName ||
          rawExpenseDate,
      );

      if (rawRequesterName && hasPrimaryData) {
        lastRequesterName = rawRequesterName;
      }
      if (rawExpenseDate && hasPrimaryData) {
        lastExpenseDate = rawExpenseDate;
      }

      let hasAnyAmount = false;

      for (const item of categoryColumns) {
        const amount = parseTemplateCost(row[item.column]);
        if (amount <= 0) {
          continue;
        }
        hasAnyAmount = true;

        expenses.push({
          id: randomUUID(),
          project_id: projectId,
          category: item.category,
          specialist_type: null,
          requester_name: requesterName,
          description,
          recipient_name: null,
          quantity: qty,
          unit_label: unitLabel,
          usage_info: usageInfo,
          unit_price: unitPrice,
          amount,
          expense_date: expenseDate,
          created_at: new Date().toISOString(),
        });
      }

      if (!hasAnyAmount && !hasTransactionNumber && !hasUsageOrDescription) {
        continue;
      }
    }
  }

  return expenses;
}

function ensureDirectory() {
  const directory = path.dirname(excelDbPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function createEmptyWorkbook() {
  const workbook = XLSX.utils.book_new();
  for (const sheetName of SHEETS) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([]), sheetName);
  }
  return workbook;
}

function readWorkbook() {
  if (!fs.existsSync(excelDbPath)) {
    return createEmptyWorkbook();
  }

  const workbook = XLSX.readFile(excelDbPath);

  for (const sheetName of SHEETS) {
    if (!workbook.Sheets[sheetName]) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([]), sheetName);
    }
  }

  return workbook;
}

function parseProjects(rawRows: Record<string, unknown>[]): ProjectRow[] {
  return rawRows
    .map((row) => {
      const statusValue = String(row.status);
      const status: ProjectStatus = PROJECT_STATUSES.some(
        (item) => item.value === statusValue,
      )
        ? (statusValue as ProjectStatus)
        : "aktif";

      return {
        id: String(row.id ?? randomUUID()),
        name: String(row.name ?? ""),
        code: toStringOrNull(row.code),
        client_name: toStringOrNull(row.client_name),
        start_date: toStringOrNull(row.start_date),
        status,
        created_at: String(row.created_at ?? new Date().toISOString()),
      };
    })
    .filter((row) => row.name.length > 0);
}

function parseExpenses(rawRows: Record<string, unknown>[]): ExpenseRow[] {
  return rawRows.map((row) => {
    const category = toCategorySlug(String(row.category ?? "")) || COST_CATEGORIES[0].value;

    return {
      id: String(row.id ?? randomUUID()),
      project_id: String(row.project_id ?? ""),
      category,
      specialist_type: toStringOrNull(row.specialist_type),
      requester_name: toStringOrNull(row.requester_name),
      description: toStringOrNull(row.description),
      recipient_name: toStringOrNull(row.recipient_name),
      quantity: toNumber(row.quantity),
      unit_label: toStringOrNull(row.unit_label),
      usage_info: toStringOrNull(row.usage_info),
      unit_price: toNumber(row.unit_price),
      amount: toNumber(row.amount),
      expense_date: String(row.expense_date ?? new Date().toISOString().slice(0, 10)),
      created_at: String(row.created_at ?? new Date().toISOString()),
    };
  });
}

function parseAttendance(rawRows: Record<string, unknown>[]): AttendanceRow[] {
  return rawRows.map((row) => {
    const statusValue = String(row.status);
    const status: AttendanceStatus = ATTENDANCE_STATUSES.some(
      (item) => item.value === statusValue,
    )
      ? (statusValue as AttendanceStatus)
      : "hadir";
    const teamTypeValue = String(row.team_type);
    const teamType: WorkerTeam = WORKER_TEAMS.some((item) => item.value === teamTypeValue)
      ? (teamTypeValue as WorkerTeam)
      : "tukang";
    const reimburseTypeValue = String(row.reimburse_type ?? "");
    const reimburseType: ReimburseType | null =
      reimburseTypeValue === "material" || reimburseTypeValue === "kekurangan_dana"
        ? (reimburseTypeValue as ReimburseType)
        : null;

    return {
      id: String(row.id ?? randomUUID()),
      project_id: String(row.project_id ?? ""),
      worker_name: String(row.worker_name ?? ""),
      team_type: teamType,
      specialist_team_name: toStringOrNull(row.specialist_team_name),
      status,
      work_days: toPositiveInteger(row.work_days, 1),
      daily_wage: toNumber(row.daily_wage),
      overtime_hours: Math.max(0, toNumber(row.overtime_hours)),
      overtime_wage: Math.max(0, toNumber(row.overtime_wage)),
      kasbon_amount: toNumber(row.kasbon_amount),
      reimburse_type: reimburseType,
      reimburse_amount: toNumber(row.reimburse_amount),
      attendance_date: String(row.attendance_date ?? new Date().toISOString().slice(0, 10)),
      notes: toStringOrNull(row.notes),
      created_at: String(row.created_at ?? new Date().toISOString()),
    };
  });
}

function parsePayrollResets(rawRows: Record<string, unknown>[]): PayrollResetRow[] {
  return rawRows.map((row) => {
    const teamTypeValue = String(row.team_type);
    const teamType: WorkerTeam = WORKER_TEAMS.some((item) => item.value === teamTypeValue)
      ? (teamTypeValue as WorkerTeam)
      : "tukang";

    return {
      id: String(row.id ?? randomUUID()),
      project_id: String(row.project_id ?? ""),
      team_type: teamType,
      specialist_team_name: toStringOrNull(row.specialist_team_name),
      worker_name: toStringOrNull(row.worker_name),
      paid_until_date: String(row.paid_until_date ?? new Date().toISOString().slice(0, 10)),
      created_at: String(row.created_at ?? new Date().toISOString()),
    };
  });
}

function getSheetRows(workbook: XLSX.WorkBook, sheetName: keyof ExcelDb) {
  const sheet = workbook.Sheets[sheetName];
  return sheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
    : [];
}

function sleep(ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // keep API synchronous while retrying temporary file locks
  }
}

function isLockedFileError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const withCode = error as { code?: unknown; message?: unknown };
  const code = typeof withCode.code === "string" ? withCode.code.toUpperCase() : "";
  const message =
    typeof withCode.message === "string" ? withCode.message.toUpperCase() : "";

  return (
    code === "EBUSY" ||
    code === "EPERM" ||
    code === "EACCES" ||
    message.includes("EBUSY") ||
    message.includes("EPERM") ||
    message.includes("EACCES")
  );
}

function normalizeText(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getCellAddress(col: number, row: number) {
  return XLSX.utils.encode_cell({ c: col, r: row - 1 });
}

function getCellText(sheet: XLSX.WorkSheet, col: number, row: number) {
  const cell = sheet[getCellAddress(col, row)] as XLSX.CellObject | undefined;
  if (!cell || cell.v == null) {
    return "";
  }
  return String(cell.v).trim();
}

function cloneTemplateCell(cell: XLSX.CellObject | undefined) {
  if (!cell) {
    return undefined;
  }

  const cloned = { ...cell };
  if ("s" in cell && cell.s) {
    cloned.s = JSON.parse(JSON.stringify(cell.s)) as XLSX.CellObject["s"];
  }
  delete cloned.v;
  delete cloned.w;
  delete cloned.f;
  cloned.t = "z";
  return cloned;
}

function setCellValue(params: {
  sheet: XLSX.WorkSheet;
  col: number;
  row: number;
  value: string | number | null;
  templateCell?: XLSX.CellObject;
}) {
  const { sheet, col, row, value, templateCell } = params;
  const address = getCellAddress(col, row);
  const existing = sheet[address] as XLSX.CellObject | undefined;
  const cell = existing ? existing : cloneTemplateCell(templateCell) ?? ({ t: "z" } as XLSX.CellObject);

  if (typeof value === "number") {
    cell.t = "n";
    cell.v = value;
  } else if (typeof value === "string" && value.length > 0) {
    cell.t = "s";
    cell.v = value;
  } else {
    cell.t = "z";
    delete cell.v;
  }

  delete cell.w;
  delete cell.f;
  sheet[address] = cell;
}

function clearSheetData(sheet: XLSX.WorkSheet, startRow: number) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:Z12");
  for (let row = startRow; row <= range.e.r + 1; row += 1) {
    for (let col = 0; col <= range.e.c; col += 1) {
      const address = getCellAddress(col, row);
      const cell = sheet[address] as XLSX.CellObject | undefined;
      if (!cell) {
        continue;
      }
      delete cell.v;
      delete cell.w;
      delete cell.f;
      cell.t = "z";
      sheet[address] = cell;
    }
  }
}

function getHeaderColumns(sheet: XLSX.WorkSheet): DetailColumnMap {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:Z12");
  const maxCol = range.e.c;
  const headerRowTwo = Array.from({ length: maxCol + 1 }, (_, col) =>
    getCellText(sheet, col, 2).toUpperCase(),
  );

  const findBy = (predicate: (text: string) => boolean) => {
    for (let col = 0; col <= maxCol; col += 1) {
      if (predicate(headerRowTwo[col])) {
        return col;
      }
    }
    return null;
  };

  return {
    no: 0,
    requester: 1,
    date: 2,
    description: 3,
    qty: 4,
    unit: 5,
    usage: 6,
    unitPrice: 7,
    material: findBy((text) => text.includes("COST MATERIAL")),
    alat: findBy((text) => text === "ALAT" || text.includes("COST ALAT")),
    upah: findBy((text) => text.includes("UPAH")),
    lainLain: findBy((text) => text.includes("LAIN-LAIN")),
    ops: findBy((text) => text.includes("COST OPS") || text.includes("OPERASIONAL")),
    listrik: findBy((text) => text.includes("LISTRIK")),
    subcont: findBy((text) => text.includes("SUBCONT")),
    perawatan: findBy((text) => text.includes("PERAWATAN")),
    total: findBy(
      (text) =>
        text.includes("TOTAL COST") || text.includes("PENGELUARAN PER") || text.includes("TOTAL COST PER DESA"),
    ),
    maxCol,
  };
}

function findSubtotalTemplateRow(sheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:Z12");
  for (let row = 4; row <= range.e.r + 1; row += 1) {
    const firstCol = getCellText(sheet, 0, row).toUpperCase();
    if (firstCol.includes("TOTAL PENGELUARAN")) {
      return row;
    }
  }
  return 4;
}

function isDetailTemplateSheet(sheetName: string) {
  const upper = sheetName.toUpperCase();
  return (
    !upper.startsWith("REKAP ") &&
    !upper.startsWith("BACKUP ") &&
    !isInternalSheet(sheetName)
  );
}

function findDefaultDetailTemplateSheetName(workbook: XLSX.WorkBook) {
  const preferred = ["UMUM UPDATE", "BACKUP UMUM ALL"];
  for (const item of preferred) {
    const matched = workbook.SheetNames.find((name) => name.toUpperCase() === item);
    if (matched) {
      return matched;
    }
  }

  const firstDetail = workbook.SheetNames.find((name) => {
    if (!isDetailTemplateSheet(name)) {
      return false;
    }
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      return false;
    }
    return getCellText(sheet, 1, 2).toUpperCase().includes("NAMA PENGAJUAN");
  });
  return firstDetail ?? workbook.SheetNames[0] ?? "RINCIAN";
}

function resolveProjectTemplateSheetName(workbook: XLSX.WorkBook, projectName: string) {
  const normalizedProject = normalizeText(projectName);
  const detailSheets = workbook.SheetNames.filter((name) => isDetailTemplateSheet(name));

  const exact = detailSheets.find((name) => normalizeText(name) === normalizedProject);
  if (exact) {
    return exact;
  }

  const partial = detailSheets.find((name) => {
    const normalizedSheet = normalizeText(name);
    return (
      normalizedSheet.includes(normalizedProject) || normalizedProject.includes(normalizedSheet)
    );
  });
  if (partial) {
    return partial;
  }

  return findDefaultDetailTemplateSheetName(workbook);
}

function ensureUniqueSheetName(baseName: string, usedNames: Set<string>) {
  const cleanedBase = baseName.replace(/[\\/?*[\]:]/g, " ").trim() || "SHEET";
  let candidate = cleanedBase.slice(0, 31);
  let counter = 2;
  while (usedNames.has(candidate.toUpperCase())) {
    const suffix = ` (${counter})`;
    const head = cleanedBase.slice(0, Math.max(1, 31 - suffix.length));
    candidate = `${head}${suffix}`;
    counter += 1;
  }
  usedNames.add(candidate.toUpperCase());
  return candidate;
}

function selectOpsColumn(map: DetailColumnMap) {
  if (map.ops != null) {
    return map.ops;
  }
  if (map.lainLain != null) {
    return map.lainLain;
  }
  if (map.listrik != null) {
    return map.listrik;
  }
  if (map.subcont != null) {
    return map.subcont;
  }
  return null;
}

function splitExpenseByCategory(category: CostCategory, amount: number) {
  if (category === "material") {
    return { material: amount, alat: 0, upah: 0, ops: 0 };
  }
  if (category === "alat") {
    return { material: 0, alat: amount, upah: 0, ops: 0 };
  }
  if (
    category === "upah_kasbon_tukang" ||
    category === "upah_staff_pelaksana" ||
    category === "upah_tim_spesialis"
  ) {
    return { material: 0, alat: 0, upah: amount, ops: 0 };
  }
  return { material: 0, alat: 0, upah: 0, ops: amount };
}

function formatMonthLabel(value: string) {
  const [yearText, monthText] = value.split("-");
  const monthNumber = Number(monthText);
  const year = Number(yearText);
  if (!Number.isFinite(monthNumber) || !Number.isFinite(year)) {
    return value.toUpperCase();
  }
  const months = [
    "JANUARI",
    "FEBRUARI",
    "MARET",
    "APRIL",
    "MEI",
    "JUNI",
    "JULI",
    "AGUSTUS",
    "SEPTEMBER",
    "OKTOBER",
    "NOVEMBER",
    "DESEMBER",
  ];
  const monthName = months[monthNumber - 1] ?? "BULAN";
  return `${monthName} ${year}`;
}

function formatDetailDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const day = String(date.getDate()).padStart(2, "0");
  const month = monthNames[date.getMonth()] ?? "Jan";
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function createFallbackDetailTemplateSheet() {
  return XLSX.utils.aoa_to_sheet([
    ["PROJECT KMP CIANJUR"],
    [
      "NO",
      "NAMA PENGAJUAN",
      "TANGGAL",
      "KETERANGAN",
      "RINCIAN COST",
      "",
      "",
      "",
      "COST MATERIAL",
      "ALAT",
      "COST UPAH/KASBON",
      "COST OPS",
      "PENGELUARAN PER MINGGU",
    ],
    ["", "", "", "", "QTY", "KET", "INFORMASI PENGGUNAAN", "HARGA", "COST", "COST", "COST", "COST", ""],
  ]);
}

function appendProjectDetailSheets(workbook: XLSX.WorkBook, templateWorkbook: XLSX.WorkBook, data: ExcelDb) {
  const usedNames = new Set<string>();

  for (const project of data.projects) {
    const templateSheetName = resolveProjectTemplateSheetName(templateWorkbook, project.name);
    const templateSheet =
      templateWorkbook.Sheets[templateSheetName] ?? createFallbackDetailTemplateSheet();
    const projectSheet = JSON.parse(JSON.stringify(templateSheet)) as XLSX.WorkSheet;
    if (projectSheet["!merges"]) {
      projectSheet["!merges"] = projectSheet["!merges"]?.filter((merge) => merge.e.r <= 2);
    }

    const map = getHeaderColumns(projectSheet);
    const subtotalTemplateRow = findSubtotalTemplateRow(projectSheet);
    const dataStartRow = 4;
    clearSheetData(projectSheet, dataStartRow);

    const normalTemplateCells = Array.from({ length: map.maxCol + 1 }, (_, col) =>
      cloneTemplateCell(projectSheet[getCellAddress(col, dataStartRow)] as XLSX.CellObject | undefined),
    );
    const subtotalTemplateCells = Array.from({ length: map.maxCol + 1 }, (_, col) =>
      cloneTemplateCell(projectSheet[getCellAddress(col, subtotalTemplateRow)] as XLSX.CellObject | undefined) ??
      normalTemplateCells[col],
    );

    setCellValue({
      sheet: projectSheet,
      col: map.no,
      row: 1,
      value: `PROJECT KMP CIANJUR DS ${project.name.toUpperCase()}`,
      templateCell: normalTemplateCells[map.no],
    });

    const projectRows = data.project_expenses
      .filter((row) => row.project_id === project.id)
      .slice()
      .sort((a, b) => {
        if (a.expense_date !== b.expense_date) {
          return a.expense_date.localeCompare(b.expense_date);
        }
        return (a.requester_name ?? "").localeCompare(b.requester_name ?? "");
      });

    const opsCol = selectOpsColumn(map);
    const groupedByMonth = new Map<string, ExpenseRow[]>();
    for (const row of projectRows) {
      const monthKey = row.expense_date.slice(0, 7);
      if (!groupedByMonth.has(monthKey)) {
        groupedByMonth.set(monthKey, []);
      }
      groupedByMonth.get(monthKey)?.push(row);
    }

    let rowPointer = dataStartRow;
    let rowNo = 1;
    for (const [monthKey, monthRows] of groupedByMonth.entries()) {
      const monthTotals = { material: 0, alat: 0, upah: 0, ops: 0, total: 0 };
      for (const row of monthRows) {
        const split = splitExpenseByCategory(row.category, row.amount);
        monthTotals.material += split.material;
        monthTotals.alat += split.alat;
        monthTotals.upah += split.upah;
        monthTotals.ops += split.ops;
        monthTotals.total += row.amount;

        setCellValue({
          sheet: projectSheet,
          col: map.no,
          row: rowPointer,
          value: rowNo,
          templateCell: normalTemplateCells[map.no],
        });
        setCellValue({
          sheet: projectSheet,
          col: map.requester,
          row: rowPointer,
          value: row.requester_name ?? "",
          templateCell: normalTemplateCells[map.requester],
        });
        setCellValue({
          sheet: projectSheet,
          col: map.date,
          row: rowPointer,
          value: formatDetailDate(row.expense_date),
          templateCell: normalTemplateCells[map.date],
        });
        setCellValue({
          sheet: projectSheet,
          col: map.description,
          row: rowPointer,
          value: row.description ?? "",
          templateCell: normalTemplateCells[map.description],
        });
        setCellValue({
          sheet: projectSheet,
          col: map.qty,
          row: rowPointer,
          value: row.quantity > 0 ? row.quantity : null,
          templateCell: normalTemplateCells[map.qty],
        });
        setCellValue({
          sheet: projectSheet,
          col: map.unit,
          row: rowPointer,
          value: row.unit_label ?? "",
          templateCell: normalTemplateCells[map.unit],
        });
        setCellValue({
          sheet: projectSheet,
          col: map.usage,
          row: rowPointer,
          value: row.usage_info ?? "",
          templateCell: normalTemplateCells[map.usage],
        });
        setCellValue({
          sheet: projectSheet,
          col: map.unitPrice,
          row: rowPointer,
          value: row.unit_price > 0 ? row.unit_price : null,
          templateCell: normalTemplateCells[map.unitPrice],
        });
        if (map.material != null) {
          setCellValue({
            sheet: projectSheet,
            col: map.material,
            row: rowPointer,
            value: split.material > 0 ? split.material : null,
            templateCell: normalTemplateCells[map.material],
          });
        }
        if (map.alat != null) {
          setCellValue({
            sheet: projectSheet,
            col: map.alat,
            row: rowPointer,
            value: split.alat > 0 ? split.alat : null,
            templateCell: normalTemplateCells[map.alat],
          });
        }
        if (map.upah != null) {
          setCellValue({
            sheet: projectSheet,
            col: map.upah,
            row: rowPointer,
            value: split.upah > 0 ? split.upah : null,
            templateCell: normalTemplateCells[map.upah],
          });
        }
        if (opsCol != null) {
          setCellValue({
            sheet: projectSheet,
            col: opsCol,
            row: rowPointer,
            value: split.ops > 0 ? split.ops : null,
            templateCell: normalTemplateCells[opsCol],
          });
        }
        if (map.total != null) {
          setCellValue({
            sheet: projectSheet,
            col: map.total,
            row: rowPointer,
            value: row.amount > 0 ? row.amount : null,
            templateCell: normalTemplateCells[map.total],
          });
        }

        rowPointer += 1;
        rowNo += 1;
      }

      setCellValue({
        sheet: projectSheet,
        col: map.no,
        row: rowPointer,
        value: `TOTAL PENGELUARAN COST ${formatMonthLabel(monthKey)}`,
        templateCell: subtotalTemplateCells[map.no],
      });
      if (map.material != null) {
        setCellValue({
          sheet: projectSheet,
          col: map.material,
          row: rowPointer,
          value: monthTotals.material > 0 ? monthTotals.material : null,
          templateCell: subtotalTemplateCells[map.material],
        });
      }
      if (map.alat != null) {
        setCellValue({
          sheet: projectSheet,
          col: map.alat,
          row: rowPointer,
          value: monthTotals.alat > 0 ? monthTotals.alat : null,
          templateCell: subtotalTemplateCells[map.alat],
        });
      }
      if (map.upah != null) {
        setCellValue({
          sheet: projectSheet,
          col: map.upah,
          row: rowPointer,
          value: monthTotals.upah > 0 ? monthTotals.upah : null,
          templateCell: subtotalTemplateCells[map.upah],
        });
      }
      if (opsCol != null) {
        setCellValue({
          sheet: projectSheet,
          col: opsCol,
          row: rowPointer,
          value: monthTotals.ops > 0 ? monthTotals.ops : null,
          templateCell: subtotalTemplateCells[opsCol],
        });
      }
      if (map.total != null) {
        setCellValue({
          sheet: projectSheet,
          col: map.total,
          row: rowPointer,
          value: monthTotals.total > 0 ? monthTotals.total : null,
          templateCell: subtotalTemplateCells[map.total],
        });
      }
      rowPointer += 1;
    }

    const range = XLSX.utils.decode_range(projectSheet["!ref"] ?? "A1:Z12");
    range.e.r = Math.max(2, rowPointer - 1);
    projectSheet["!ref"] = XLSX.utils.encode_range(range);

    const sheetName = ensureUniqueSheetName(project.name, usedNames);
    XLSX.utils.book_append_sheet(workbook, projectSheet, sheetName);
  }
}

function writeWorkbookFile(workbook: XLSX.WorkBook) {
  ensureDirectory();
  const maxAttempts = 12;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const tempPath = path.join(
      path.dirname(excelDbPath),
      `.${path.basename(excelDbPath, path.extname(excelDbPath))}.${process.pid}.${Date.now()}.${attempt}.tmp.xlsx`,
    );
    try {
      XLSX.writeFile(workbook, tempPath);
      fs.copyFileSync(tempPath, excelDbPath);
      fs.rmSync(tempPath, { force: true });
      return;
    } catch (error) {
      lastError = error;
      fs.rmSync(tempPath, { force: true });

      if (!isLockedFileError(error) || attempt === maxAttempts) {
        break;
      }

      sleep(Math.min(180 * attempt, 1600));
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : "Unknown error saat menyimpan file Excel.";
  throw new Error(
    `Gagal menyimpan database Excel di "${excelDbPath}". Pastikan file tidak sedang dibuka di Excel/Drive sync. Detail: ${message}`,
  );
}

function resolveDetailTemplatePath() {
  const envTemplatePath = process.env.EXCEL_TEMPLATE_PATH?.trim();
  if (envTemplatePath && fs.existsSync(envTemplatePath)) {
    return envTemplatePath;
  }

  const preferredPaths = [
    path.join(process.cwd(), "data", "admin-web-template.xlsx"),
    path.join(process.cwd(), "data", "admin-web.xlsx"),
  ];
  for (const candidatePath of preferredPaths) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function readDetailTemplateWorkbook() {
  const templatePath = resolveDetailTemplatePath();
  return templatePath
    ? XLSX.readFile(templatePath, { cellStyles: true })
    : XLSX.utils.book_new();
}

function toDetailWorkbookData(input: DetailReportWorkbookInput): ExcelDb {
  const now = new Date().toISOString();
  return {
    projects: input.projects.map((project) => ({
      id: project.id,
      name: project.name,
      code: null,
      client_name: null,
      start_date: null,
      status: "aktif",
      created_at: now,
    })),
    project_expenses: input.project_expenses.map((expense) => ({
      id: randomUUID(),
      project_id: expense.project_id,
      category: expense.category,
      specialist_type: null,
      requester_name: expense.requester_name,
      description: expense.description,
      recipient_name: null,
      quantity: expense.quantity,
      unit_label: expense.unit_label,
      usage_info: expense.usage_info,
      unit_price: expense.unit_price,
      amount: expense.amount,
      expense_date: expense.expense_date,
      created_at: now,
    })),
    attendance_records: [],
    payroll_resets: [],
  };
}

export function createDetailReportWorkbook(input: DetailReportWorkbookInput) {
  const workbook = XLSX.utils.book_new();
  const templateWorkbook = readDetailTemplateWorkbook();
  const data = toDetailWorkbookData(input);
  appendProjectDetailSheets(workbook, templateWorkbook, data);
  return workbook;
}

function writeDatabase(data: ExcelDb) {
  const workbook = XLSX.utils.book_new();
  const templateWorkbook = readDetailTemplateWorkbook();
  appendProjectDetailSheets(workbook, templateWorkbook, data);

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.projects), "projects");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.project_expenses),
    "project_expenses",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.attendance_records),
    "attendance_records",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.payroll_resets),
    "payroll_resets",
  );

  writeWorkbookFile(workbook);
}

export function readExcelDatabase(): ExcelDb {
  const workbook = readWorkbook();
  let projects = parseProjects(getSheetRows(workbook, "projects"));
  let project_expenses = parseExpenses(getSheetRows(workbook, "project_expenses"));
  const attendance_records = parseAttendance(getSheetRows(workbook, "attendance_records"));
  const payroll_resets = parsePayrollResets(getSheetRows(workbook, "payroll_resets"));

  if (projects.length === 0) {
    const seededProjects = seedProjectsFromWorkbook(workbook);
    if (seededProjects.length > 0) {
      projects = seededProjects;
      if (project_expenses.length === 0) {
        project_expenses = seedExpensesFromWorkbook(workbook, projects);
      }
      writeDatabase({
        projects,
        project_expenses,
        attendance_records,
        payroll_resets,
      });
    }
  }

  return {
    projects,
    project_expenses,
    attendance_records,
    payroll_resets,
  };
}

export function insertExcelProject(payload: {
  name: string;
  code: string | null;
  client_name: string | null;
  start_date: string | null;
  status: ProjectStatus;
}) {
  const db = readExcelDatabase();
  const row: ProjectRow = {
    id: randomUUID(),
    name: payload.name,
    code: payload.code,
    client_name: payload.client_name,
    start_date: payload.start_date,
    status: payload.status,
    created_at: new Date().toISOString(),
  };

  db.projects.push(row);
  writeDatabase(db);
  return row;
}

export function insertExcelExpense(payload: {
  project_id: string;
  category: CostCategory;
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
}) {
  const db = readExcelDatabase();
  const row: ExpenseRow = {
    id: randomUUID(),
    project_id: payload.project_id,
    category: payload.category,
    specialist_type: payload.specialist_type,
    requester_name: payload.requester_name,
    description: payload.description,
    recipient_name: payload.recipient_name,
    quantity: payload.quantity,
    unit_label: payload.unit_label,
    usage_info: payload.usage_info,
    unit_price: payload.unit_price,
    amount: payload.amount,
    expense_date: payload.expense_date,
    created_at: new Date().toISOString(),
  };

  db.project_expenses.push(row);
  writeDatabase(db);
  return row;
}

export function updateExcelProject(payload: {
  id: string;
  name: string;
  code: string | null;
  client_name: string | null;
  start_date: string | null;
  status: ProjectStatus;
}) {
  const db = readExcelDatabase();
  const index = db.projects.findIndex((row) => row.id === payload.id);
  if (index < 0) {
    return null;
  }

  const existing = db.projects[index];
  const updated: ProjectRow = {
    ...existing,
    name: payload.name,
    code: payload.code,
    client_name: payload.client_name,
    start_date: payload.start_date,
    status: payload.status,
  };

  db.projects[index] = updated;
  writeDatabase(db);
  return updated;
}

export function deleteExcelProject(projectId: string) {
  const db = readExcelDatabase();
  const beforeCount = db.projects.length;
  db.projects = db.projects.filter((row) => row.id !== projectId);
  if (db.projects.length === beforeCount) {
    return false;
  }

  db.project_expenses = db.project_expenses.filter((row) => row.project_id !== projectId);
  db.attendance_records = db.attendance_records.filter((row) => row.project_id !== projectId);
  db.payroll_resets = db.payroll_resets.filter((row) => row.project_id !== projectId);
  writeDatabase(db);
  return true;
}

export function deleteManyExcelProjects(projectIds: string[]) {
  const targets = new Set(projectIds.map((item) => item.trim()).filter((item) => item.length > 0));
  if (targets.size === 0) {
    return 0;
  }

  const db = readExcelDatabase();
  const beforeCount = db.projects.length;
  db.projects = db.projects.filter((row) => !targets.has(row.id));
  const deletedCount = beforeCount - db.projects.length;
  if (deletedCount <= 0) {
    return 0;
  }

  db.project_expenses = db.project_expenses.filter((row) => !targets.has(row.project_id));
  db.attendance_records = db.attendance_records.filter((row) => !targets.has(row.project_id));
  db.payroll_resets = db.payroll_resets.filter((row) => !targets.has(row.project_id));
  writeDatabase(db);
  return deletedCount;
}

export function updateExcelExpense(payload: {
  id: string;
  project_id: string;
  category: CostCategory;
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
}) {
  const db = readExcelDatabase();
  const index = db.project_expenses.findIndex((row) => row.id === payload.id);
  if (index < 0) {
    return null;
  }

  const existing = db.project_expenses[index];
  const updated: ExpenseRow = {
    ...existing,
    project_id: payload.project_id,
    category: payload.category,
    specialist_type: payload.specialist_type,
    requester_name: payload.requester_name,
    description: payload.description,
    recipient_name: payload.recipient_name,
    quantity: payload.quantity,
    unit_label: payload.unit_label,
    usage_info: payload.usage_info,
    unit_price: payload.unit_price,
    amount: payload.amount,
    expense_date: payload.expense_date,
  };

  db.project_expenses[index] = updated;
  writeDatabase(db);
  return updated;
}

export function updateManyExcelExpenses(
  expenseIds: string[],
  payload: Partial<Omit<ExpenseRow, "id" | "created_at">>,
) {
  const targets = new Set(expenseIds.map((item) => item.trim()).filter((item) => item.length > 0));
  if (targets.size === 0) {
    return 0;
  }

  const db = readExcelDatabase();
  let updatedCount = 0;
  db.project_expenses = db.project_expenses.map((row) => {
    if (!targets.has(row.id)) {
      return row;
    }
    updatedCount += 1;
    return {
      ...row,
      ...payload,
    };
  });

  if (updatedCount > 0) {
    writeDatabase(db);
  }
  return updatedCount;
}

export function deleteExcelExpense(expenseId: string) {
  const db = readExcelDatabase();
  const nextRows = db.project_expenses.filter((row) => row.id !== expenseId);
  if (nextRows.length === db.project_expenses.length) {
    return false;
  }

  db.project_expenses = nextRows;
  writeDatabase(db);
  return true;
}

export function insertExcelAttendance(payload: {
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
}) {
  const db = readExcelDatabase();
  const row: AttendanceRow = {
    id: randomUUID(),
    project_id: payload.project_id,
    worker_name: payload.worker_name,
    team_type: payload.team_type,
    specialist_team_name: payload.specialist_team_name,
    status: payload.status,
    work_days: toPositiveInteger(payload.work_days, 1),
    daily_wage: payload.daily_wage,
    overtime_hours: Math.max(0, payload.overtime_hours),
    overtime_wage: Math.max(0, payload.overtime_wage),
    kasbon_amount: payload.kasbon_amount,
    reimburse_type: payload.reimburse_type,
    reimburse_amount: payload.reimburse_amount,
    attendance_date: payload.attendance_date,
    notes: payload.notes,
    created_at: new Date().toISOString(),
  };

  db.attendance_records.push(row);
  writeDatabase(db);
  return row;
}

export function insertManyExcelAttendance(
  payloads: Array<{
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
  }>,
) {
  if (payloads.length === 0) {
    return [];
  }

  const db = readExcelDatabase();
  const now = new Date().toISOString();
  const rows: AttendanceRow[] = payloads.map((payload) => ({
    id: randomUUID(),
    project_id: payload.project_id,
    worker_name: payload.worker_name,
    team_type: payload.team_type,
    specialist_team_name: payload.specialist_team_name,
    status: payload.status,
    work_days: toPositiveInteger(payload.work_days, 1),
    daily_wage: payload.daily_wage,
    overtime_hours: Math.max(0, payload.overtime_hours),
    overtime_wage: Math.max(0, payload.overtime_wage),
    kasbon_amount: payload.kasbon_amount,
    reimburse_type: payload.reimburse_type,
    reimburse_amount: payload.reimburse_amount,
    attendance_date: payload.attendance_date,
    notes: payload.notes,
    created_at: now,
  }));

  db.attendance_records.push(...rows);
  writeDatabase(db);
  return rows;
}

export function updateExcelAttendance(payload: {
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
}) {
  const db = readExcelDatabase();
  const index = db.attendance_records.findIndex((row) => row.id === payload.id);
  if (index < 0) {
    return null;
  }

  const existing = db.attendance_records[index];
  const updated: AttendanceRow = {
    ...existing,
    project_id: payload.project_id,
    worker_name: payload.worker_name,
    team_type: payload.team_type,
    specialist_team_name: payload.specialist_team_name,
    status: payload.status,
    work_days: toPositiveInteger(payload.work_days, 1),
    daily_wage: payload.daily_wage,
    overtime_hours: Math.max(0, payload.overtime_hours),
    overtime_wage: Math.max(0, payload.overtime_wage),
    kasbon_amount: payload.kasbon_amount,
    reimburse_type: payload.reimburse_type,
    reimburse_amount: payload.reimburse_amount,
    attendance_date: payload.attendance_date,
    notes: payload.notes,
  };

  db.attendance_records[index] = updated;
  writeDatabase(db);
  return updated;
}

export function deleteExcelAttendance(attendanceId: string) {
  const db = readExcelDatabase();
  const nextRows = db.attendance_records.filter((row) => row.id !== attendanceId);
  if (nextRows.length === db.attendance_records.length) {
    return false;
  }

  db.attendance_records = nextRows;
  writeDatabase(db);
  return true;
}

export function insertExcelPayrollReset(payload: {
  project_id: string;
  team_type: WorkerTeam;
  specialist_team_name: string | null;
  worker_name: string | null;
  paid_until_date: string;
}) {
  const db = readExcelDatabase();
  const row: PayrollResetRow = {
    id: randomUUID(),
    project_id: payload.project_id,
    team_type: payload.team_type,
    specialist_team_name: payload.specialist_team_name,
    worker_name: payload.worker_name,
    paid_until_date: payload.paid_until_date,
    created_at: new Date().toISOString(),
  };

  db.payroll_resets.push(row);
  writeDatabase(db);
  return row;
}

function resolveImportTemplatePath(templatePath?: string) {
  const explicitPath = templatePath?.trim();
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const envPath = process.env.EXCEL_TEMPLATE_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const localTemplatePath = path.join(process.cwd(), "data", "admin-web-template.xlsx");
  if (fs.existsSync(localTemplatePath)) {
    return localTemplatePath;
  }

  const localDatabasePath = path.join(process.cwd(), "data", "admin-web.xlsx");
  if (fs.existsSync(localDatabasePath)) {
    return localDatabasePath;
  }

  const downloadsDir = path.join(os.homedir(), "Downloads");
  if (fs.existsSync(downloadsDir)) {
    const preferredNames = [
      "RINCIAN COST KMP CIANJUR.xlsx",
      "admin-web-template.xlsx",
    ];
    for (const fileName of preferredNames) {
      const candidatePath = path.join(downloadsDir, fileName);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    const xlsxFiles = fs
      .readdirSync(downloadsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".xlsx"))
      .map((entry) => path.join(downloadsDir, entry.name))
      .sort((a, b) => {
        const statA = fs.statSync(a);
        const statB = fs.statSync(b);
        return statB.mtimeMs - statA.mtimeMs;
      });
    if (xlsxFiles.length > 0) {
      return xlsxFiles[0];
    }
  }

  return null;
}

function parseTemplateWorkbookRows(workbook: XLSX.WorkBook) {
  const internalProjects = parseProjects(getSheetRows(workbook, "projects"));
  const internalExpenses = parseExpenses(getSheetRows(workbook, "project_expenses"));
  const internalProjectIdSet = new Set(internalProjects.map((project) => project.id));
  const normalizedInternalExpenses =
    internalProjectIdSet.size > 0
      ? internalExpenses.filter((expense) => internalProjectIdSet.has(expense.project_id))
      : internalExpenses.filter((expense) => expense.project_id.trim().length > 0);

  const templateProjects = seedProjectsFromWorkbook(workbook);
  const templateExpenses = seedExpensesFromWorkbook(workbook, templateProjects);

  const hasInternal = internalProjects.length > 0 || normalizedInternalExpenses.length > 0;
  const hasTemplate = templateProjects.length > 0 || templateExpenses.length > 0;

  if (hasInternal && hasTemplate) {
    const internalScore = normalizedInternalExpenses.length * 100_000 + internalProjects.length;
    const templateScore = templateExpenses.length * 100_000 + templateProjects.length;
    if (templateScore > internalScore) {
      return {
        projects: templateProjects,
        project_expenses: templateExpenses,
      };
    }
    return {
      projects: internalProjects,
      project_expenses: normalizedInternalExpenses,
    };
  }

  if (hasInternal) {
    return {
      projects: internalProjects,
      project_expenses: normalizedInternalExpenses,
    };
  }

  return {
    projects: templateProjects,
    project_expenses: templateExpenses,
  };
}

function toImportedTemplateData(rows: {
  projects: ProjectRow[];
  project_expenses: ExpenseRow[];
}): ImportedTemplateWorkbookData {
  return {
    projects: rows.projects.map((project) => ({
      id: project.id,
      name: project.name,
      code: project.code,
      client_name: project.client_name,
      start_date: project.start_date,
      status: project.status,
    })),
    project_expenses: rows.project_expenses.map((expense) => ({
      project_id: expense.project_id,
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
    })),
  };
}

export function parseTemplateExcelDataFromBuffer(buffer: Uint8Array) {
  try {
    const workbook = XLSX.read(buffer, { type: "array", cellStyles: true });
    return toImportedTemplateData(parseTemplateWorkbookRows(workbook));
  } catch (error) {
    console.error("Baca template Excel (buffer) gagal:", error);
    return null;
  }
}

export function parseTemplateExcelData(templatePath?: string) {
  const sourcePath = resolveImportTemplatePath(templatePath);
  if (!sourcePath) {
    return null;
  }

  try {
    const workbook = XLSX.readFile(sourcePath, { cellStyles: true });
    return toImportedTemplateData(parseTemplateWorkbookRows(workbook));
  } catch (error) {
    console.error("Baca template Excel gagal:", error);
    return null;
  }
}

function importWorkbookToDatabase(workbook: XLSX.WorkBook) {
  const rows = parseTemplateWorkbookRows(workbook);
  const projects = rows.projects;
  const project_expenses = rows.project_expenses;
  const attendance_records: AttendanceRow[] = [];
  const payroll_resets: PayrollResetRow[] = [];

  const dbData: ExcelDb = {
    projects,
    project_expenses,
    attendance_records,
    payroll_resets,
  };

  for (const sheetName of SHEETS) {
    delete workbook.Sheets[sheetName];
    workbook.SheetNames = workbook.SheetNames.filter((existing) => existing !== sheetName);
  }

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dbData.projects), "projects");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(dbData.project_expenses),
    "project_expenses",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(dbData.attendance_records),
    "attendance_records",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(dbData.payroll_resets),
    "payroll_resets",
  );

  writeWorkbookFile(workbook);

  return {
    imported: true,
    projects: projects.length,
    expenses: project_expenses.length,
  };
}

export function importTemplateExcelDatabaseFromBuffer(buffer: Uint8Array) {
  try {
    const workbook = XLSX.read(buffer, { type: "array", cellStyles: true });
    return importWorkbookToDatabase(workbook);
  } catch (error) {
    console.error("Import template Excel (buffer) gagal:", error);
    return { imported: false, projects: 0, expenses: 0 };
  }
}

export function importTemplateExcelDatabase(templatePath?: string) {
  const sourcePath = resolveImportTemplatePath(templatePath);
  if (!sourcePath) {
    return { imported: false, projects: 0, expenses: 0 };
  }

  try {
    const workbook = XLSX.readFile(sourcePath, { cellStyles: true });
    return importWorkbookToDatabase(workbook);
  } catch (error) {
    console.error("Import template Excel gagal:", error);
    return { imported: false, projects: 0, expenses: 0 };
  }
}
