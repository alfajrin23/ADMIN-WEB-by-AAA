import { Buffer } from "node:buffer";
import XLSX from "@/lib/xlsx-style";
import { getExpenseCategories, getProjectReportDetail, getProjects } from "@/lib/data";
import { canExportReports, getCurrentUser } from "@/lib/auth";
import { buildReportCategoryOptions, buildReportCategoryTotals } from "@/lib/expense-report";
import {
  getExpenseCategoryExcelColor,
  setExcelAutoFilter,
  setExcelPrintLayout,
  setExcelRowHeight,
  styleExcelDataRows,
  styleExcelHeaderRow,
  styleExcelInfoSheet,
  styleExcelSubtitleRow,
  styleExcelTitleRow,
} from "@/lib/excel-export-styles";

export const runtime = "nodejs";

function formatDateTimeText() {
  return new Date().toLocaleString("id-ID");
}

type ProjectSummaryRow = {
  projectName: string;
  totalsByCategory: Record<string, number>;
  total: number;
};

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
  if (!user || !canExportReports(user)) {
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
    return new Response("Pilih minimal satu project untuk Excel terpilih.", { status: 400 });
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
  const detailCategoryValues = details.flatMap(
    (detail) => detail?.expenses.map((expense) => expense.category) ?? [],
  );
  const categoryOptions = buildReportCategoryOptions(expenseCategories, detailCategoryValues);

  const summaryRows: ProjectSummaryRow[] = [];
  for (const detail of details) {
    if (!detail) {
      continue;
    }

    const { totalsByCategory, total } = buildReportCategoryTotals(detail.expenses, categoryOptions);

    summaryRows.push({
      projectName: detail.project.name,
      totalsByCategory,
      total,
    });
  }

  if (summaryRows.length === 0) {
    return new Response("Belum ada data biaya project.", { status: 404 });
  }

  summaryRows.sort((a, b) => b.total - a.total);

  const grandTotalsByCategory = Object.fromEntries(
    categoryOptions.map((item) => [item.value, 0]),
  ) as Record<string, number>;
  let grandTotal = 0;
  for (const row of summaryRows) {
    for (const category of categoryOptions) {
      grandTotalsByCategory[category.value] += row.totalsByCategory[category.value] ?? 0;
    }
    grandTotal += row.total;
  }

  const lastColumn = categoryOptions.length + 2;
  const headerRow = 4;
  const dataStartRow = headerRow + 1;
  const totalRow = dataStartRow + summaryRows.length;
  const reportRows: Array<Array<string | number>> = [
    [summaryRows.length === 1 ? "REKAP BIAYA PROJECT" : "REKAP KESELURUHAN BIAYA PROJECT"],
    [requestedProjectIds.length > 0 ? `${requestedProjectIds.length} project terpilih` : "Semua project"],
    [`Dicetak ${formatDateTimeText()}`],
    [],
    ["NO", "PROJECT", ...categoryOptions.map((item) => item.label.toUpperCase()), "TOTAL"],
    ...summaryRows.map((row, index) => {
      return [
        index + 1,
        row.projectName,
        ...categoryOptions.map((category) => row.totalsByCategory[category.value] ?? 0),
        row.total,
      ];
    }),
    ["", "TOTAL", ...categoryOptions.map((item) => grandTotalsByCategory[item.value] ?? 0), grandTotal],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(reportRows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastColumn } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastColumn } },
  ];
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 36 },
    ...categoryOptions.map((item) => ({ wch: Math.max(16, Math.min(24, item.label.length + 4)) })),
    { wch: 20 },
  ];
  const categoryHeaderFills = Object.fromEntries(
    categoryOptions.map((category, index) => [
      index + 2,
      getExpenseCategoryExcelColor(category.value),
    ]),
  );
  styleExcelTitleRow(worksheet, 0, 0, lastColumn);
  styleExcelSubtitleRow(worksheet, 1, 0, lastColumn);
  styleExcelSubtitleRow(worksheet, 2, 0, lastColumn);
  styleExcelHeaderRow(worksheet, headerRow, 0, lastColumn, {
    fills: categoryHeaderFills,
    totalColumn: lastColumn,
  });
  styleExcelDataRows(worksheet, {
    startRow: dataStartRow,
    endRow: totalRow,
    firstColumn: 0,
    lastColumn,
    columns: [
      { column: 0, format: "integer", align: "center" },
      { column: 1, wrapText: true },
      ...categoryOptions.map((category, index) => ({
        column: index + 2,
        format: "currency" as const,
        align: "right" as const,
        fill: getExpenseCategoryExcelColor(category.value),
      })),
      { column: lastColumn, format: "currency", align: "right", fill: "E2F0D9" },
    ],
    grandTotalRows: [totalRow],
  });
  setExcelRowHeight(worksheet, 0, 32);
  setExcelRowHeight(worksheet, 1, 22);
  setExcelRowHeight(worksheet, 2, 22);
  setExcelRowHeight(worksheet, headerRow, 38);
  for (let row = dataStartRow; row <= totalRow; row += 1) {
    setExcelRowHeight(worksheet, row, 22);
  }
  setExcelAutoFilter(worksheet, headerRow, 0, totalRow - 1, lastColumn);
  setExcelPrintLayout(worksheet);

  const workbook = XLSX.utils.book_new();
  const firstProjectName = summaryRows[0]?.projectName ?? "Project";
  const recapSheetName = summaryRows.length === 1 ? `${firstProjectName} Rekap` : "Rekap Biaya";
  XLSX.utils.book_append_sheet(workbook, worksheet, recapSheetName.slice(0, 31));

  const metaRows = [
    [
      "LAPORAN",
      summaryRows.length === 1
        ? `REKAP BIAYA PROJECT ${firstProjectName}`
        : "REKAP BIAYA PROJECT",
    ],
    ["FILTER", requestedProjectIds.length > 0 ? `${requestedProjectIds.length} project terpilih` : "Semua project"],
    ["DICETAK", formatDateTimeText()],
  ];
  const metaSheet = XLSX.utils.aoa_to_sheet(metaRows);
  metaSheet["!cols"] = [{ wch: 14 }, { wch: 50 }];
  styleExcelInfoSheet(metaSheet, metaRows.length);
  XLSX.utils.book_append_sheet(workbook, metaSheet, "Info");

  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellStyles: true });
  const filePrefix = resolveFilePrefix(summaryRows.map((item) => item.projectName));
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filePrefix}-rekap-biaya.xlsx\"`,
    },
  });
}
