import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ExpenseCategoryOption } from "@/lib/constants";
import { getExpenseCategories, getProjectReportDetail, getProjects } from "@/lib/data";
import { canExportReports, getCurrentUser } from "@/lib/auth";
import {
  buildReportCategoryOptions,
  buildReportCategoryTotals,
  createEmptyCategoryTotals,
  getExpenseCategoryFill,
} from "@/lib/expense-report";

type ExpenseRow = {
  expenseDate: string;
  requesterName: string;
  description: string;
  quantity: number;
  unitLabel: string;
  usageInfo: string;
  unitPrice: number;
  amount: number;
  category: string;
};

type ProjectSection = {
  projectName: string;
  rows: ExpenseRow[];
  categoryOptions: ExpenseCategoryOption[];
};

type ProjectSummaryRow = {
  projectName: string;
  totalsByCategory: Record<string, number>;
  total: number;
};

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
  if (!user || !canExportReports(user.role)) {
    return new Response("Akses export ditolak untuk role ini.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get("preview") === "1";
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
    return new Response("Pilih minimal satu project untuk PDF rincian biaya.", { status: 400 });
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

  const sections: ProjectSection[] = [];
  const allCategoryValues: string[] = [];
  for (const detail of details) {
    if (!detail) {
      continue;
    }

    const rows = detail.expenses
      .map((expense) => ({
        expenseDate: expense.expenseDate.slice(0, 10),
        requesterName: expense.requesterName ?? "",
        description: expense.description ?? "",
        quantity: expense.quantity,
        unitLabel: expense.unitLabel ?? "",
        usageInfo: expense.usageInfo ?? "",
        unitPrice: expense.unitPrice,
        amount: expense.amount,
        category: expense.category,
      }))
      .sort((a, b) => {
        if (a.expenseDate !== b.expenseDate) {
          return a.expenseDate.localeCompare(b.expenseDate);
        }
        return a.requesterName.localeCompare(b.requesterName);
      });
    if (rows.length === 0) {
      continue;
    }

    const categoryOptions = buildReportCategoryOptions(
      expenseCategories,
      rows.map((row) => row.category),
    );
    sections.push({
      projectName: detail.project.name,
      rows,
      categoryOptions,
    });
    allCategoryValues.push(...rows.map((row) => row.category));
  }

  if (sections.length === 0) {
    return new Response("Belum ada data biaya project.", { status: 404 });
  }

  const summaryCategoryOptions = buildReportCategoryOptions(expenseCategories, allCategoryValues);
  const summaryRows: ProjectSummaryRow[] = sections.map((section) => {
    const { totalsByCategory, total } = buildReportCategoryTotals(section.rows, summaryCategoryOptions);
    return {
      projectName: section.projectName,
      totalsByCategory,
      total,
    };
  });
  const grandTotalsByCategory = Object.fromEntries(
    summaryCategoryOptions.map((item) => [item.value, 0]),
  ) as Record<string, number>;
  let grandTotal = 0;
  for (const row of summaryRows) {
    for (const category of summaryCategoryOptions) {
      grandTotalsByCategory[category.value] += row.totalsByCategory[category.value] ?? 0;
    }
    grandTotal += row.total;
  }

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
  const printedAtText = new Date().toLocaleString("id-ID");
  const selectedLabel =
    requestedProjectIds.length > 0
      ? `${requestedProjectIds.length} project terpilih`
      : "Semua project";

  let page = pdf.addPage(minimumPageSize);
  let y = page.getHeight() - margin;
  let currentColumns = [...staticColumns, totalColumnWidth];

  const xAt = (index: number) =>
    margin + currentColumns.slice(0, index).reduce((sum, width) => sum + width, 0);

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

  const addProjectPage = (section: ProjectSection) => {
    currentColumns = [
      ...staticColumns,
      ...section.categoryOptions.map(() => categoryColumnWidth),
      totalColumnWidth,
    ];
    const pageWidth = Math.max(
      minimumPageSize[0],
      margin * 2 + currentColumns.reduce((sum, width) => sum + width, 0),
    );
    page = pdf.addPage([pageWidth, minimumPageSize[1]]);
    y = page.getHeight() - margin;

    const title = `PROJECT ${section.projectName.toUpperCase()}`;
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

    page.drawText(`${selectedLabel} | Dicetak ${printedAtText}`, {
      x: margin,
      y,
      size: 8.5,
      font,
      color: rgb(0.3, 0.34, 0.38),
    });
    y -= 12;

    const totalCol = staticColumns.length + section.categoryOptions.length;
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
      ...section.categoryOptions.map((category, index) => ({
        start: staticColumns.length + index,
        end: staticColumns.length + index,
        text: buildCategoryHeaderLabel(category.label),
        fill: getExpenseCategoryFill(index),
      })),
      { start: totalCol, end: totalCol, text: "PENGELUARAN\nPER MINGGU", fill: colorHeader },
    ];

    for (const header of topHeaders) {
      const x = xAt(header.start);
      const width = currentColumns
        .slice(header.start, header.end + 1)
        .reduce((sum, value) => sum + value, 0);
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
      ...section.categoryOptions.map((_, index) => ({
        col: staticColumns.length + index,
        text: "COST",
        fill: getExpenseCategoryFill(index),
      })),
    ];

    for (const header of bottomHeaders) {
      drawRect(xAt(header.col), y - headerTop, currentColumns[header.col], headerBottom, header.fill);
      drawCellText({
        text: header.text,
        x: xAt(header.col),
        topY: y - headerTop,
        width: currentColumns[header.col],
        height: headerBottom,
        align: "center",
        boldText: true,
        size: 8.1,
      });
    }

    y -= headerTop + headerBottom;
  };

  const ensureProjectSpace = (section: ProjectSection, height: number) => {
    if (y - height < margin + 12) {
      addProjectPage(section);
    }
  };

  const drawProjectRow = (
    values: string[],
    fills: Partial<Record<number, readonly [number, number, number]>>,
    boldText = false,
  ) => {
    for (let col = 0; col < currentColumns.length; col += 1) {
      const align =
        col === 0 || col === 2 || col === 4 || col === 5
          ? "center"
          : col >= 7
            ? "right"
            : "left";
      drawRect(xAt(col), y, currentColumns[col], rowHeight, fills[col]);
      drawCellText({
        text: values[col] ?? "",
        x: xAt(col),
        topY: y,
        width: currentColumns[col],
        height: rowHeight,
        align,
        boldText,
      });
    }
    y -= rowHeight;
  };

  sections.forEach((section) => {
    addProjectPage(section);

    const groupedByMonth = new Map<string, ExpenseRow[]>();
    for (const row of section.rows) {
      const monthKey = row.expenseDate.slice(0, 7);
      if (!groupedByMonth.has(monthKey)) {
        groupedByMonth.set(monthKey, []);
      }
      groupedByMonth.get(monthKey)?.push(row);
    }

    const categoryFills = Object.fromEntries(
      section.categoryOptions.map((_, index) => [staticColumns.length + index, getExpenseCategoryFill(index)]),
    ) as Partial<Record<number, readonly [number, number, number]>>;

    let rowNo = 1;
    for (const [monthKey, monthRows] of groupedByMonth.entries()) {
      const monthTotals = createEmptyCategoryTotals(section.categoryOptions);
      let monthTotal = 0;

      for (const row of monthRows) {
        ensureProjectSpace(section, rowHeight);
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
          ...section.categoryOptions.map((category) =>
            category.value === row.category && row.amount > 0 ? formatCurrency(row.amount) : "",
          ),
          row.amount > 0 ? formatCurrency(row.amount) : "",
        ];
        drawProjectRow(values, categoryFills);
        rowNo += 1;
      }

      ensureProjectSpace(section, rowHeight);
      const leftWidth = currentColumns.slice(0, staticColumns.length).reduce((sum, width) => sum + width, 0);
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

      section.categoryOptions.forEach((category, index) => {
        const col = staticColumns.length + index;
        drawRect(xAt(col), y, currentColumns[col], rowHeight, colorTotal);
        drawCellText({
          text: monthTotals[category.value] > 0 ? formatCurrency(monthTotals[category.value]) : "-",
          x: xAt(col),
          topY: y,
          width: currentColumns[col],
          height: rowHeight,
          align: "right",
          boldText: true,
        });
      });

      const totalCol = staticColumns.length + section.categoryOptions.length;
      drawRect(xAt(totalCol), y, currentColumns[totalCol], rowHeight, colorTotal);
      drawCellText({
        text: monthTotal > 0 ? formatCurrency(monthTotal) : "-",
        x: xAt(totalCol),
        topY: y,
        width: currentColumns[totalCol],
        height: rowHeight,
        align: "right",
        boldText: true,
      });
      y -= rowHeight;
    }
  });

  if (summaryRows.length > 0) {
    const summaryColumns = [
      34,
      300,
      ...summaryCategoryOptions.map(() => 120),
      140,
    ];
    const summaryPageWidth = Math.max(
      minimumPageSize[0],
      margin * 2 + summaryColumns.reduce((sum, width) => sum + width, 0),
    );
    const summaryXAt = (index: number) =>
      margin + summaryColumns.slice(0, index).reduce((sum, width) => sum + width, 0);
    const summaryRowHeight = 20;

    const addSummaryPage = () => {
      page = pdf.addPage([summaryPageWidth, minimumPageSize[1]]);
      y = page.getHeight() - margin;

      const title = "REKAP KESELURUHAN RINCIAN BIAYA";
      const titleSize = 16;
      const titleWidth = bold.widthOfTextAtSize(title, titleSize);
      page.drawText(title, {
        x: (page.getWidth() - titleWidth) / 2,
        y,
        size: titleSize,
        font: bold,
        color: rgb(0.08, 0.1, 0.12),
      });
      y -= 22;

      page.drawText(`${selectedLabel} | Dicetak ${printedAtText}`, {
        x: margin,
        y,
        size: 8.5,
        font,
        color: rgb(0.3, 0.34, 0.38),
      });
      y -= 14;

      const headers = [
        "NO",
        "PROJECT",
        ...summaryCategoryOptions.map((item) => item.label.toUpperCase()),
        "TOTAL",
      ];
      headers.forEach((header, index) => {
        const fill =
          index >= 2 && index < 2 + summaryCategoryOptions.length
            ? getExpenseCategoryFill(index - 2)
            : colorHeader;
        drawRect(summaryXAt(index), y, summaryColumns[index], summaryRowHeight, fill);
        drawCellText({
          text: header,
          x: summaryXAt(index),
          topY: y,
          width: summaryColumns[index],
          height: summaryRowHeight,
          align: "center",
          boldText: true,
          size: 8,
        });
      });
      y -= summaryRowHeight;
    };

    const ensureSummarySpace = () => {
      if (y - summaryRowHeight < margin + 12) {
        addSummaryPage();
      }
    };

    addSummaryPage();

    summaryRows.forEach((row, index) => {
      ensureSummarySpace();
      const values = [
        String(index + 1),
        row.projectName,
        ...summaryCategoryOptions.map((category) =>
          formatCurrency(row.totalsByCategory[category.value] ?? 0),
        ),
        formatCurrency(row.total),
      ];
      values.forEach((value, col) => {
        drawRect(summaryXAt(col), y, summaryColumns[col], summaryRowHeight);
        drawCellText({
          text: value,
          x: summaryXAt(col),
          topY: y,
          width: summaryColumns[col],
          height: summaryRowHeight,
          align: col === 0 ? "center" : col >= 2 ? "right" : "left",
          size: 8,
        });
      });
      y -= summaryRowHeight;
    });

    ensureSummarySpace();
    const totalValues = [
      "",
      "TOTAL KESELURUHAN",
      ...summaryCategoryOptions.map((category) => formatCurrency(grandTotalsByCategory[category.value] ?? 0)),
      formatCurrency(grandTotal),
    ];
    totalValues.forEach((value, col) => {
      drawRect(summaryXAt(col), y, summaryColumns[col], summaryRowHeight, colorTotal);
      drawCellText({
        text: value,
        x: summaryXAt(col),
        topY: y,
        width: summaryColumns[col],
        height: summaryRowHeight,
        align: col >= 2 ? "right" : "left",
        boldText: true,
        size: 8,
      });
    });
  }

  const bytes = await pdf.save();
  const filePrefix = resolveFilePrefix(sections.map((section) => section.projectName));
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename=\"${filePrefix}-rincian-biaya.pdf\"`,
    },
  });
}
