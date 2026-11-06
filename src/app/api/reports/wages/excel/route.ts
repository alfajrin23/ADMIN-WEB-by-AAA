import { Buffer } from "node:buffer";
import XLSX from "@/lib/xlsx-style";
import type { Range } from "xlsx";
import { canExportReports, getCurrentUser } from "@/lib/auth";
import { buildWageReportData } from "@/lib/wage-report";
import { formatDate } from "@/lib/format";
import {
  EXCEL_REPORT_COLORS,
  setExcelAutoFilter,
  setExcelPrintLayout,
  setExcelRowHeight,
  styleExcelDataRows,
  styleExcelHeaderRow,
  styleExcelSectionRow,
  styleExcelSubtitleRow,
  styleExcelTitleRow,
} from "@/lib/excel-export-styles";

function makeMerge(startRow: number, startCol: number, endRow: number, endCol: number): Range {
  return {
    s: { r: startRow, c: startCol },
    e: { r: endRow, c: endCol },
  };
}

function getGeneratedFileDate() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function getReportDateLabel() {
  return `TANGGAL ${new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  })
    .format(new Date())
    .toUpperCase()}`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canExportReports(user)) {
    return new Response("Akses export ditolak untuk role ini.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const result = await buildWageReportData(searchParams);
  if (!result.ok) {
    return new Response(result.message, { status: result.status });
  }

  const {
    workers,
    reimburseRows,
    reportTitle,
    totalUpah,
    totalLembur,
    totalKasbon,
    totalReimburse,
    subtotal,
    totalKeseluruhan,
  } = result.data;
  const generatedFileDate = getGeneratedFileDate();

  const rows: Array<Array<string | number>> = [];
  const merges: Range[] = [];

  rows.push([reportTitle.toUpperCase()]);
  merges.push(makeMerge(0, 0, 0, 9));
  rows.push([getReportDateLabel()]);
  merges.push(makeMerge(1, 0, 1, 9));
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
    "TOTAL DIBAYAR (Rp)",
  ]);

  const printableWorkers =
    workers.length > 0
      ? workers
      : [
          {
            workerName: "-",
            daysWorked: 0,
            overtimeHours: 0,
            overtimeRate: 0,
            totalOvertimePay: 0,
            dailyRate: 0,
            totalWage: 0,
            totalKasbon: 0,
            totalPaid: 0,
            projectNames: [],
            notes: [],
          },
        ];

  printableWorkers.forEach((row, index) => {
    rows.push([
      index + 1,
      row.workerName,
      row.daysWorked,
      row.overtimeHours,
      row.overtimeRate,
      row.totalOvertimePay,
      row.dailyRate,
      row.totalWage,
      row.totalKasbon,
      row.totalPaid,
    ]);
  });

  const summaryRowStart = rows.length;
  rows.push(["JUMLAH UPAH", "", "", "", "", "", "", "", "", totalUpah]);
  rows.push(["JUMLAH LEMBUR", "", "", "", "", "", "", "", "", totalLembur]);
  rows.push(["REIMBURSE MATERIAL", "", "", "", "", "", "", "", "", totalReimburse]);
  rows.push(["SUBTOTAL", "", "", "", "", "", "", "", "", subtotal]);
  rows.push(["KASBON TEAM (JIKA ADA)", "", "", "", "", "", "", "", "", totalKasbon]);
  rows.push(["TOTAL KESELURUHAN", "", "", "", "", "", "", "", "", totalKeseluruhan]);
  for (let i = 0; i < 6; i += 1) {
    merges.push(makeMerge(summaryRowStart + i, 0, summaryRowStart + i, 8));
  }

  rows.push([]);
  const reimburseTitleRow = rows.length;
  rows.push(["REIMBURSE"]);
  merges.push(makeMerge(reimburseTitleRow, 0, reimburseTitleRow, 5));
  rows.push(["NO", "TANGGAL", "KETERANGAN", "QTY", "HARGA SATUAN", "TOTAL"]);

  const printableReimburseRows =
    reimburseRows.length > 0
      ? reimburseRows
      : [{ date: generatedFileDate, description: "-", qty: 0, unitPrice: 0, total: 0 }];

  printableReimburseRows.forEach((row, index) => {
    rows.push([
      index + 1,
      formatDate(row.date),
      row.description,
      row.qty || 0,
      row.unitPrice,
      row.total,
    ]);
  });

  const reimburseTotalRow = rows.length;
  rows.push(["TOTAL REIMBURSE", "", "", "", "", totalReimburse]);
  merges.push(makeMerge(reimburseTotalRow, 0, reimburseTotalRow, 4));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!merges"] = merges;
  sheet["!cols"] = [
    { wch: 6 },
    { wch: 30 },
    { wch: 12 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
  ];
  const workerHeaderRow = 3;
  const workerStartRow = workerHeaderRow + 1;
  const workerEndRow = workerStartRow + printableWorkers.length - 1;
  const summaryRows = Array.from({ length: 6 }, (_, index) => summaryRowStart + index);
  styleExcelTitleRow(sheet, 0, 0, 9, 15);
  styleExcelSubtitleRow(sheet, 1, 0, 9);
  styleExcelHeaderRow(sheet, workerHeaderRow, 0, 9, {
    fills: {
      2: EXCEL_REPORT_COLORS.paleBlue,
      3: "E4DFEC",
      4: "FCE4D6",
      5: "FCE4D6",
      6: EXCEL_REPORT_COLORS.paleGreen,
      7: EXCEL_REPORT_COLORS.paleGreen,
      8: "F4CCCC",
    },
    totalColumn: 9,
  });
  styleExcelDataRows(sheet, {
    startRow: workerStartRow,
    endRow: workerEndRow,
    firstColumn: 0,
    lastColumn: 9,
    columns: [
      { column: 0, format: "integer", align: "center" },
      { column: 1, wrapText: true },
      { column: 2, format: "decimal", align: "right" },
      { column: 3, format: "decimal", align: "right" },
      ...[4, 5, 6, 7, 8, 9].map((column) => ({
        column,
        format: "currency" as const,
        align: "right" as const,
        fill: column === 9 ? EXCEL_REPORT_COLORS.paleGreen : undefined,
      })),
    ],
  });
  styleExcelDataRows(sheet, {
    startRow: summaryRows[0]!,
    endRow: summaryRows[summaryRows.length - 1]!,
    firstColumn: 0,
    lastColumn: 9,
    columns: [{ column: 9, format: "currency", align: "right" }],
    totalRows: summaryRows.slice(0, -1),
    grandTotalRows: [summaryRows.at(-1)!],
  });
  styleExcelSectionRow(sheet, reimburseTitleRow, 0, 5);
  const reimburseHeaderRow = reimburseTitleRow + 1;
  const reimburseStartRow = reimburseHeaderRow + 1;
  styleExcelHeaderRow(sheet, reimburseHeaderRow, 0, 5, {
    fills: { 1: EXCEL_REPORT_COLORS.paleBlue, 2: "FFF2CC", 3: EXCEL_REPORT_COLORS.paleGreen },
    totalColumn: 5,
  });
  styleExcelDataRows(sheet, {
    startRow: reimburseStartRow,
    endRow: reimburseTotalRow,
    firstColumn: 0,
    lastColumn: 5,
    columns: [
      { column: 0, format: "integer", align: "center" },
      { column: 1, align: "center" },
      { column: 2, wrapText: true },
      { column: 3, format: "decimal", align: "right" },
      { column: 4, format: "currency", align: "right" },
      { column: 5, format: "currency", align: "right" },
    ],
    totalRows: [reimburseTotalRow],
  });
  setExcelRowHeight(sheet, 0, 32);
  setExcelRowHeight(sheet, 1, 22);
  setExcelRowHeight(sheet, workerHeaderRow, 42);
  for (let row = workerStartRow; row <= reimburseTotalRow; row += 1) {
    if (row !== reimburseTitleRow && row !== reimburseHeaderRow) {
      setExcelRowHeight(sheet, row, row >= reimburseStartRow ? 30 : 22);
    }
  }
  setExcelAutoFilter(sheet, workerHeaderRow, 0, workerEndRow, 9);
  setExcelPrintLayout(sheet);
  XLSX.utils.book_append_sheet(workbook, sheet, "Rekap Upah");

  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellStyles: true });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rekap-upah-${generatedFileDate}.xlsx"`,
    },
  });
}
