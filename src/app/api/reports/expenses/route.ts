import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getProjectDetail } from "@/lib/data";

function isDateString(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateCell(value: string) {
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

function getMonthKey(value: string) {
  return value.slice(0, 7);
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

function fitText(text: string, font: PDFFontLike, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return text;
  }
  const suffix = "...";
  let trimmed = text;
  while (trimmed.length > 0) {
    const candidate = `${trimmed}${suffix}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      return candidate;
    }
    trimmed = trimmed.slice(0, -1);
  }
  return suffix;
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
  fill?: [number, number, number];
  align?: "left" | "center" | "right";
  textColor?: [number, number, number];
}) {
  const size = params.size ?? 8;
  if (params.fill) {
    params.page.drawRectangle({
      x: params.x,
      y: params.y - params.h,
      width: params.w,
      height: params.h,
      color: rgb(params.fill[0], params.fill[1], params.fill[2]),
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.7,
    });
  } else {
    params.page.drawRectangle({
      x: params.x,
      y: params.y - params.h,
      width: params.w,
      height: params.h,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.7,
    });
  }

  if (!params.text) {
    return;
  }

  const fittedText = fitText(params.text, params.font, size, params.w - 6);
  const textWidth = params.font.widthOfTextAtSize(fittedText, size);
  let textX = params.x + 3;
  if (params.align === "center") {
    textX = params.x + (params.w - textWidth) / 2;
  } else if (params.align === "right") {
    textX = params.x + params.w - textWidth - 3;
  }

  params.page.drawText(params.text, {
    x: textX,
    y: params.y - params.h + (params.h - size) / 2 + 1,
    size,
    font: params.font,
    color: params.textColor ? rgb(params.textColor[0], params.textColor[1], params.textColor[2]) : rgb(0.08, 0.1, 0.12),
  });
}

type PDFPageLike = Awaited<ReturnType<PDFDocument["addPage"]>>;
type PDFFontLike = Awaited<ReturnType<PDFDocument["embedFont"]>>;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project");
  if (!projectId) {
    return new Response("Project wajib diisi.", { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = isDateString(searchParams.get("from")) ? String(searchParams.get("from")) : "1900-01-01";
  const to = isDateString(searchParams.get("to")) ? String(searchParams.get("to")) : today;
  const detail = await getProjectDetail(projectId);
  if (!detail) {
    return new Response("Project tidak ditemukan.", { status: 404 });
  }

  const rows = detail.expenses
    .filter((row) => row.expenseDate.slice(0, 10) >= from)
    .filter((row) => row.expenseDate.slice(0, 10) <= to)
    .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [1191, 842];
  const margin = 24;
  const headerRowTop = 24;
  const headerRowBottom = 20;
  const rowHeight = 20;
  const tableWidths = [24, 112, 70, 120, 34, 40, 132, 84, 96, 80, 96, 84, 171];
  const baseHeaderFill: [number, number, number] = [0.92, 0.92, 0.92];
  const materialFill: [number, number, number] = [0.9, 0.86, 0.72];
  const alatFill: [number, number, number] = [0.84, 0.71, 0.85];
  const upahFill: [number, number, number] = [0.77, 0.77, 0.77];
  const opsFill: [number, number, number] = [0.56, 0.76, 0.87];
  const subtotalFill: [number, number, number] = [1, 0.94, 0.25];
  const totalFill: [number, number, number] = [0.76, 0.86, 0.93];

  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;

  const widthUntil = (start: number, end: number) =>
    tableWidths.slice(start, end + 1).reduce((sum, width) => sum + width, 0);
  const xAt = (index: number) => margin + tableWidths.slice(0, index).reduce((sum, width) => sum + width, 0);

  const splitCategoryCost = (category: string, amount: number) => {
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
  };

  const drawHeader = () => {
    const title = `PROJECT ${detail.project.name.toUpperCase()}`;
    const titleSize = 20;
    const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (page.getWidth() - titleWidth) / 2,
      y,
      size: titleSize,
      font: boldFont,
      color: rgb(0.1, 0.12, 0.15),
    });
    y -= 25;

    const subtitle = `RINCIAN BIAYA PROJECT | Periode ${from} s/d ${to}`;
    page.drawText(subtitle, {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.25, 0.3, 0.35),
    });
    y -= 14;

    const topHeaders: Array<{
      text: string;
      start: number;
      end: number;
      fill: [number, number, number];
    }> = [
      { text: "NO", start: 0, end: 0, fill: baseHeaderFill },
      { text: "NAMA PENGAJUAN", start: 1, end: 1, fill: baseHeaderFill },
      { text: "TANGGAL", start: 2, end: 2, fill: baseHeaderFill },
      { text: "KETERANGAN", start: 3, end: 3, fill: baseHeaderFill },
      { text: "RINCIAN COST", start: 4, end: 7, fill: baseHeaderFill },
      { text: "COST MATERIAL", start: 8, end: 8, fill: materialFill },
      { text: "ALAT", start: 9, end: 9, fill: alatFill },
      { text: "COST UPAH/KASBON", start: 10, end: 10, fill: upahFill },
      { text: "COST OPS", start: 11, end: 11, fill: opsFill },
      { text: "PENGELUARAN PER BULAN", start: 12, end: 12, fill: baseHeaderFill },
    ];

    for (const item of topHeaders) {
      drawCell({
        page,
        text: item.text,
        x: xAt(item.start),
        y,
        w: widthUntil(item.start, item.end),
        h: headerRowTop,
        font: boldFont,
        size: 8.5,
        align: "center",
        fill: item.fill,
      });
    }
    y -= headerRowTop;

    const bottomHeaderLabels = [
      "",
      "",
      "",
      "",
      "QTY",
      "KET",
      "INFORMASI PENGGUNAAN",
      "HARGA",
      "COST",
      "COST",
      "COST",
      "COST",
      "",
    ];

    bottomHeaderLabels.forEach((label, index) => {
      const fill =
        index === 8
          ? materialFill
          : index === 9
            ? alatFill
            : index === 10
              ? upahFill
              : index === 11
                ? opsFill
                : baseHeaderFill;
      drawCell({
        page,
        text: label,
        x: xAt(index),
        y,
        w: tableWidths[index],
        h: headerRowBottom,
        font: boldFont,
        size: 8,
        align: "center",
        fill,
      });
    });
    y -= headerRowBottom;
  };

  drawHeader();

  const ensureSpace = (requiredHeight: number) => {
    if (y - requiredHeight < margin + 22) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
      drawHeader();
    }
  };

  const groupedByMonth = new Map<string, typeof rows>();
  for (const row of rows) {
    const monthKey = getMonthKey(row.expenseDate);
    if (!groupedByMonth.has(monthKey)) {
      groupedByMonth.set(monthKey, []);
    }
    groupedByMonth.get(monthKey)!.push(row);
  }

  const overallTotals = { material: 0, alat: 0, upah: 0, ops: 0, grand: 0 };
  let rowNo = 1;

  for (const [monthKey, monthRows] of groupedByMonth.entries()) {
    const monthTotals = { material: 0, alat: 0, upah: 0, ops: 0, grand: 0 };

    for (const row of monthRows) {
      ensureSpace(rowHeight + 2);
      const split = splitCategoryCost(row.category, row.amount);
      monthTotals.material += split.material;
      monthTotals.alat += split.alat;
      monthTotals.upah += split.upah;
      monthTotals.ops += split.ops;
      monthTotals.grand += row.amount;
      overallTotals.material += split.material;
      overallTotals.alat += split.alat;
      overallTotals.upah += split.upah;
      overallTotals.ops += split.ops;
      overallTotals.grand += row.amount;

      const values = [
        String(rowNo),
        row.requesterName ?? "-",
        formatDateCell(row.expenseDate),
        row.description ?? "-",
        row.quantity > 0 ? String(row.quantity) : "",
        row.unitLabel ?? "-",
        row.usageInfo ?? "-",
        row.unitPrice > 0 ? formatCurrency(row.unitPrice) : "-",
        split.material > 0 ? formatCurrency(split.material) : "-",
        split.alat > 0 ? formatCurrency(split.alat) : "-",
        split.upah > 0 ? formatCurrency(split.upah) : "-",
        split.ops > 0 ? formatCurrency(split.ops) : "-",
        formatCurrency(row.amount),
      ];

      values.forEach((text, index) => {
        const align =
          index === 0 || index === 2
            ? "center"
            : index >= 4 && index !== 5 && index !== 6
              ? "right"
              : "left";
        const fill: [number, number, number] | undefined =
          index === 8
            ? [0.98, 0.95, 0.85]
            : index === 9
              ? [0.96, 0.9, 0.96]
              : index === 10
                ? [0.92, 0.92, 0.92]
                : index === 11
                  ? [0.84, 0.93, 0.98]
                  : undefined;
        drawCell({
          page,
          text,
          x: xAt(index),
          y,
          w: tableWidths[index],
          h: rowHeight,
          font,
          size: 8,
          align,
          fill,
        });
      });
      y -= rowHeight;
      rowNo += 1;
    }

    ensureSpace(rowHeight + 4);
    drawCell({
      page,
      text: `TOTAL PENGELUARAN COST ${formatMonthLabel(monthKey)}`,
      x: xAt(0),
      y,
      w: widthUntil(0, 7),
      h: rowHeight + 2,
      font: boldFont,
      size: 9,
      align: "left",
      fill: subtotalFill,
    });
    drawCell({
      page,
      text: monthTotals.material > 0 ? formatCurrency(monthTotals.material) : "-",
      x: xAt(8),
      y,
      w: tableWidths[8],
      h: rowHeight + 2,
      font: boldFont,
      size: 8.5,
      align: "right",
      fill: subtotalFill,
    });
    drawCell({
      page,
      text: monthTotals.alat > 0 ? formatCurrency(monthTotals.alat) : "-",
      x: xAt(9),
      y,
      w: tableWidths[9],
      h: rowHeight + 2,
      font: boldFont,
      size: 8.5,
      align: "right",
      fill: subtotalFill,
    });
    drawCell({
      page,
      text: monthTotals.upah > 0 ? formatCurrency(monthTotals.upah) : "-",
      x: xAt(10),
      y,
      w: tableWidths[10],
      h: rowHeight + 2,
      font: boldFont,
      size: 8.5,
      align: "right",
      fill: subtotalFill,
    });
    drawCell({
      page,
      text: monthTotals.ops > 0 ? formatCurrency(monthTotals.ops) : "-",
      x: xAt(11),
      y,
      w: tableWidths[11],
      h: rowHeight + 2,
      font: boldFont,
      size: 8.5,
      align: "right",
      fill: subtotalFill,
    });
    drawCell({
      page,
      text: formatCurrency(monthTotals.grand),
      x: xAt(12),
      y,
      w: tableWidths[12],
      h: rowHeight + 2,
      font: boldFont,
      size: 8.5,
      align: "right",
      fill: subtotalFill,
    });
    y -= rowHeight + 2;
  }

  ensureSpace(rowHeight + 4);
  drawCell({
    page,
    text: "TOTAL KESELURUHAN BIAYA PROJECT",
    x: xAt(0),
    y,
    w: widthUntil(0, 7),
    h: rowHeight + 2,
    font: boldFont,
    size: 9,
    align: "left",
    fill: totalFill,
  });
  drawCell({
    page,
    text: overallTotals.material > 0 ? formatCurrency(overallTotals.material) : "-",
    x: xAt(8),
    y,
    w: tableWidths[8],
    h: rowHeight + 2,
    font: boldFont,
    size: 8.5,
    align: "right",
    fill: totalFill,
  });
  drawCell({
    page,
    text: overallTotals.alat > 0 ? formatCurrency(overallTotals.alat) : "-",
    x: xAt(9),
    y,
    w: tableWidths[9],
    h: rowHeight + 2,
    font: boldFont,
    size: 8.5,
    align: "right",
    fill: totalFill,
  });
  drawCell({
    page,
    text: overallTotals.upah > 0 ? formatCurrency(overallTotals.upah) : "-",
    x: xAt(10),
    y,
    w: tableWidths[10],
    h: rowHeight + 2,
    font: boldFont,
    size: 8.5,
    align: "right",
    fill: totalFill,
  });
  drawCell({
    page,
    text: overallTotals.ops > 0 ? formatCurrency(overallTotals.ops) : "-",
    x: xAt(11),
    y,
    w: tableWidths[11],
    h: rowHeight + 2,
    font: boldFont,
    size: 8.5,
    align: "right",
    fill: totalFill,
  });
  drawCell({
    page,
    text: formatCurrency(overallTotals.grand),
    x: xAt(12),
    y,
    w: tableWidths[12],
    h: rowHeight + 2,
    font: boldFont,
    size: 8.5,
    align: "right",
    fill: totalFill,
  });
  y -= rowHeight + 14;

  ensureSpace(14);
  page.drawText(`Dicetak: ${new Date().toLocaleString("id-ID")}`, {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.35, 0.4, 0.45),
  });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"biaya-${detail.project.name.replace(/\s+/g, "-").toLowerCase()}.pdf\"`,
    },
  });
}
