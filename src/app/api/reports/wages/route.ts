import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { canExportReports, getCurrentUser } from "@/lib/auth";
import { buildWageReportData } from "@/lib/wage-report";

type PDFPageLike = Awaited<ReturnType<PDFDocument["addPage"]>>;
type PDFFontLike = Awaited<ReturnType<PDFDocument["embedFont"]>>;

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

function fitTextToWidth(text: string, font: PDFFontLike, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return text;
  }

  let safeText = text;
  while (safeText.length > 0) {
    const truncated = `${safeText.slice(0, -1)}...`;
    if (font.widthOfTextAtSize(truncated, size) <= maxWidth) {
      return truncated;
    }
    safeText = safeText.slice(0, -1);
  }

  return "...";
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

  const safeText = fitTextToWidth(params.text, params.font, size, params.w - 8);
  const textWidth = params.font.widthOfTextAtSize(safeText, size);
  let textX = params.x + 4;
  if (params.align === "center") {
    textX = params.x + (params.w - textWidth) / 2;
  } else if (params.align === "right") {
    textX = params.x + params.w - textWidth - 4;
  }

  params.page.drawText(safeText, {
    x: textX,
    y: params.y - params.h + (params.h - size) / 2,
    size,
    font: params.font,
    color: rgb(0.08, 0.11, 0.14),
  });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canExportReports(user)) {
    return new Response("Akses export ditolak untuk role ini.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get("preview") === "1";
  const result = await buildWageReportData(searchParams);
  if (!result.ok) {
    return new Response(result.message, { status: result.status });
  }

  const {
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
  const generatedFileDate = getGeneratedFileDate();
  const reportDateLabel = getReportDateLabel();

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [980, 760];
  const margin = 24;
  const tableRow = 24;
  const tableCols = [34, 185, 64, 68, 92, 100, 92, 102, 92, 103];
  const reimburseCols = [34, 110, 300, 55, 140, 145];
  const titleWidth = pageSize[0] - margin * 2;
  const mainLabelWidth = tableCols.slice(0, 9).reduce((sum, width) => sum + width, 0);
  const mainValueWidth = tableCols[9];
  const reimburseLabelWidth = reimburseCols.slice(0, 5).reduce((sum, width) => sum + width, 0);

  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawHeader = () => {
    page.drawRectangle({
      x: margin,
      y: y - 56,
      width: titleWidth,
      height: 56,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 1,
    });
    const safeTitle = fitTextToWidth(reportTitle.toUpperCase(), bold, 14, titleWidth - 12);
    const titleWidthText = bold.widthOfTextAtSize(safeTitle, 14);
    page.drawText(safeTitle, {
      x: margin + (titleWidth - titleWidthText) / 2,
      y: y - 34,
      size: 14,
      font: bold,
      color: rgb(0.08, 0.11, 0.14),
    });
    y -= 56;

    drawCell({
      page,
      text: reportDateLabel,
      x: margin,
      y,
      w: titleWidth,
      h: 22,
      font,
      size: 8,
      align: "left",
    });
    y -= 22;

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
        h: tableRow + 4,
        font: bold,
        align: "center",
        fill: [0.86, 0.86, 0.86],
      });
      x += tableCols[index];
    });
    y -= tableRow + 4;
  };

  drawHeader();

  const ensureMainSpace = () => {
    if (y < margin + tableRow * 6) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
      drawHeader();
    }
  };

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
      formatCurrency(row.totalPaid),
    ];

    let x = margin;
    values.forEach((value, cellIndex) => {
      drawCell({
        page,
        text: value,
        x,
        y,
        w: tableCols[cellIndex],
        h: tableRow,
        font,
        align: cellIndex === 0 ? "center" : cellIndex === 1 ? "left" : "right",
      });
      x += tableCols[cellIndex];
    });
    y -= tableRow;
  });

  const drawSummaryRow = (label: string, value: number, fill?: [number, number, number]) => {
    ensureMainSpace();
    drawCell({
      page,
      text: label,
      x: margin,
      y,
      w: mainLabelWidth,
      h: tableRow,
      font: bold,
      align: "right",
      fill,
    });
    drawCell({
      page,
      text: formatCurrency(value),
      x: margin + mainLabelWidth,
      y,
      w: mainValueWidth,
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
  drawSummaryRow("SUBTOTAL", subtotal, [1, 0.96, 0.2]);
  drawSummaryRow("KASBON TEAM (JIKA ADA)", totalKasbon, [0.94, 0.15, 0.15]);
  drawSummaryRow("TOTAL KESELURUHAN", totalKeseluruhan, [0.73, 0.83, 0.92]);
  y -= 26;

  if (y < 240) {
    page = pdf.addPage(pageSize);
    y = page.getHeight() - margin;
  }

  page.drawText("REIMBURSE", {
    x: margin,
    y,
    size: 14,
    font: bold,
    color: rgb(0.08, 0.11, 0.14),
  });
  y -= 18;

  const reimburseHeaders = ["NO", "TANGGAL", "KETERANGAN", "QTY", "HARGA SATUAN", "TOTAL"];
  let reimburseX = margin;
  reimburseHeaders.forEach((item, index) => {
    drawCell({
      page,
      text: item,
      x: reimburseX,
      y,
      w: reimburseCols[index],
      h: tableRow + 4,
      font: bold,
      align: "center",
      fill: [0.9, 0.9, 0.9],
    });
    reimburseX += reimburseCols[index];
  });
  y -= tableRow + 4;

  const printableReimburseRows =
    reimburseRows.length > 0
      ? reimburseRows
      : [{ date: getGeneratedFileDate(), description: "-", qty: 0, unitPrice: 0, total: 0 }];

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
        align: cellIndex === 0 ? "center" : cellIndex >= 3 ? "right" : "left",
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
    w: reimburseLabelWidth,
    h: tableRow,
    font: bold,
    align: "center",
    fill: [1, 0.96, 0.2],
  });
  drawCell({
    page,
    text: formatCurrency(totalReimburse),
    x: margin + reimburseLabelWidth,
    y,
    w: reimburseCols[5],
    h: tableRow,
    font: bold,
    align: "right",
    fill: [1, 0.96, 0.2],
  });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename="rekap-upah-${generatedFileDate}.pdf"`,
    },
  });
}
