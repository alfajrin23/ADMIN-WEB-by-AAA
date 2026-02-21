import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mergeExpenseCategoryOptions } from "@/lib/constants";
import { getExpenseCategories, getProjectDetail } from "@/lib/data";

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get("preview") === "1";
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

  const categoryOptions = mergeExpenseCategoryOptions(
    await getExpenseCategories(),
    rows.map((row) => row.category),
  );
  const totalsByCategory = Object.fromEntries(
    categoryOptions.map((item) => [item.value, 0]),
  ) as Record<string, number>;
  let grandTotal = 0;
  for (const row of rows) {
    totalsByCategory[row.category] = (totalsByCategory[row.category] ?? 0) + row.amount;
    grandTotal += row.amount;
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [1191, 842];
  const margin = 24;
  const rowHeight = 19;
  const columns = [30, 88, 120, 128, 250, 42, 68, 90, 88];
  const xAt = (index: number) => margin + columns.slice(0, index).reduce((sum, width) => sum + width, 0);

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
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.7,
      color: params.fill ? rgb(params.fill[0], params.fill[1], params.fill[2]) : undefined,
    });

    if (!params.text) {
      return;
    }

    const size = 7.5;
    const content = fitText(params.text, drawFont, size, width - 6);
    const textWidth = drawFont.widthOfTextAtSize(content, size);
    let textX = x + 3;
    if (params.align === "center") {
      textX = x + (width - textWidth) / 2;
    } else if (params.align === "right") {
      textX = x + width - textWidth - 3;
    }

    page.drawText(content, {
      x: textX,
      y: y - rowHeight + 6,
      size,
      font: drawFont,
      color: rgb(0.08, 0.1, 0.12),
    });
  };

  const drawHeader = () => {
    const title = `RINCIAN BIAYA PROJECT ${detail.project.name.toUpperCase()}`;
    const titleSize = 16;
    const titleWidth = bold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (page.getWidth() - titleWidth) / 2,
      y,
      size: titleSize,
      font: bold,
      color: rgb(0.1, 0.12, 0.15),
    });
    y -= 24;

    page.drawText(`Periode ${from} s/d ${to} | Dicetak ${new Date().toLocaleString("id-ID")}`, {
      x: margin,
      y,
      size: 8.5,
      font,
      color: rgb(0.32, 0.36, 0.4),
    });
    y -= 14;

    const headers = [
      "NO",
      "TANGGAL",
      "PENGAJUAN",
      "KATEGORI",
      "KETERANGAN",
      "QTY",
      "SATUAN",
      "HARGA",
      "TOTAL",
    ];
    headers.forEach((text, index) => {
      drawCell({
        text,
        col: index,
        fill: [0.9, 0.9, 0.9],
        align: "center",
        boldText: true,
      });
    });
    y -= rowHeight;
  };

  const ensureSpace = (space: number) => {
    if (y - space < margin + 20) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
      drawHeader();
    }
  };

  drawHeader();

  rows.forEach((row, index) => {
    ensureSpace(rowHeight);
    const values = [
      String(index + 1),
      row.expenseDate.slice(0, 10),
      row.requesterName ?? "-",
      row.category,
      row.description ?? "-",
      row.quantity > 0 ? String(row.quantity) : "",
      row.unitLabel ?? "-",
      row.unitPrice > 0 ? formatCurrency(row.unitPrice) : "-",
      formatCurrency(row.amount),
    ];
    values.forEach((value, col) => {
      drawCell({
        text: value,
        col,
        align: col === 0 || col === 1 ? "center" : col >= 5 ? "right" : "left",
      });
    });
    y -= rowHeight;
  });

  ensureSpace(rowHeight);
  const totalRow = ["", "", "", "", "TOTAL", "", "", "", formatCurrency(grandTotal)];
  totalRow.forEach((value, col) => {
    drawCell({
      text: value,
      col,
      fill: [1, 0.94, 0.25],
      align: col === 8 ? "right" : "left",
      boldText: true,
    });
  });
  y -= rowHeight + 14;

  ensureSpace(18 + categoryOptions.length * 16);
  page.drawText("Ringkasan per kategori:", {
    x: margin,
    y,
    size: 9,
    font: bold,
    color: rgb(0.12, 0.14, 0.17),
  });
  y -= 14;
  for (const category of categoryOptions) {
    const total = totalsByCategory[category.value] ?? 0;
    page.drawText(`${category.label}: ${formatCurrency(total)}`, {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.22, 0.25, 0.3),
    });
    y -= 12;
  }

  const bytes = await pdf.save();
  const filePrefix = toFileSlug(detail.project.name) || "project";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename=\"${filePrefix}-rekap-biaya.pdf\"`,
    },
  });
}
