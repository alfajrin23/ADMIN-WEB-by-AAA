import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { canExportReports, getCurrentUser } from "@/lib/auth";
import { buildWageReportData } from "@/lib/wage-report";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  return Number.isInteger(value) ? String(value) : value.toLocaleString("id-ID");
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

function drawCell(params: {
  page: PDFPageLike;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font: PDFFontLike;
  size?: number;
  align?: "left" | "center" | "right";
  fill?: [number, number, number];
}) {
  const size = params.size ?? 8;
  params.page.drawRectangle({
    x: params.x,
    y: params.y - params.h,
    width: params.w,
    height: params.h,
    color: params.fill ? rgb(params.fill[0], params.fill[1], params.fill[2]) : undefined,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 0.8,
  });

  const textWidth = params.font.widthOfTextAtSize(params.text, size);
  let textX = params.x + 4;
  if (params.align === "center") {
    textX = params.x + (params.w - textWidth) / 2;
  } else if (params.align === "right") {
    textX = params.x + params.w - textWidth - 4;
  }

  params.page.drawText(params.text, {
    x: textX,
    y: params.y - params.h + (params.h - size) / 2,
    size,
    font: params.font,
    color: rgb(0.08, 0.11, 0.14),
  });
}

type PDFPageLike = Awaited<ReturnType<PDFDocument["addPage"]>>;
type PDFFontLike = Awaited<ReturnType<PDFDocument["embedFont"]>>;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canExportReports(user.role)) {
    return new Response("Akses export ditolak untuk role ini.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get("preview") === "1";
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

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [1191, 842];
  const margin = 24;
  const tableRow = 22;
  const tableCols = [30, 120, 62, 62, 84, 96, 84, 94, 100, 140, 110];
  const reimburseCols = [30, 90, 380, 70, 150, 150];

  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawMainHeader = () => {
    page.drawText(reportTitle, {
      x: margin,
      y,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.12, 0.16),
    });
    y -= 24;
    page.drawText(`TANGGAL CETAK ${generatedDateLabel}`, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.3, 0.32, 0.35),
    });
    y -= 16;

    const headers = [
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
    ];

    let x = margin;
    headers.forEach((item, index) => {
      drawCell({
        page,
        text: item,
        x,
        y,
        w: tableCols[index],
        h: tableRow + 2,
        font: bold,
        align: "center",
        fill: [0.86, 0.86, 0.86],
      });
      x += tableCols[index];
    });
    y -= tableRow + 2;
  };

  drawMainHeader();

  const ensureMainSpace = () => {
    if (y < margin + tableRow * 5) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
      drawMainHeader();
    }
  };

  workers.forEach((row, index) => {
    ensureMainSpace();
    const values = [
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
    ];

    let x = margin;
    values.forEach((value, cellIndex) => {
      const align = cellIndex === 0 ? "center" : cellIndex >= 2 && cellIndex !== 9 ? "right" : "left";
      drawCell({
        page,
        text: value,
        x,
        y,
        w: tableCols[cellIndex],
        h: tableRow,
        font,
        align,
      });
      x += tableCols[cellIndex];
    });
    y -= tableRow;
  });

  const labelWidth = tableCols.slice(0, 10).reduce((sum, width) => sum + width, 0);
  const totalColumnWidth = tableCols[10];

  const drawSummaryRow = (label: string, value: number, fill?: [number, number, number]) => {
    ensureMainSpace();
    drawCell({
      page,
      text: label,
      x: margin,
      y,
      w: labelWidth,
      h: tableRow,
      font: bold,
      align: "right",
      fill,
    });
    drawCell({
      page,
      text: formatCurrency(value),
      x: margin + labelWidth,
      y,
      w: totalColumnWidth,
      h: tableRow,
      font: bold,
      align: "right",
      fill,
    });
    y -= tableRow;
  };

  drawSummaryRow("JUMLAH UPAH", totalUpah);
  drawSummaryRow("JUMLAH LEMBUR", totalLembur);
  drawSummaryRow("REIMBURSE MATERIAL", totalReimburse);
  drawSummaryRow("SUBTOTAL", subtotal, [1, 0.98, 0.35]);
  drawSummaryRow("KASBON TEAM (JIKA ADA)", totalKasbon, [0.95, 0.27, 0.27]);
  drawSummaryRow("TOTAL KESELURUHAN", totalKeseluruhan, [0.72, 0.82, 0.91]);
  y -= 24;

  if (y < 250) {
    page = pdf.addPage(pageSize);
    y = page.getHeight() - margin;
  }

  page.drawText("REIMBURSE", {
    x: margin,
    y,
    size: 14,
    font: bold,
    color: rgb(0.1, 0.12, 0.16),
  });
  y -= 18;

  const reimbHeaders = ["NO", "TANGGAL", "KETERANGAN", "QTY", "HARGA SATUAN", "TOTAL"];
  let x = margin;
  reimbHeaders.forEach((item, index) => {
    drawCell({
      page,
      text: item,
      x,
      y,
      w: reimburseCols[index],
      h: tableRow + 2,
      font: bold,
      align: "center",
      fill: [0.9, 0.9, 0.9],
    });
    x += reimburseCols[index];
  });
  y -= tableRow + 2;

  const printableReimburseRows =
    reimburseRows.length > 0
      ? reimburseRows
      : [{ date: to, description: "Tidak ada reimburse", qty: 0, unitPrice: 0, total: 0 }];

  printableReimburseRows.forEach((row, index) => {
    if (y < margin + tableRow * 3) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
    }
    const values = [
      String(index + 1),
      row.date,
      row.description,
      String(row.qty || 0),
      formatCurrency(row.unitPrice),
      formatCurrency(row.total),
    ];
    let cellX = margin;
    values.forEach((value, cellIndex) => {
      drawCell({
        page,
        text: value,
        x: cellX,
        y,
        w: reimburseCols[cellIndex],
        h: tableRow,
        font,
        align: cellIndex >= 3 ? "right" : cellIndex === 0 ? "center" : "left",
      });
      cellX += reimburseCols[cellIndex];
    });
    y -= tableRow;
  });

  drawCell({
    page,
    text: "TOTAL REIMBURSE",
    x: margin,
    y,
    w: reimburseCols.slice(0, 5).reduce((sum, width) => sum + width, 0),
    h: tableRow,
    font: bold,
    align: "center",
    fill: [1, 0.98, 0.35],
  });
  drawCell({
    page,
    text: formatCurrency(totalReimburse),
    x: margin + reimburseCols.slice(0, 5).reduce((sum, width) => sum + width, 0),
    y,
    w: reimburseCols[5],
    h: tableRow,
    font: bold,
    align: "right",
    fill: [1, 0.98, 0.35],
  });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename="rekap-upah-${generatedFileDate}.pdf"`,
    },
  });
}
