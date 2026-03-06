import { Buffer } from "node:buffer";
import * as XLSX from "xlsx/xlsx.mjs";
import { createDetailReportWorkbook } from "@/lib/excel-db";
import { getExpenseCategories, getProjectReportDetail, getProjects } from "@/lib/data";
import { canExportReports, getCurrentUser } from "@/lib/auth";
import { buildReportCategoryOptions, buildReportCategoryTotals } from "@/lib/expense-report";

export const runtime = "nodejs";

function appendUniqueSheet(workbook: XLSX.WorkBook, worksheet: XLSX.WorkSheet, baseName: string) {
  const cleanedBase = baseName.replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet";
  let candidate = cleanedBase.slice(0, 31);
  let index = 2;
  const used = new Set(workbook.SheetNames.map((name) => name.toUpperCase()));
  while (used.has(candidate.toUpperCase())) {
    const suffix = ` (${index})`;
    candidate = `${cleanedBase.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    index += 1;
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, candidate);
}

function toFileSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function resolveFilePrefix(projectNames: string[]) {
  const normalized = projectNames.map((item) => toFileSlug(item)).filter((item) => item.length > 0);
  if (normalized.length === 0) {
    return "semua-project";
  }
  if (normalized.length === 1) {
    return normalized[0];
  }
  return `${normalized[0]}-${normalized.length - 1}-project-lain`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canExportReports(user.role)) {
    return new Response("Akses export ditolak untuk role ini.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const selectedOnly = searchParams.get("selected_only") === "1";
  const requestedProjectIds = Array.from(
    new Set(
      searchParams
        .getAll("project")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
  if (selectedOnly && requestedProjectIds.length === 0) {
    return new Response("Pilih minimal satu project untuk Excel rincian biaya.", { status: 400 });
  }

  const allProjects = await getProjects();
  const selectedProjects =
    requestedProjectIds.length > 0
      ? allProjects.filter((project) => requestedProjectIds.includes(project.id))
      : allProjects;
  if (selectedProjects.length === 0) {
    return new Response("Project tidak ditemukan.", { status: 404 });
  }

  const [details, expenseCategories] = await Promise.all([
    Promise.all(selectedProjects.map((project) => getProjectReportDetail(project.id))),
    getExpenseCategories(),
  ]);
  const reportProjects: Array<{ id: string; name: string }> = [];
  const reportExpenses: Array<{
    project_id: string;
    category: string;
    requester_name: string | null;
    description: string | null;
    quantity: number;
    unit_label: string | null;
    usage_info: string | null;
    unit_price: number;
    amount: number;
    expense_date: string;
  }> = [];
  const categoryOptionsByProject: Record<string, Array<{ value: string; label: string }>> = {};
  const summaryRows: Array<Record<string, string | number>> = [];
  const allCategoryValues: string[] = [];

  for (const detail of details) {
    if (!detail) {
      continue;
    }
    const rows = detail.expenses
      .slice()
      .sort((a, b) => {
        if (a.expenseDate !== b.expenseDate) {
          return a.expenseDate.localeCompare(b.expenseDate);
        }
        return (a.requesterName ?? "").localeCompare(b.requesterName ?? "");
      });
    if (rows.length === 0) {
      continue;
    }

    reportProjects.push({
      id: detail.project.id,
      name: detail.project.name,
    });
    const categoryOptions = buildReportCategoryOptions(
      expenseCategories,
      rows.map((row) => row.category),
    );
    categoryOptionsByProject[detail.project.id] = categoryOptions;
    allCategoryValues.push(...rows.map((row) => row.category));
    for (const row of rows) {
      reportExpenses.push({
        project_id: detail.project.id,
        category: row.category,
        requester_name: row.requesterName,
        description: row.description,
        quantity: row.quantity,
        unit_label: row.unitLabel,
        usage_info: row.usageInfo,
        unit_price: row.unitPrice,
        amount: row.amount,
        expense_date: row.expenseDate.slice(0, 10),
      });
    }
  }

  if (reportProjects.length === 0) {
    return new Response("Belum ada data biaya project.", { status: 404 });
  }

  const summaryCategoryOptions = buildReportCategoryOptions(expenseCategories, allCategoryValues);
  const grandTotalsByCategory = Object.fromEntries(
    summaryCategoryOptions.map((item) => [item.value, 0]),
  ) as Record<string, number>;
  let grandTotal = 0;

  for (const detail of details) {
    if (!detail || detail.expenses.length === 0) {
      continue;
    }
    const { totalsByCategory, total } = buildReportCategoryTotals(detail.expenses, summaryCategoryOptions);
    for (const category of summaryCategoryOptions) {
      grandTotalsByCategory[category.value] += totalsByCategory[category.value] ?? 0;
    }
    grandTotal += total;

    const row: Record<string, string | number> = {
      PROJECT: detail.project.name,
    };
    for (const category of summaryCategoryOptions) {
      row[`KATEGORI: ${category.label}`] = totalsByCategory[category.value] ?? 0;
    }
    row.TOTAL = total;
    summaryRows.push(row);
  }

  const workbook = createDetailReportWorkbook({
    projects: reportProjects,
    project_expenses: reportExpenses,
    category_options_by_project: categoryOptionsByProject,
  });

  const totalRow: Record<string, string | number> = {
    PROJECT: "TOTAL",
  };
  for (const category of summaryCategoryOptions) {
    totalRow[`KATEGORI: ${category.label}`] = grandTotalsByCategory[category.value] ?? 0;
  }
  totalRow.TOTAL = grandTotal;
  summaryRows.push(totalRow);

  const summaryHeaders = [
    "PROJECT",
    ...summaryCategoryOptions.map((item) => `KATEGORI: ${item.label}`),
    "TOTAL",
  ];
  const summarySheetRows: Array<Array<string | number>> = [
    ["REKAP KESELURUHAN RINCIAN BIAYA"],
    [`Dicetak ${new Date().toLocaleString("id-ID")}`],
    [],
    summaryHeaders,
    ...summaryRows.map((row) => {
      const values: Array<string | number> = [String(row.PROJECT ?? "")];
      for (const category of summaryCategoryOptions) {
        values.push(Number(row[`KATEGORI: ${category.label}`] ?? 0));
      }
      values.push(Number(row.TOTAL ?? 0));
      return values;
    }),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetRows);
  summarySheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: summaryHeaders.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: summaryHeaders.length - 1 } },
  ];
  summarySheet["!cols"] = [
    { wch: 34 },
    ...summaryCategoryOptions.map(() => ({ wch: 18 })),
    { wch: 20 },
  ];
  appendUniqueSheet(workbook, summarySheet, "Rekap Keseluruhan");

  const infoSheet = XLSX.utils.aoa_to_sheet([
    ["LAPORAN", "RINCIAN BIAYA PROJECT"],
    [
      "FILTER",
      requestedProjectIds.length > 0
        ? `${requestedProjectIds.length} project terpilih`
        : "Semua project",
    ],
    ["DICETAK", new Date().toLocaleString("id-ID")],
  ]);
  infoSheet["!cols"] = [{ wch: 14 }, { wch: 55 }];
  appendUniqueSheet(workbook, infoSheet, "Info");

  const bytes = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  });
  const filePrefix = resolveFilePrefix(reportProjects.map((item) => item.name));
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filePrefix}-rincian-biaya.xlsx\"`,
    },
  });
}
