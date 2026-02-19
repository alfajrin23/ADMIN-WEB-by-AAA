import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getProjectDetail, getProjects } from "@/lib/data";

type DetailedExpenseRow = {
  requesterName: string;
  description: string;
  expenseDate: string;
  quantity: number;
  unitLabel: string;
  usageInfo: string;
  unitPrice: number;
  material: number;
  alat: number;
  upah: number;
  ops: number;
  total: number;
};

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

function splitCategoryCost(category: string, amount: number) {
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

type PDFPageLike = Awaited<ReturnType<PDFDocument["addPage"]>>;
type PDFFontLike = Awaited<ReturnType<PDFDocument["embedFont"]>>;

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
}) {
  const size = params.size ?? 7.2;
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

  params.page.drawText(fittedText, {
    x: textX,
    y: params.y - params.h + (params.h - size) / 2 + 1,
    size,
    font: params.font,
    color: rgb(0.08, 0.1, 0.12),
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
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
    return new Response("Pilih minimal satu project untuk PDF rincian.", { status: 400 });
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
  const rowsByProjectId = new Map<string, DetailedExpenseRow[]>();

  for (const detail of details) {
    if (!detail) {
      continue;
    }

    const rows: DetailedExpenseRow[] = detail.expenses
      .map((expense) => {
        const split = splitCategoryCost(expense.category, expense.amount);
        return {
          requesterName: expense.requesterName ?? "-",
          description: expense.description ?? "-",
          expenseDate: expense.expenseDate,
          quantity: expense.quantity > 0 ? expense.quantity : 0,
          unitLabel: expense.unitLabel ?? "-",
          usageInfo: expense.usageInfo ?? "-",
          unitPrice: expense.unitPrice > 0 ? expense.unitPrice : 0,
          material: split.material,
          alat: split.alat,
          upah: split.upah,
          ops: split.ops,
          total: expense.amount,
        };
      })
      .sort((a, b) => {
        if (a.expenseDate !== b.expenseDate) {
          return a.expenseDate.localeCompare(b.expenseDate);
        }
        return a.requesterName.localeCompare(b.requesterName);
      });

    rowsByProjectId.set(detail.project.id, rows);
  }

  const hasAnyRows = Array.from(rowsByProjectId.values()).some((rows) => rows.length > 0);
  if (!hasAnyRows) {
    return new Response("Belum ada data biaya project.", { status: 404 });
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [1191, 842];
  const margin = 24;
  const rowHeight = 18;
  const columns = [24, 94, 58, 150, 30, 36, 170, 72, 80, 68, 80, 74, 88];
  const xAt = (index: number) => margin + columns.slice(0, index).reduce((sum, col) => sum + col, 0);
  const widthUntil = (start: number, end: number) =>
    columns.slice(start, end + 1).reduce((sum, width) => sum + width, 0);

  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;
  let currentProjectTitle = "";

  const drawHeader = (projectName: string) => {
    currentProjectTitle = projectName;
    const title = `RINCIAN REKAP BIAYA PROJECT ${projectName.toUpperCase()}`;
    const titleSize = 16;
    const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (page.getWidth() - titleWidth) / 2,
      y,
      size: titleSize,
      font: boldFont,
      color: rgb(0.1, 0.12, 0.15),
    });
    y -= 22;

    page.drawText(`Dicetak ${new Date().toLocaleString("id-ID")}`, {
      x: margin,
      y,
      size: 8.5,
      font,
      color: rgb(0.32, 0.36, 0.4),
    });
    y -= 14;

    const headers = [
      "NO",
      "PENGAJUAN",
      "TGL",
      "KETERANGAN",
      "QTY",
      "KET",
      "INFORMASI PENGGUNAAN",
      "HARGA",
      "MATERIAL",
      "ALAT",
      "UPAH/KASBON",
      "OPS",
      "TOTAL",
    ];
    headers.forEach((text, index) => {
      const fill: [number, number, number] =
        index === 8
          ? [0.9, 0.86, 0.72]
          : index === 9
            ? [0.84, 0.71, 0.85]
            : index === 10
              ? [0.77, 0.77, 0.77]
              : index === 11
                ? [0.56, 0.76, 0.87]
                : [0.9, 0.9, 0.9];
      drawCell({
        page,
        text,
        x: xAt(index),
        y,
        w: columns[index],
        h: rowHeight,
        font: boldFont,
        size: 7,
        align: "center",
        fill,
      });
    });
    y -= rowHeight;
  };

  const ensureSpace = (neededHeight: number) => {
    if (y - neededHeight < margin + 12) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
      drawHeader(currentProjectTitle);
    }
  };

  const grandTotals = { material: 0, alat: 0, upah: 0, ops: 0, total: 0 };
  let renderedProjects = 0;

  for (const project of selectedProjects) {
    const projectRows = rowsByProjectId.get(project.id) ?? [];
    if (projectRows.length === 0) {
      continue;
    }

    if (renderedProjects > 0) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
    }
    drawHeader(project.name);
    renderedProjects += 1;

    const groupedByMonth = new Map<string, DetailedExpenseRow[]>();
    for (const row of projectRows) {
      const key = getMonthKey(row.expenseDate);
      if (!groupedByMonth.has(key)) {
        groupedByMonth.set(key, []);
      }
      groupedByMonth.get(key)?.push(row);
    }

    const projectTotals = { material: 0, alat: 0, upah: 0, ops: 0, total: 0 };
    let rowNo = 1;

    for (const [monthKey, monthRows] of groupedByMonth.entries()) {
      const monthTotals = { material: 0, alat: 0, upah: 0, ops: 0, total: 0 };
      for (const row of monthRows) {
        ensureSpace(rowHeight + 2);
        monthTotals.material += row.material;
        monthTotals.alat += row.alat;
        monthTotals.upah += row.upah;
        monthTotals.ops += row.ops;
        monthTotals.total += row.total;

        projectTotals.material += row.material;
        projectTotals.alat += row.alat;
        projectTotals.upah += row.upah;
        projectTotals.ops += row.ops;
        projectTotals.total += row.total;

        grandTotals.material += row.material;
        grandTotals.alat += row.alat;
        grandTotals.upah += row.upah;
        grandTotals.ops += row.ops;
        grandTotals.total += row.total;

        const values = [
          String(rowNo),
          row.requesterName,
          formatDateCell(row.expenseDate),
          row.description,
          row.quantity > 0 ? String(row.quantity) : "",
          row.unitLabel,
          row.usageInfo,
          row.unitPrice > 0 ? formatCurrency(row.unitPrice) : "-",
          row.material > 0 ? formatCurrency(row.material) : "-",
          row.alat > 0 ? formatCurrency(row.alat) : "-",
          row.upah > 0 ? formatCurrency(row.upah) : "-",
          row.ops > 0 ? formatCurrency(row.ops) : "-",
          formatCurrency(row.total),
        ];

        values.forEach((value, index) => {
          const align =
            index === 0 || index === 2
              ? "center"
              : index >= 4 && index !== 5 && index !== 6
                ? "right"
                : "left";
          drawCell({
            page,
            text: value,
            x: xAt(index),
            y,
            w: columns[index],
            h: rowHeight,
            font,
            size: 7.2,
            align,
          });
        });

        y -= rowHeight;
        rowNo += 1;
      }

      ensureSpace(rowHeight + 2);
      drawCell({
        page,
        text: `TOTAL PENGELUARAN COST ${formatMonthLabel(monthKey)}`,
        x: xAt(0),
        y,
        w: widthUntil(0, 7),
        h: rowHeight + 2,
        font: boldFont,
        size: 7.4,
        align: "left",
        fill: [1, 0.94, 0.25],
      });
      drawCell({
        page,
        text: monthTotals.material > 0 ? formatCurrency(monthTotals.material) : "Rp-",
        x: xAt(8),
        y,
        w: columns[8],
        h: rowHeight + 2,
        font: boldFont,
        size: 7.2,
        align: "right",
        fill: [1, 0.94, 0.25],
      });
      drawCell({
        page,
        text: monthTotals.alat > 0 ? formatCurrency(monthTotals.alat) : "Rp-",
        x: xAt(9),
        y,
        w: columns[9],
        h: rowHeight + 2,
        font: boldFont,
        size: 7.2,
        align: "right",
        fill: [1, 0.94, 0.25],
      });
      drawCell({
        page,
        text: monthTotals.upah > 0 ? formatCurrency(monthTotals.upah) : "Rp-",
        x: xAt(10),
        y,
        w: columns[10],
        h: rowHeight + 2,
        font: boldFont,
        size: 7.2,
        align: "right",
        fill: [1, 0.94, 0.25],
      });
      drawCell({
        page,
        text: monthTotals.ops > 0 ? formatCurrency(monthTotals.ops) : "Rp-",
        x: xAt(11),
        y,
        w: columns[11],
        h: rowHeight + 2,
        font: boldFont,
        size: 7.2,
        align: "right",
        fill: [1, 0.94, 0.25],
      });
      drawCell({
        page,
        text: monthTotals.total > 0 ? formatCurrency(monthTotals.total) : "Rp-",
        x: xAt(12),
        y,
        w: columns[12],
        h: rowHeight + 2,
        font: boldFont,
        size: 7.2,
        align: "right",
        fill: [1, 0.94, 0.25],
      });
      y -= rowHeight + 2;
    }

    ensureSpace(rowHeight + 4);
    drawCell({
      page,
      text: `TOTAL KESELURUHAN ${project.name.toUpperCase()}`,
      x: xAt(0),
      y,
      w: widthUntil(0, 7),
      h: rowHeight + 2,
      font: boldFont,
      size: 7.8,
      align: "left",
      fill: [0.76, 0.86, 0.93],
    });
    drawCell({
      page,
      text: projectTotals.material > 0 ? formatCurrency(projectTotals.material) : "Rp-",
      x: xAt(8),
      y,
      w: columns[8],
      h: rowHeight + 2,
      font: boldFont,
      size: 7.2,
      align: "right",
      fill: [0.76, 0.86, 0.93],
    });
    drawCell({
      page,
      text: projectTotals.alat > 0 ? formatCurrency(projectTotals.alat) : "Rp-",
      x: xAt(9),
      y,
      w: columns[9],
      h: rowHeight + 2,
      font: boldFont,
      size: 7.2,
      align: "right",
      fill: [0.76, 0.86, 0.93],
    });
    drawCell({
      page,
      text: projectTotals.upah > 0 ? formatCurrency(projectTotals.upah) : "Rp-",
      x: xAt(10),
      y,
      w: columns[10],
      h: rowHeight + 2,
      font: boldFont,
      size: 7.2,
      align: "right",
      fill: [0.76, 0.86, 0.93],
    });
    drawCell({
      page,
      text: projectTotals.ops > 0 ? formatCurrency(projectTotals.ops) : "Rp-",
      x: xAt(11),
      y,
      w: columns[11],
      h: rowHeight + 2,
      font: boldFont,
      size: 7.2,
      align: "right",
      fill: [0.76, 0.86, 0.93],
    });
    drawCell({
      page,
      text: projectTotals.total > 0 ? formatCurrency(projectTotals.total) : "Rp-",
      x: xAt(12),
      y,
      w: columns[12],
      h: rowHeight + 2,
      font: boldFont,
      size: 7.2,
      align: "right",
      fill: [0.76, 0.86, 0.93],
    });
  }

  if (renderedProjects > 1) {
    page = pdf.addPage(pageSize);
    y = page.getHeight() - margin;

    const title = "RINGKASAN TOTAL SEMUA DESA";
    const titleWidth = boldFont.widthOfTextAtSize(title, 18);
    page.drawText(title, {
      x: (page.getWidth() - titleWidth) / 2,
      y,
      size: 18,
      font: boldFont,
      color: rgb(0.1, 0.12, 0.15),
    });
    y -= 30;

    drawCell({
      page,
      text: "COST MATERIAL",
      x: margin,
      y,
      w: 220,
      h: 24,
      font: boldFont,
      fill: [0.9, 0.86, 0.72],
    });
    drawCell({
      page,
      text: grandTotals.material > 0 ? formatCurrency(grandTotals.material) : "Rp-",
      x: margin + 220,
      y,
      w: 240,
      h: 24,
      font: boldFont,
      align: "right",
      fill: [0.9, 0.86, 0.72],
    });
    y -= 24;

    drawCell({
      page,
      text: "COST ALAT",
      x: margin,
      y,
      w: 220,
      h: 24,
      font: boldFont,
      fill: [0.84, 0.71, 0.85],
    });
    drawCell({
      page,
      text: grandTotals.alat > 0 ? formatCurrency(grandTotals.alat) : "Rp-",
      x: margin + 220,
      y,
      w: 240,
      h: 24,
      font: boldFont,
      align: "right",
      fill: [0.84, 0.71, 0.85],
    });
    y -= 24;

    drawCell({
      page,
      text: "COST UPAH/KASBON",
      x: margin,
      y,
      w: 220,
      h: 24,
      font: boldFont,
      fill: [0.77, 0.77, 0.77],
    });
    drawCell({
      page,
      text: grandTotals.upah > 0 ? formatCurrency(grandTotals.upah) : "Rp-",
      x: margin + 220,
      y,
      w: 240,
      h: 24,
      font: boldFont,
      align: "right",
      fill: [0.77, 0.77, 0.77],
    });
    y -= 24;

    drawCell({
      page,
      text: "COST OPS",
      x: margin,
      y,
      w: 220,
      h: 24,
      font: boldFont,
      fill: [0.56, 0.76, 0.87],
    });
    drawCell({
      page,
      text: grandTotals.ops > 0 ? formatCurrency(grandTotals.ops) : "Rp-",
      x: margin + 220,
      y,
      w: 240,
      h: 24,
      font: boldFont,
      align: "right",
      fill: [0.56, 0.76, 0.87],
    });
    y -= 24;

    drawCell({
      page,
      text: "TOTAL KESELURUHAN",
      x: margin,
      y,
      w: 220,
      h: 24,
      font: boldFont,
      fill: [0.76, 0.86, 0.93],
    });
    drawCell({
      page,
      text: grandTotals.total > 0 ? formatCurrency(grandTotals.total) : "Rp-",
      x: margin + 220,
      y,
      w: 240,
      h: 24,
      font: boldFont,
      align: "right",
      fill: [0.76, 0.86, 0.93],
    });
  }

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=\"rincian-rekap-biaya-semua-project.pdf\"",
    },
  });
}
