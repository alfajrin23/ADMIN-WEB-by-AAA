import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getProjectDetail, getProjects } from "@/lib/data";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyOrDash(value: number) {
  return value > 0 ? formatCurrency(value) : "Rp-";
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
  material: number;
  alat: number;
  lainLain: number;
  upah: number;
  listrik: number;
  subcont: number;
  perawatan: number;
  ops: number;
  total: number;
  note: string;
};

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

  const details = await Promise.all(selectedProjects.map((project) => getProjectDetail(project.id)));
  const summaries: ProjectSummary[] = [];

  for (const detail of details) {
    if (!detail) {
      continue;
    }

    const summary: ProjectSummary = {
      projectId: detail.project.id,
      projectName: detail.project.name,
      material: 0,
      alat: 0,
      lainLain: 0,
      upah: 0,
      listrik: 0,
      subcont: 0,
      perawatan: 0,
      ops: 0,
      total: 0,
      note: "",
    };

    for (const expense of detail.expenses) {
      const split = splitCategoryCost(expense.category, expense.amount);
      summary.material += split.material;
      summary.alat += split.alat;
      summary.upah += split.upah;
      summary.ops += split.ops;
      summary.total += expense.amount;
    }

    summaries.push(summary);
  }

  if (summaries.length === 0) {
    return new Response("Belum ada data biaya project.", { status: 404 });
  }

  summaries.sort((a, b) => b.total - a.total);

  const totals = summaries.reduce(
    (acc, item) => ({
      material: acc.material + item.material,
      alat: acc.alat + item.alat,
      lainLain: acc.lainLain + item.lainLain,
      upah: acc.upah + item.upah,
      listrik: acc.listrik + item.listrik,
      subcont: acc.subcont + item.subcont,
      perawatan: acc.perawatan + item.perawatan,
      ops: acc.ops + item.ops,
      total: acc.total + item.total,
    }),
    {
      material: 0,
      alat: 0,
      lainLain: 0,
      upah: 0,
      listrik: 0,
      subcont: 0,
      perawatan: 0,
      ops: 0,
      total: 0,
    },
  );

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const margin = 28;
  const rowHeight = 18;
  const columns = [24, 150, 58, 52, 52, 64, 52, 52, 56, 56, 70, 100];
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
    if (params.fill) {
      page.drawRectangle({
        x,
        y: y - rowHeight,
        width,
        height: rowHeight,
        color: rgb(params.fill[0], params.fill[1], params.fill[2]),
        borderColor: rgb(0.22, 0.22, 0.22),
        borderWidth: 0.8,
      });
    } else {
      page.drawRectangle({
        x,
        y: y - rowHeight,
        width,
        height: rowHeight,
        borderColor: rgb(0.22, 0.22, 0.22),
        borderWidth: 0.8,
      });
    }

    if (!params.text) {
      return;
    }

    const textSize = 7.6;
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
    const title = "REKAPITULASI BIAYA PENGELUARAN PROJECT";
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
      requestedProjectIds.length > 0 ? `${requestedProjectIds.length} project terpilih` : "Semua project";
    page.drawText(`${selectedLabel} | Dicetak ${new Date().toLocaleString("id-ID")}`, {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.3, 0.34, 0.38),
    });
    y -= 14;

    const headers = [
      "NO",
      "KETERANGAN",
      "COST MATERIAL",
      "COST ALAT",
      "COST LAIN-LAIN",
      "COST UPAH/KASBON",
      "COST LISTRIK",
      "COST SUBCONT",
      "COST PERAWATAN",
      "COST OPERASIONAL",
      "TOTAL COST",
      "KETERANGAN",
    ];
    headers.forEach((header, index) => {
      const fill: [number, number, number] =
        index === 2
          ? [0.9, 0.86, 0.72]
          : index === 3
            ? [0.84, 0.71, 0.85]
            : index === 4
              ? [0.9, 0.9, 0.9]
              : index === 5
                ? [0.77, 0.77, 0.77]
                : index === 6
                  ? [0.82, 0.89, 0.97]
                  : index === 7
                    ? [0.89, 0.87, 0.93]
                    : index === 8
                      ? [0.88, 0.93, 0.84]
                      : index === 9
                        ? [0.56, 0.76, 0.87]
                        : [0.9, 0.9, 0.9];
      drawCell({
        text: header,
        col: index,
        fill,
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

  summaries.forEach((item, index) => {
    ensureSpace(rowHeight);
    const values = [
      String(index + 1),
      item.projectName,
      formatCurrencyOrDash(item.material),
      formatCurrencyOrDash(item.alat),
      formatCurrencyOrDash(item.lainLain),
      formatCurrencyOrDash(item.upah),
      formatCurrencyOrDash(item.listrik),
      formatCurrencyOrDash(item.subcont),
      formatCurrencyOrDash(item.perawatan),
      formatCurrencyOrDash(item.ops),
      formatCurrency(item.total),
      item.note,
    ];

    values.forEach((value, col) => {
      drawCell({
        text: value,
        col,
        align: col === 0 ? "center" : col >= 2 && col <= 10 ? "right" : "left",
      });
    });
    y -= rowHeight;
  });

  ensureSpace(rowHeight);
  const totalValues = [
    "TOTAL COST PER ITEM",
    "",
    formatCurrencyOrDash(totals.material),
    formatCurrencyOrDash(totals.alat),
    formatCurrencyOrDash(totals.lainLain),
    formatCurrencyOrDash(totals.upah),
    formatCurrencyOrDash(totals.listrik),
    formatCurrencyOrDash(totals.subcont),
    formatCurrencyOrDash(totals.perawatan),
    formatCurrencyOrDash(totals.ops),
    formatCurrency(totals.total),
    "",
  ];
  totalValues.forEach((value, col) => {
    drawCell({
      text: value,
      col,
      fill: [1, 0.94, 0.25],
      align: col === 0 ? "left" : col >= 2 && col <= 10 ? "right" : "left",
      boldText: true,
    });
  });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=\"rekap-biaya-semua-project.pdf\"",
    },
  });
}
