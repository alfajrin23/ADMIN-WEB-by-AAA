import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getProjectDetail, getProjects } from "@/lib/data";

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

function splitByCategory(category: string, amount: number) {
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

  const details = await Promise.all(selectedProjects.map((project) => getProjectDetail(project.id)));
  const rowsByProject = new Map<string, ExpenseRow[]>();
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
    rowsByProject.set(detail.project.id, rows);
  }

  const hasAnyRows = Array.from(rowsByProject.values()).some((rows) => rows.length > 0);
  if (!hasAnyRows) {
    return new Response("Belum ada data biaya project.", { status: 404 });
  }
  const reportProjectNames = selectedProjects
    .filter((project) => (rowsByProject.get(project.id) ?? []).length > 0)
    .map((project) => project.name);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 20;
  const pageSize: [number, number] = [1191, 842];
  const cols = [26, 100, 66, 166, 42, 48, 120, 76, 88, 84, 98, 86, 111];
  const xAt = (index: number) => margin + cols.slice(0, index).reduce((sum, width) => sum + width, 0);
  const headerTop = 24;
  const headerBottom = 20;
  const rowHeight = 19;
  const bodySize = 7.2;

  const colorHeader = [0.9, 0.9, 0.9] as const;
  const colorMaterial = [0.91, 0.86, 0.69] as const;
  const colorAlat = [0.86, 0.72, 0.86] as const;
  const colorUpah = [0.79, 0.79, 0.81] as const;
  const colorOps = [0.57, 0.76, 0.88] as const;
  const colorTotal = [1, 0.95, 0.2] as const;

  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;
  let currentProjectName = "";

  const drawRect = (x: number, topY: number, width: number, height: number, fill?: readonly [number, number, number]) => {
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
    const lines = params.text.split("\n");
    const drawFont = params.boldText ? bold : font;
    const size = params.size ?? bodySize;
    const lineGap = 1.5;
    const textHeight = lines.length * size + Math.max(0, lines.length - 1) * lineGap;
    let lineY = params.topY - (params.height - textHeight) / 2 - size;

    for (const lineRaw of lines) {
      const line = fitText(lineRaw, drawFont, size, params.width - 6);
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

  const drawHeader = (projectName: string) => {
    currentProjectName = projectName;
    const title = `PROJECT KMP CIANJUR DS ${projectName.toUpperCase()}`;
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

    page.drawText(`Dicetak ${new Date().toLocaleString("id-ID")}`, {
      x: margin,
      y,
      size: 8.5,
      font,
      color: rgb(0.3, 0.34, 0.38),
    });
    y -= 12;

    const mergedTwoRows = [0, 1, 2, 3, 12];
    const topConfig: Array<{
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
      { start: 8, end: 8, text: "COST\nMATERIAL", fill: colorMaterial },
      { start: 9, end: 9, text: "ALAT", fill: colorAlat },
      { start: 10, end: 10, text: "COST\nUPAH/KASBON", fill: colorUpah },
      { start: 11, end: 11, text: "COST OPS", fill: colorOps },
      { start: 12, end: 12, text: "PENGELUARAN\nPER MINGGU", fill: colorHeader },
    ];

    for (const item of topConfig) {
      const x = xAt(item.start);
      const width = cols.slice(item.start, item.end + 1).reduce((sum, col) => sum + col, 0);
      const height = mergedTwoRows.includes(item.start) ? headerTop + headerBottom : headerTop;
      drawRect(x, y, width, height, item.fill);
      drawCellText({
        text: item.text,
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
      { col: 8, text: "COST", fill: colorMaterial },
      { col: 9, text: "COST", fill: colorAlat },
      { col: 10, text: "COST", fill: colorUpah },
      { col: 11, text: "COST", fill: colorOps },
    ];
    for (const item of bottomHeaders) {
      const x = xAt(item.col);
      drawRect(x, y - headerTop, cols[item.col], headerBottom, item.fill);
      drawCellText({
        text: item.text,
        x,
        topY: y - headerTop,
        width: cols[item.col],
        height: headerBottom,
        align: "center",
        boldText: true,
        size: 8.2,
      });
    }

    y -= headerTop + headerBottom;
  };

  const ensureSpace = (height: number) => {
    if (y - height < margin + 12) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
      drawHeader(currentProjectName);
    }
  };

  const drawBodyRow = (values: Array<string>, fills?: Partial<Record<number, readonly [number, number, number]>>, boldText = false) => {
    for (let col = 0; col < cols.length; col += 1) {
      const x = xAt(col);
      drawRect(x, y, cols[col], rowHeight, fills?.[col]);
      drawCellText({
        text: values[col] ?? "",
        x,
        topY: y,
        width: cols[col],
        height: rowHeight,
        align: col <= 2 ? "center" : col >= 7 ? "right" : "left",
        boldText,
      });
    }
    y -= rowHeight;
  };

  let renderedProjects = 0;
  for (const project of selectedProjects) {
    const rows = rowsByProject.get(project.id) ?? [];
    if (rows.length === 0) {
      continue;
    }

    if (renderedProjects > 0) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
    }
    drawHeader(project.name);
    renderedProjects += 1;

    const groupedByMonth = new Map<string, ExpenseRow[]>();
    for (const row of rows) {
      const monthKey = row.expenseDate.slice(0, 7);
      if (!groupedByMonth.has(monthKey)) {
        groupedByMonth.set(monthKey, []);
      }
      groupedByMonth.get(monthKey)?.push(row);
    }

    let rowNo = 1;
    for (const [monthKey, monthRows] of groupedByMonth.entries()) {
      const monthTotals = { material: 0, alat: 0, upah: 0, ops: 0, total: 0 };

      for (const row of monthRows) {
        ensureSpace(rowHeight);
        const split = splitByCategory(row.category, row.amount);
        monthTotals.material += split.material;
        monthTotals.alat += split.alat;
        monthTotals.upah += split.upah;
        monthTotals.ops += split.ops;
        monthTotals.total += row.amount;

        const values = [
          String(rowNo),
          row.requesterName,
          formatDetailDate(row.expenseDate),
          row.description,
          row.quantity > 0 ? String(row.quantity) : "",
          row.unitLabel,
          row.usageInfo,
          row.unitPrice > 0 ? formatCurrency(row.unitPrice) : "",
          split.material > 0 ? formatCurrency(split.material) : "",
          split.alat > 0 ? formatCurrency(split.alat) : "",
          split.upah > 0 ? formatCurrency(split.upah) : "",
          split.ops > 0 ? formatCurrency(split.ops) : "",
          row.amount > 0 ? formatCurrency(row.amount) : "",
        ];
        drawBodyRow(values, {
          8: colorMaterial,
          9: colorAlat,
          10: colorUpah,
          11: colorOps,
        });
        rowNo += 1;
      }

      ensureSpace(rowHeight);
      const subtotalLabel = `TOTAL PENGELUARAN COST ${formatMonthLabel(monthKey)}`;
      const leftWidth = cols.slice(0, 8).reduce((sum, width) => sum + width, 0);
      drawRect(xAt(0), y, leftWidth, rowHeight, colorTotal);
      drawCellText({
        text: subtotalLabel,
        x: xAt(0),
        topY: y,
        width: leftWidth,
        height: rowHeight,
        align: "left",
        boldText: true,
      });
      const subtotalValues = [
        monthTotals.material,
        monthTotals.alat,
        monthTotals.upah,
        monthTotals.ops,
        monthTotals.total,
      ];
      const subtotalCols = [8, 9, 10, 11, 12];
      subtotalCols.forEach((col, index) => {
        drawRect(xAt(col), y, cols[col], rowHeight, colorTotal);
        drawCellText({
          text: subtotalValues[index] > 0 ? formatCurrency(subtotalValues[index]) : "-",
          x: xAt(col),
          topY: y,
          width: cols[col],
          height: rowHeight,
          align: "right",
          boldText: true,
        });
      });
      y -= rowHeight;
    }
  }

  const bytes = await pdf.save();
  const filePrefix = resolveFilePrefix(reportProjectNames);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename=\"${filePrefix}-rincian-biaya.pdf\"`,
    },
  });
}
