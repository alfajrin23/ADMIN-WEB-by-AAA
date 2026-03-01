import { Buffer } from "node:buffer";
import * as XLSX from "xlsx/xlsx.mjs";
import { createDetailReportWorkbook } from "@/lib/excel-db";
import { getProjectDetail, getProjects } from "@/lib/data";
import { canExportReports, getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

type SummaryTotals = {
  material: number;
  alat: number;
  upah: number;
  ops: number;
  total: number;
};

function splitTotalsByCategory(category: string, amount: number): SummaryTotals {
  if (category === "material") {
    return { material: amount, alat: 0, upah: 0, ops: 0, total: amount };
  }
  if (category === "alat") {
    return { material: 0, alat: amount, upah: 0, ops: 0, total: amount };
  }
  if (
    category === "upah_kasbon_tukang" ||
    category === "upah_staff_pelaksana" ||
    category === "upah_tim_spesialis"
  ) {
    return { material: 0, alat: 0, upah: amount, ops: 0, total: amount };
  }
  return { material: 0, alat: 0, upah: 0, ops: amount, total: amount };
}

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

  const details = await Promise.all(selectedProjects.map((project) => getProjectDetail(project.id)));
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
  const summaryRows: Array<Record<string, string | number>> = [];
  const grandTotals: SummaryTotals = { material: 0, alat: 0, upah: 0, ops: 0, total: 0 };

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

    const projectTotals: SummaryTotals = { material: 0, alat: 0, upah: 0, ops: 0, total: 0 };
    for (const row of rows) {
      const split = splitTotalsByCategory(row.category, row.amount);
      projectTotals.material += split.material;
      projectTotals.alat += split.alat;
      projectTotals.upah += split.upah;
      projectTotals.ops += split.ops;
      projectTotals.total += split.total;
    }
    grandTotals.material += projectTotals.material;
    grandTotals.alat += projectTotals.alat;
    grandTotals.upah += projectTotals.upah;
    grandTotals.ops += projectTotals.ops;
    grandTotals.total += projectTotals.total;

    summaryRows.push({
      PROJECT: detail.project.name,
      "COST MATERIAL": projectTotals.material,
      ALAT: projectTotals.alat,
      "COST UPAH/KASBON": projectTotals.upah,
      "COST OPS": projectTotals.ops,
      "PENGELUARAN TOTAL": projectTotals.total,
    });
  }

  if (reportProjects.length === 0) {
    return new Response("Belum ada data biaya project.", { status: 404 });
  }

  const workbook = createDetailReportWorkbook({
    projects: reportProjects,
    project_expenses: reportExpenses,
  });

  summaryRows.push({
    PROJECT: "TOTAL",
    "COST MATERIAL": grandTotals.material,
    ALAT: grandTotals.alat,
    "COST UPAH/KASBON": grandTotals.upah,
    "COST OPS": grandTotals.ops,
    "PENGELUARAN TOTAL": grandTotals.total,
  });
  const summaryHeaders = [
    "PROJECT",
    "COST MATERIAL",
    "ALAT",
    "COST UPAH/KASBON",
    "COST OPS",
    "PENGELUARAN TOTAL",
  ];
  const summarySheetRows: Array<Array<string | number>> = [
    ["REKAP KESELURUHAN RINCIAN BIAYA"],
    [`Dicetak ${new Date().toLocaleString("id-ID")}`],
    [],
    summaryHeaders,
    ...summaryRows.map((row) => [
      String(row.PROJECT ?? ""),
      Number(row["COST MATERIAL"] ?? 0),
      Number(row.ALAT ?? 0),
      Number(row["COST UPAH/KASBON"] ?? 0),
      Number(row["COST OPS"] ?? 0),
      Number(row["PENGELUARAN TOTAL"] ?? 0),
    ]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetRows);
  summarySheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ];
  summarySheet["!cols"] = [
    { wch: 34 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
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
