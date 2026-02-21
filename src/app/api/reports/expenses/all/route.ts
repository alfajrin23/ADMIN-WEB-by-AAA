import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mergeExpenseCategoryOptions } from "@/lib/constants";
import { getExpenseCategories, getProjectDetail, getProjects } from "@/lib/data";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
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

type ProjectSummary = {
  projectId: string;
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
    return new Response("Pilih minimal satu project untuk PDF terpilih.", { status: 400 });
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

  const summaries: ProjectSummary[] = [];
  for (const detail of details) {
    if (!detail) {
      continue;
    }

    const totalsByCategory = Object.fromEntries(
      categoryOptions.map((category) => [category.value, 0]),
    ) as Record<string, number>;
    let total = 0;
    for (const expense of detail.expenses) {
      totalsByCategory[expense.category] = (totalsByCategory[expense.category] ?? 0) + expense.amount;
      total += expense.amount;
    }

    summaries.push({
      projectId: detail.project.id,
      projectName: detail.project.name,
      totalsByCategory,
      total,
    });
  }

  if (summaries.length === 0) {
    return new Response("Belum ada data biaya project.", { status: 404 });
  }

  summaries.sort((a, b) => b.total - a.total);

  const grandTotalsByCategory = Object.fromEntries(
    categoryOptions.map((category) => [category.value, 0]),
  ) as Record<string, number>;
  let grandTotal = 0;
  for (const summary of summaries) {
    for (const category of categoryOptions) {
      grandTotalsByCategory[category.value] += summary.totalsByCategory[category.value] ?? 0;
    }
    grandTotal += summary.total;
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [1191, 842];
  const margin = 24;
  const rowHeight = 18;
  const pageWidth = pageSize[0];
  const noWidth = 34;
  const totalWidth = 110;
  let projectWidth = 220;
  const maxTableWidth = pageWidth - margin * 2;
  let categoryWidth = Math.floor(
    (maxTableWidth - noWidth - projectWidth - totalWidth) / Math.max(1, categoryOptions.length),
  );
  if (categoryWidth < 64) {
    categoryWidth = 64;
    projectWidth = Math.max(
      120,
      maxTableWidth - noWidth - totalWidth - categoryWidth * Math.max(1, categoryOptions.length),
    );
  }
  const columns = [noWidth, projectWidth, ...categoryOptions.map(() => categoryWidth), totalWidth];
  const xAt = (index: number) => margin + columns.slice(0, index).reduce((sum, col) => sum + col, 0);

  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawCell = (params: {
    text: string;
    col: number;
    fill?: [number, number, number];
    align?: "left" | "center" | "right";
    boldText?: boolean;
  }) => {
    const x = xAt(params.col);
    const width = columns[params.col];
    const drawFont = params.boldText ? bold : font;
    page.drawRectangle({
      x,
      y: y - rowHeight,
      width,
      height: rowHeight,
      borderColor: rgb(0.22, 0.22, 0.22),
      borderWidth: 0.8,
      color: params.fill ? rgb(params.fill[0], params.fill[1], params.fill[2]) : undefined,
    });

    if (!params.text) {
      return;
    }

    const textSize = 7.5;
    const content = fitText(params.text, drawFont, textSize, width - 8);
    const textWidth = drawFont.widthOfTextAtSize(content, textSize);
    let textX = x + 4;
    if (params.align === "center") {
      textX = x + (width - textWidth) / 2;
    } else if (params.align === "right") {
      textX = x + width - textWidth - 4;
    }

    page.drawText(content, {
      x: textX,
      y: y - rowHeight + 6,
      size: textSize,
      font: drawFont,
      color: rgb(0.1, 0.12, 0.15),
    });
  };

  const drawHeader = () => {
    const title =
      summaries.length === 1
        ? `REKAP BIAYA PROJECT ${summaries[0].projectName.toUpperCase()}`
        : `REKAP BIAYA PROJECT (${summaries.length} PROJECT)`;
    const titleSize = 14;
    const titleWidth = bold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (page.getWidth() - titleWidth) / 2,
      y,
      size: titleSize,
      font: bold,
      color: rgb(0.08, 0.1, 0.12),
    });
    y -= 20;

    const selectedLabel =
      requestedProjectIds.length > 0
        ? `${requestedProjectIds.length} project terpilih`
        : "Semua project";
    page.drawText(`${selectedLabel} | Dicetak ${new Date().toLocaleString("id-ID")}`, {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.3, 0.34, 0.38),
    });
    y -= 14;

    const headers = ["NO", "PROJECT", ...categoryOptions.map((item) => item.label.toUpperCase()), "TOTAL"];
    headers.forEach((header, index) => {
      drawCell({
        text: header,
        col: index,
        fill: [0.9, 0.9, 0.9],
        align: "center",
        boldText: true,
      });
    });
    y -= rowHeight;
  };

  const ensureSpace = (space: number) => {
    if (y - space < margin + 10) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
      drawHeader();
    }
  };

  drawHeader();

  summaries.forEach((summary, index) => {
    ensureSpace(rowHeight);
    const values = [
      String(index + 1),
      summary.projectName,
      ...categoryOptions.map((item) => formatCurrency(summary.totalsByCategory[item.value] ?? 0)),
      formatCurrency(summary.total),
    ];

    values.forEach((value, col) => {
      drawCell({
        text: value,
        col,
        align: col === 0 ? "center" : col >= 2 ? "right" : "left",
      });
    });
    y -= rowHeight;
  });

  ensureSpace(rowHeight);
  const totalValues = [
    "TOTAL",
    "",
    ...categoryOptions.map((item) => formatCurrency(grandTotalsByCategory[item.value] ?? 0)),
    formatCurrency(grandTotal),
  ];
  totalValues.forEach((value, col) => {
    drawCell({
      text: value,
      col,
      fill: [1, 0.94, 0.25],
      align: col === 0 ? "left" : col >= 2 ? "right" : "left",
      boldText: true,
    });
  });

  const bytes = await pdf.save();
  const filePrefix = resolveFilePrefix(summaries.map((item) => item.projectName));
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename=\"${filePrefix}-rekap-biaya.pdf\"`,
    },
  });
}
