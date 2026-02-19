import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getProjectDetail, getProjects, getWageRecap } from "@/lib/data";

function isDateString(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getMonthStartDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
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
  const size = params.size ?? 9;
  if (params.fill) {
    params.page.drawRectangle({
      x: params.x,
      y: params.y - params.h,
      width: params.w,
      height: params.h,
      color: rgb(params.fill[0], params.fill[1], params.fill[2]),
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.8,
    });
  } else {
    params.page.drawRectangle({
      x: params.x,
      y: params.y - params.h,
      width: params.w,
      height: params.h,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.8,
    });
  }

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
  const { searchParams } = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = isDateString(searchParams.get("from"))
    ? String(searchParams.get("from"))
    : getMonthStartDate();
  const to = isDateString(searchParams.get("to")) ? String(searchParams.get("to")) : today;
  const projectId = searchParams.get("project")?.trim() || undefined;
  const teamRaw = searchParams.get("team")?.trim() || "";
  const teamType =
    teamRaw === "tukang" || teamRaw === "laden" || teamRaw === "spesialis" ? teamRaw : undefined;
  const specialist = searchParams.get("specialist")?.trim() || undefined;

  const [recap, projects] = await Promise.all([
    getWageRecap({
      from,
      to,
      projectId,
      teamType,
      specialistTeamName: specialist,
    }),
    getProjects(),
  ]);
  const projectName = projectId
    ? projects.find((project) => project.id === projectId)?.name ?? "Project"
    : "Semua Project";

  const grouped = new Map<
    string,
    {
      workerName: string;
      daysWorked: number;
      totalWage: number;
      totalKasbon: number;
      totalPaid: number;
      notes: string[];
    }
  >();

  for (const row of recap.rows) {
    const key = `${row.workerName.toLowerCase()}|${row.teamType}|${(row.specialistTeamName ?? "").toLowerCase()}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        workerName: row.workerName,
        daysWorked: 0,
        totalWage: 0,
        totalKasbon: 0,
        totalPaid: 0,
        notes: [],
      });
    }
    const current = grouped.get(key)!;
    if (row.status === "hadir") {
      current.daysWorked += 1;
    }
    current.totalWage += row.dailyWage;
    current.totalKasbon += row.kasbonAmount;
    current.totalPaid += row.netPay;
    if (row.notes && !current.notes.includes(row.notes)) {
      current.notes.push(row.notes);
    }
  }

  const workerRows = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      dailyRate: item.daysWorked > 0 ? Math.round(item.totalWage / item.daysWorked) : 0,
    }))
    .sort((a, b) => a.workerName.localeCompare(b.workerName));

  let reimburseRows: Array<{
    date: string;
    description: string;
    qty: number;
    unitPrice: number;
    total: number;
  }> = [];
  if (projectId) {
    const detail = await getProjectDetail(projectId);
    if (detail) {
      reimburseRows = detail.expenses
        .filter((row) => row.expenseDate.slice(0, 10) >= from)
        .filter((row) => row.expenseDate.slice(0, 10) <= to)
        .filter(
          (row) =>
            row.category !== "upah_kasbon_tukang" &&
            row.category !== "upah_staff_pelaksana" &&
            row.category !== "upah_tim_spesialis",
        )
        .map((row) => ({
          date: row.expenseDate.slice(0, 10),
          description: row.description ?? "-",
          qty: row.quantity,
          unitPrice: row.unitPrice,
          total: row.amount,
        }));
    }
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const margin = 24;
  const tableRow = 22;
  const tableCols = [30, 120, 58, 88, 96, 92, 140, 96];
  const reimburseCols = [30, 80, 320, 60, 120, 120];

  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawMainHeader = () => {
    page.drawText(`RINCIAN UPAH PROJECT ${projectName.toUpperCase()}`, {
      x: margin,
      y,
      size: 18,
      font: bold,
      color: rgb(0.1, 0.12, 0.16),
    });
    y -= 24;
    const meta = [`TANGGAL ${to}`, `PERIODE ${from} s/d ${to}`];
    page.drawText(meta.join(" | "), {
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
      "UPAH/HARI (Rp)",
      "JUMLAH UPAH (Rp)",
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
    if (y < margin + tableRow * 4) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
      drawMainHeader();
    }
  };

  workerRows.forEach((row, index) => {
    ensureMainSpace();
    const values = [
      String(index + 1),
      row.workerName,
      String(row.daysWorked),
      formatCurrency(row.dailyRate),
      formatCurrency(row.totalWage),
      formatCurrency(row.totalKasbon),
      row.notes.join(", ") || "-",
      formatCurrency(row.totalPaid),
    ];

    let x = margin;
    values.forEach((value, cellIndex) => {
      const align =
        cellIndex === 0
          ? "center"
          : cellIndex >= 2 && cellIndex !== 6
            ? "right"
            : "left";
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

  const totalUpah = workerRows.reduce((sum, row) => sum + row.totalWage, 0);
  const totalKasbon = workerRows.reduce((sum, row) => sum + row.totalKasbon, 0);
  const subtotal = totalUpah;
  const totalKeseluruhan = subtotal - totalKasbon;
  const labelWidth = tableCols.slice(0, 7).reduce((sum, width) => sum + width, 0);

  ensureMainSpace();
  drawCell({
    page,
    text: "JUMLAH UPAH",
    x: margin,
    y,
    w: labelWidth,
    h: tableRow,
    font: bold,
    align: "right",
  });
  drawCell({
    page,
    text: formatCurrency(totalUpah),
    x: margin + labelWidth,
    y,
    w: tableCols[7],
    h: tableRow,
    font: bold,
    align: "right",
  });
  y -= tableRow;

  drawCell({
    page,
    text: "SUBTOTAL",
    x: margin,
    y,
    w: labelWidth,
    h: tableRow,
    font: bold,
    align: "right",
    fill: [1, 0.98, 0.35],
  });
  drawCell({
    page,
    text: formatCurrency(subtotal),
    x: margin + labelWidth,
    y,
    w: tableCols[7],
    h: tableRow,
    font: bold,
    align: "right",
    fill: [1, 0.98, 0.35],
  });
  y -= tableRow;

  drawCell({
    page,
    text: "KASBON TEAM (JIKA ADA)",
    x: margin,
    y,
    w: labelWidth,
    h: tableRow,
    font: bold,
    align: "right",
    fill: [0.95, 0.27, 0.27],
  });
  drawCell({
    page,
    text: formatCurrency(totalKasbon),
    x: margin + labelWidth,
    y,
    w: tableCols[7],
    h: tableRow,
    font: bold,
    align: "right",
    fill: [0.95, 0.27, 0.27],
  });
  y -= tableRow;

  drawCell({
    page,
    text: "TOTAL KESELURUHAN",
    x: margin,
    y,
    w: labelWidth,
    h: tableRow,
    font: bold,
    align: "right",
    fill: [0.72, 0.82, 0.91],
  });
  drawCell({
    page,
    text: formatCurrency(totalKeseluruhan),
    x: margin + labelWidth,
    y,
    w: tableCols[7],
    h: tableRow,
    font: bold,
    align: "right",
    fill: [0.72, 0.82, 0.91],
  });
  y -= tableRow + 24;

  if (y < 210) {
    page = pdf.addPage(pageSize);
    y = page.getHeight() - margin;
  }

  page.drawText("REIMBURSE", {
    x: margin,
    y,
    size: 16,
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

  reimburseRows.forEach((row, index) => {
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

  const totalReimburse = reimburseRows.reduce((sum, row) => sum + row.total, 0);
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
      "Content-Disposition": `attachment; filename=\"rekap-upah-${from}-sampai-${to}.pdf\"`,
    },
  });
}
