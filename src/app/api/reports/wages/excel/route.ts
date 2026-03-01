import { Buffer } from "node:buffer";
import * as XLSX from "xlsx/xlsx.mjs";
import { canExportReports, getCurrentUser } from "@/lib/auth";
import { buildWageReportData } from "@/lib/wage-report";
import { formatCurrency } from "@/lib/format";

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  return Number.isInteger(value) ? String(value) : value.toLocaleString("id-ID");
}

function makeMerge(startRow: number, startCol: number, endRow: number, endCol: number): XLSX.Range {
  return {
    s: { r: startRow, c: startCol },
    e: { r: endRow, c: endCol },
  };
}

function getGeneratedDateLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function getGeneratedFileDate() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function buildDescriptionText(params: {
  exportMode: "selected" | "project" | "specialist";
  notes: string[];
  projectNames: string[];
}) {
  const notesText = params.notes.join(", ");
  if (params.exportMode !== "specialist") {
    return notesText || "-";
  }
  const projectLabel =
    params.projectNames.length > 0 ? `Project: ${params.projectNames.join(", ")}` : "Project: -";
  return notesText ? `${projectLabel} | ${notesText}` : projectLabel;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canExportReports(user.role)) {
    return new Response("Akses export ditolak untuk role ini.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const result = await buildWageReportData(searchParams);
  if (!result.ok) {
    return new Response(result.message, { status: result.status });
  }

  const {
    to,
    exportMode,
    reportTitle,
    workers,
    reimburseRows,
    totalUpah,
    totalLembur,
    totalKasbon,
    totalReimburse,
    subtotal,
    totalKeseluruhan,
  } = result.data;
  const generatedDateLabel = getGeneratedDateLabel();
  const generatedFileDate = getGeneratedFileDate();

  const rows: Array<Array<string | number>> = [];
  const merges: XLSX.Range[] = [];

  rows.push([reportTitle.toUpperCase()]);
  merges.push(makeMerge(0, 0, 0, 10));
  rows.push([`TANGGAL CETAK ${generatedDateLabel}`]);
  merges.push(makeMerge(1, 0, 1, 10));
  rows.push([]);

  rows.push([
    "NO",
    "NAMA PEKERJA",
    "HARI KERJA",
    "LEMBUR (JAM)",
    "UPAH LEMBUR",
    "TOTAL UPAH LEMBUR",
    "UPAH/HARI",
    "JUMLAH UPAH",
    "KASBON (Rp)",
    "KETERANGAN",
    "TOTAL DIBAYAR (Rp)",
  ]);

  if (workers.length === 0) {
    rows.push([
      "1",
      "-",
      "0",
      "0",
      formatCurrency(0),
      formatCurrency(0),
      formatCurrency(0),
      formatCurrency(0),
      formatCurrency(0),
      "-",
      formatCurrency(0),
    ]);
  } else {
    workers.forEach((row, index) => {
      rows.push([
        String(index + 1),
        row.workerName,
        String(row.daysWorked),
        formatHours(row.overtimeHours),
        formatCurrency(row.overtimeRate),
        formatCurrency(row.totalOvertimePay),
        formatCurrency(row.dailyRate),
        formatCurrency(row.totalWage),
        formatCurrency(row.totalKasbon),
        buildDescriptionText({ exportMode, notes: row.notes, projectNames: row.projectNames }),
        formatCurrency(row.totalPaid),
      ]);
    });
  }

  const summaryRowStart = rows.length;
  rows.push(["JUMLAH UPAH", "", "", "", "", "", "", "", "", "", formatCurrency(totalUpah)]);
  rows.push(["JUMLAH LEMBUR", "", "", "", "", "", "", "", "", "", formatCurrency(totalLembur)]);
  rows.push([
    "REIMBURSE MATERIAL",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    formatCurrency(totalReimburse),
  ]);
  rows.push(["SUBTOTAL", "", "", "", "", "", "", "", "", "", formatCurrency(subtotal)]);
  rows.push(["KASBON TEAM (JIKA ADA)", "", "", "", "", "", "", "", "", "", formatCurrency(totalKasbon)]);
  rows.push([
    "TOTAL KESELURUHAN",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    formatCurrency(totalKeseluruhan),
  ]);
  for (let i = 0; i < 6; i += 1) {
    merges.push(makeMerge(summaryRowStart + i, 0, summaryRowStart + i, 9));
  }

  rows.push([]);
  const reimburseTitleRow = rows.length;
  rows.push(["REIMBURSE"]);
  merges.push(makeMerge(reimburseTitleRow, 0, reimburseTitleRow, 5));
  rows.push(["NO", "TANGGAL", "KETERANGAN", "QTY", "HARGA SATUAN", "TOTAL"]);

  const printableReimburseRows =
    reimburseRows.length > 0
      ? reimburseRows
      : [{ date: to, description: "Tidak ada reimburse", qty: 0, unitPrice: 0, total: 0 }];

  printableReimburseRows.forEach((row, index) => {
    rows.push([
      String(index + 1),
      row.date,
      row.description,
      String(row.qty || 0),
      formatCurrency(row.unitPrice),
      formatCurrency(row.total),
    ]);
  });

  const reimburseTotalRow = rows.length;
  rows.push(["TOTAL REIMBURSE", "", "", "", "", formatCurrency(totalReimburse)]);
  merges.push(makeMerge(reimburseTotalRow, 0, reimburseTotalRow, 4));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!merges"] = merges;
  sheet["!cols"] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 36 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Rekap Upah");

  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rekap-upah-${generatedFileDate}.xlsx"`,
    },
  });
}
