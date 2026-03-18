import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { canExportReports, getCurrentUser } from "@/lib/auth";
import { getExpenseCategories, getProjectReportDetail } from "@/lib/data";
import {
  buildReportCategoryOptions,
  buildReportCategoryTotals,
  createEmptyCategoryTotals,
  getExpenseCategoryFill,
} from "@/lib/expense-report";

function isDateString(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatCurrency(value: number) {
  return `Rp ${new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(value)}`;
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
  return `${months[monthNumber - 1] ?? "BULAN"} ${year}`;
}

function fitText(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  maxWidth: number,
) {
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

function toFileSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildCategoryHeaderLabel(label: string) {
  const upper = label.trim().replace(/\s+/g, " ").toUpperCase();
  if (!upper) {
    return "KATEGORI";
  }
  if (upper === "ALAT") {
    return "ALAT";
  }
  if (upper.startsWith("COST ")) {
    return upper;
  }
  return `COST ${upper}`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canExportReports(user)) {
    return new Response("Akses export ditolak untuk role ini.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get("preview") === "1";
  const projectId = searchParams.get("project");
  if (!projectId) {
    return new Response("Project wajib diisi.", { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = isDateString(searchParams.get("from")) ? String(searchParams.get("from")) : "1900-01-01";
  const to = isDateString(searchParams.get("to")) ? String(searchParams.get("to")) : today;

  const [detail, expenseCategories] = await Promise.all([
    getProjectReportDetail(projectId),
    getExpenseCategories(),
  ]);
  if (!detail) {
    return new Response("Project tidak ditemukan.", { status: 404 });
  }

  const rows = detail.expenses
    .filter((row) => row.expenseDate.slice(0, 10) >= from)
    .filter((row) => row.expenseDate.slice(0, 10) <= to)
    .map((row) => ({
      expenseDate: row.expenseDate.slice(0, 10),
      requesterName: row.requesterName ?? "",
      description: row.description ?? "",
      quantity: row.quantity,
      unitLabel: row.unitLabel ?? "",
      usageInfo: row.usageInfo ?? "",
      unitPrice: row.unitPrice,
      amount: row.amount,
      category: row.category,
    }))
    .sort((a, b) => {
      if (a.expenseDate !== b.expenseDate) {
        return a.expenseDate.localeCompare(b.expenseDate);
      }
      return a.requesterName.localeCompare(b.requesterName);
    });
  if (rows.length === 0) {
    return new Response("Belum ada data biaya project pada periode ini.", { status: 404 });
  }

  const categoryOptions = buildReportCategoryOptions(
    expenseCategories,
    rows.map((row) => row.category),
  );
  const { totalsByCategory, total } = buildReportCategoryTotals(rows, categoryOptions);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 20;
  const minimumPageSize: [number, number] = [1191, 842];
  const headerTop = 24;
  const headerBottom = 20;
  const rowHeight = 19;
  const bodySize = 7.2;

  const colorHeader = [0.9, 0.9, 0.9] as const;
  const colorTotal = [0.98, 0.86, 0.38] as const;
  const staticColumns = [26, 100, 66, 166, 42, 48, 120, 76];
  const categoryColumnWidth = 96;
  const totalColumnWidth = 111;
  const columns = [
    ...staticColumns,
    ...categoryOptions.map(() => categoryColumnWidth),
    totalColumnWidth,
  ];
  const pageWidth = Math.max(
    minimumPageSize[0],
    margin * 2 + columns.reduce((sum, width) => sum + width, 0),
  );

  let page = pdf.addPage([pageWidth, minimumPageSize[1]]);
  let y = page.getHeight() - margin;
  const xAt = (index: number) =>
    margin + columns.slice(0, index).reduce((sum, width) => sum + width, 0);
  const printedAtText = new Date().toLocaleString("id-ID");

  const drawRect = (
    x: number,
    topY: number,
    width: number,
    height: number,
    fill?: readonly [number, number, number],
  ) => {
    page.drawRectangle({
      x,
      y: topY - height,
      width,
      height,
      borderColor: rgb(0.23, 0.23, 0.23),
      borderWidth: 0.7,
      color: fill ? rgb(fill[0], fill[1], fill[2]) : undefined,
    });
  };

  const drawCellText = (params: {
    text: string;
    x: number;
    topY: number;
    width: number;
    height: number;
    align?: "left" | "center" | "right";
    boldText?: boolean;
    size?: number;
  }) => {
    const drawFont = params.boldText ? bold : font;
    const size = params.size ?? bodySize;
    const lines = params.text.split("\n");
    const lineGap = 1.5;
    const textHeight = lines.length * size + Math.max(0, lines.length - 1) * lineGap;
    let lineY = params.topY - (params.height - textHeight) / 2 - size;

    for (const rawLine of lines) {
      const line = fitText(rawLine, drawFont, size, params.width - 6);
      const lineWidth = drawFont.widthOfTextAtSize(line, size);
      let textX = params.x + 3;
      if (params.align === "center") {
        textX = params.x + (params.width - lineWidth) / 2;
      } else if (params.align === "right") {
        textX = params.x + params.width - lineWidth - 3;
      }

      page.drawText(line, {
        x: textX,
        y: lineY,
        size,
        font: drawFont,
        color: rgb(0.08, 0.1, 0.12),
      });
      lineY -= size + lineGap;
    }
  };

  const drawHeader = () => {
    const title = `PROJECT ${detail.project.name.toUpperCase()}`;
    const titleSize = 22;
    const titleWidth = bold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (page.getWidth() - titleWidth) / 2,
      y,
      size: titleSize,
      font: bold,
      color: rgb(0.08, 0.1, 0.12),
    });
    y -= 26;

    page.drawText(`Periode ${from} s/d ${to} | Dicetak ${printedAtText}`, {
      x: margin,
      y,
      size: 8.5,
      font,
      color: rgb(0.3, 0.34, 0.38),
    });
    y -= 12;

    const totalCol = staticColumns.length + categoryOptions.length;
    const mergedTwoRows = new Set([0, 1, 2, 3, totalCol]);
    const topHeaders: Array<{
      start: number;
      end: number;
      text: string;
      fill?: readonly [number, number, number];
    }> = [
      { start: 0, end: 0, text: "NO", fill: colorHeader },
      { start: 1, end: 1, text: "NAMA\nPENGAJUAN", fill: colorHeader },
      { start: 2, end: 2, text: "TANGGAL", fill: colorHeader },
      { start: 3, end: 3, text: "KETERANGAN", fill: colorHeader },
      { start: 4, end: 7, text: "RINCIAN COST", fill: colorHeader },
      ...categoryOptions.map((category, index) => ({
        start: staticColumns.length + index,
        end: staticColumns.length + index,
        text: buildCategoryHeaderLabel(category.label),
        fill: getExpenseCategoryFill(index),
      })),
      { start: totalCol, end: totalCol, text: "PENGELUARAN\nPER MINGGU", fill: colorHeader },
    ];

    for (const header of topHeaders) {
      const x = xAt(header.start);
      const width = columns.slice(header.start, header.end + 1).reduce((sum, value) => sum + value, 0);
      const height = mergedTwoRows.has(header.start) ? headerTop + headerBottom : headerTop;
      drawRect(x, y, width, height, header.fill);
      drawCellText({
        text: header.text,
        x,
        topY: y,
        width,
        height,
        align: "center",
        boldText: true,
        size: 8.4,
      });
    }

    const bottomHeaders = [
      { col: 4, text: "QTY", fill: colorHeader },
      { col: 5, text: "KET", fill: colorHeader },
      { col: 6, text: "INFORMASI\nPENGGUNAAN", fill: colorHeader },
      { col: 7, text: "HARGA", fill: colorHeader },
      ...categoryOptions.map((_, index) => ({
        col: staticColumns.length + index,
        text: "COST",
        fill: getExpenseCategoryFill(index),
      })),
    ];

    for (const header of bottomHeaders) {
      drawRect(xAt(header.col), y - headerTop, columns[header.col], headerBottom, header.fill);
      drawCellText({
        text: header.text,
        x: xAt(header.col),
        topY: y - headerTop,
        width: columns[header.col],
        height: headerBottom,
        align: "center",
        boldText: true,
        size: 8.1,
      });
    }

    y -= headerTop + headerBottom;
  };

  const ensureSpace = (height: number) => {
    if (y - height < margin + 12) {
      page = pdf.addPage([pageWidth, minimumPageSize[1]]);
      y = page.getHeight() - margin;
      drawHeader();
    }
  };

  const drawBodyRow = (
    values: string[],
    fills: Partial<Record<number, readonly [number, number, number]>>,
    boldText = false,
  ) => {
    for (let col = 0; col < columns.length; col += 1) {
      const align =
        col === 0 || col === 2 || col === 4 || col === 5
          ? "center"
          : col >= 7
            ? "right"
            : "left";
      drawRect(xAt(col), y, columns[col], rowHeight, fills[col]);
      drawCellText({
        text: values[col] ?? "",
        x: xAt(col),
        topY: y,
        width: columns[col],
        height: rowHeight,
        align,
        boldText,
      });
    }
    y -= rowHeight;
  };

  drawHeader();

  const groupedByMonth = new Map<string, typeof rows>();
  for (const row of rows) {
    const monthKey = row.expenseDate.slice(0, 7);
    if (!groupedByMonth.has(monthKey)) {
      groupedByMonth.set(monthKey, []);
    }
    groupedByMonth.get(monthKey)?.push(row);
  }

  const categoryFills = Object.fromEntries(
    categoryOptions.map((_, index) => [staticColumns.length + index, getExpenseCategoryFill(index)]),
  ) as Partial<Record<number, readonly [number, number, number]>>;

  let rowNo = 1;
  for (const [monthKey, monthRows] of groupedByMonth.entries()) {
    const monthTotals = createEmptyCategoryTotals(categoryOptions);
    let monthTotal = 0;

    for (const row of monthRows) {
      ensureSpace(rowHeight);
      monthTotals[row.category] = (monthTotals[row.category] ?? 0) + row.amount;
      monthTotal += row.amount;

      const values = [
        String(rowNo),
        row.requesterName,
        formatDetailDate(row.expenseDate),
        row.description,
        row.quantity > 0 ? String(row.quantity) : "",
        row.unitLabel,
        row.usageInfo,
        row.unitPrice > 0 ? formatCurrency(row.unitPrice) : "",
        ...categoryOptions.map((category) =>
          category.value === row.category && row.amount > 0 ? formatCurrency(row.amount) : "",
        ),
        row.amount > 0 ? formatCurrency(row.amount) : "",
      ];
      drawBodyRow(values, categoryFills);
      rowNo += 1;
    }

    ensureSpace(rowHeight);
    const leftWidth = columns.slice(0, staticColumns.length).reduce((sum, width) => sum + width, 0);
    drawRect(xAt(0), y, leftWidth, rowHeight, colorTotal);
    drawCellText({
      text: `TOTAL PENGELUARAN COST ${formatMonthLabel(monthKey)}`,
      x: xAt(0),
      topY: y,
      width: leftWidth,
      height: rowHeight,
      align: "left",
      boldText: true,
    });

    categoryOptions.forEach((category, index) => {
      const col = staticColumns.length + index;
      drawRect(xAt(col), y, columns[col], rowHeight, colorTotal);
      drawCellText({
        text: monthTotals[category.value] > 0 ? formatCurrency(monthTotals[category.value]) : "-",
        x: xAt(col),
        topY: y,
        width: columns[col],
        height: rowHeight,
        align: "right",
        boldText: true,
      });
    });

    const totalCol = staticColumns.length + categoryOptions.length;
    drawRect(xAt(totalCol), y, columns[totalCol], rowHeight, colorTotal);
    drawCellText({
      text: monthTotal > 0 ? formatCurrency(monthTotal) : "-",
      x: xAt(totalCol),
      topY: y,
      width: columns[totalCol],
      height: rowHeight,
      align: "right",
      boldText: true,
    });
    y -= rowHeight;
  }

  ensureSpace(18 + (categoryOptions.length + 2) * 14);
  y -= 8;
  page.drawText("Ringkasan per kategori", {
    x: margin,
    y,
    size: 10,
    font: bold,
    color: rgb(0.12, 0.14, 0.17),
  });
  y -= 14;
  categoryOptions.forEach((category, index) => {
    page.drawText(`${category.label}: ${formatCurrency(totalsByCategory[category.value] ?? 0)}`, {
      x: margin,
      y,
      size: 8.5,
      font,
      color: rgb(0.22, 0.25, 0.3),
    });
    const markerX = margin + 2;
    page.drawRectangle({
      x: markerX,
      y: y + 1,
      width: 6,
      height: 6,
      color: rgb(...getExpenseCategoryFill(index)),
    });
    y -= 12;
  });
  page.drawText(`TOTAL: ${formatCurrency(total)}`, {
    x: margin,
    y,
    size: 9,
    font: bold,
    color: rgb(0.12, 0.14, 0.17),
  });

  const bytes = await pdf.save();
  const filePrefix = toFileSlug(detail.project.name) || "project";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename=\"${filePrefix}-rekap-biaya.pdf\"`,
    },
  });
}
