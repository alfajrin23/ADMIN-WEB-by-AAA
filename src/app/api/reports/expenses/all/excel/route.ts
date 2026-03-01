import { Buffer } from "node:buffer";
import * as XLSX from "xlsx/xlsx.mjs";
import { mergeExpenseCategoryOptions } from "@/lib/constants";
import { getExpenseCategories, getProjectDetail, getProjects } from "@/lib/data";
import { canExportReports, getCurrentUser } from "@/lib/auth";

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
    Promise.all(selectedProjects.map((project) => getProjectDetail(project.id))),
    getExpenseCategories(),
  ]);
  const detailCategoryValues = details
    .flatMap((detail) => detail?.expenses.map((expense) => expense.category) ?? []);
  const categoryOptions = mergeExpenseCategoryOptions(expenseCategories, detailCategoryValues);

  const summaryRows: ProjectSummaryRow[] = [];
  for (const detail of details) {
    if (!detail) {
      continue;
    }

    const totalsByCategory = Object.fromEntries(
      categoryOptions.map((item) => [item.value, 0]),
    ) as Record<string, number>;
    let total = 0;
    for (const expense of detail.expenses) {
      totalsByCategory[expense.category] = (totalsByCategory[expense.category] ?? 0) + expense.amount;
      total += expense.amount;
    }

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

  const sheetRows: Array<Record<string, string | number>> = summaryRows.map((row, index) => {
    const baseRow: Record<string, string | number> = {
      NO: index + 1,
      PROJECT: row.projectName,
    };
    for (const category of categoryOptions) {
      baseRow[`KATEGORI: ${category.label}`] = row.totalsByCategory[category.value] ?? 0;
    }
    baseRow.TOTAL = row.total;
    return baseRow;
  });

  const totalRow: Record<string, string | number> = {
    NO: "",
    PROJECT: "TOTAL",
  };
  for (const category of categoryOptions) {
    totalRow[`KATEGORI: ${category.label}`] = grandTotalsByCategory[category.value] ?? 0;
  }
  totalRow.TOTAL = grandTotal;
  sheetRows.push(totalRow);

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 36 },
    ...categoryOptions.map(() => ({ wch: 18 })),
    { wch: 18 },
  ];

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
  XLSX.utils.book_append_sheet(workbook, metaSheet, "Info");

  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filePrefix = resolveFilePrefix(summaryRows.map((item) => item.projectName));
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filePrefix}-rekap-biaya.xlsx\"`,
    },
  });
}
