import { Buffer } from "node:buffer";
import * as XLSX from "xlsx/xlsx.mjs";
import { getProjectDetail, getProjects, getWageRecap } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";

function isDateString(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getMonthStartDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function parseRupiah(value: string | null) {
  if (!value) {
    return 0;
  }
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function makeMerge(startRow: number, startCol: number, endRow: number, endCol: number): XLSX.Range {
  return {
    s: { r: startRow, c: startCol },
    e: { r: endRow, c: endCol },
  };
}

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
  const selectedWorkers = Array.from(
    new Set(
      searchParams
        .getAll("worker")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
  const reportTitleMode = searchParams.get("report_title_mode") === "custom" ? "custom" : "project";
  const reportTitleCustom = searchParams.get("report_title_custom")?.trim() || "";
  const reimburseInput = parseRupiah(searchParams.get("reimburse_amount"));
  const reimburseInputNote = searchParams.get("reimburse_note")?.trim() || "Input Reimburse";

  const [projects, recap] = await Promise.all([
    getProjects(),
    getWageRecap({
      from,
      to,
      projectId,
      teamType,
      specialistTeamName: specialist,
      workerNames: selectedWorkers,
      includePaid: true,
      recapMode: "gabung",
    }),
  ]);

  const projectName = projectId
    ? projects.find((project) => project.id === projectId)?.name ?? "Project"
    : "Semua Project";
  const projectNamesFromRows = Array.from(
    new Set(
      recap.rows
        .map((row) => row.projectName?.trim() || "")
        .filter((value) => value.length > 0),
    ),
  );
  const titleProjectSource = projectNamesFromRows.length === 1 ? projectNamesFromRows[0] : projectName;
  const reportTitle =
    reportTitleMode === "custom" && reportTitleCustom.length > 0
      ? reportTitleCustom
      : `RINCIAN UPAH PROJECT ${titleProjectSource}`;

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
      current.daysWorked += row.workDays;
    }
    current.totalWage += row.status === "hadir" ? row.dailyWage * row.workDays : 0;
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
  if (reimburseInput > 0) {
    reimburseRows.push({
      date: to,
      description: reimburseInputNote,
      qty: 1,
      unitPrice: reimburseInput,
      total: reimburseInput,
    });
  }

  const totalUpah = workerRows.reduce((sum, row) => sum + row.totalWage, 0);
  const totalKasbon = workerRows.reduce((sum, row) => sum + row.totalKasbon, 0);
  const subtotal = totalUpah;
  const totalKeseluruhan = subtotal - totalKasbon;
  const totalReimburse = reimburseRows.reduce((sum, row) => sum + row.total, 0);

  const rows: Array<Array<string | number>> = [];
  const merges: XLSX.Range[] = [];

  rows.push([reportTitle.toUpperCase()]);
  merges.push(makeMerge(0, 0, 0, 7));
  rows.push([`TANGGAL ${to} | PERIODE ${from} s/d ${to}`]);
  merges.push(makeMerge(1, 0, 1, 7));
  rows.push([]);

  rows.push([
    "NO",
    "NAMA PEKERJA",
    "HARI KERJA",
    "UPAH/HARI (Rp)",
    "JUMLAH UPAH (Rp)",
    "KASBON (Rp)",
    "KETERANGAN",
    "TOTAL DIBAYAR (Rp)",
  ]);

  if (workerRows.length === 0) {
    rows.push(["1", "-", "0", formatCurrency(0), formatCurrency(0), formatCurrency(0), "-", formatCurrency(0)]);
  } else {
    workerRows.forEach((row, index) => {
      rows.push([
        String(index + 1),
        row.workerName,
        String(row.daysWorked),
        formatCurrency(row.dailyRate),
        formatCurrency(row.totalWage),
        formatCurrency(row.totalKasbon),
        row.notes.join(", ") || "-",
        formatCurrency(row.totalPaid),
      ]);
    });
  }

  const summaryRowStart = rows.length;
  rows.push(["JUMLAH UPAH", "", "", "", "", "", "", formatCurrency(totalUpah)]);
  rows.push(["SUBTOTAL", "", "", "", "", "", "", formatCurrency(subtotal)]);
  rows.push(["KASBON TEAM (JIKA ADA)", "", "", "", "", "", "", formatCurrency(totalKasbon)]);
  rows.push(["TOTAL KESELURUHAN", "", "", "", "", "", "", formatCurrency(totalKeseluruhan)]);
  for (let i = 0; i < 4; i += 1) {
    merges.push(makeMerge(summaryRowStart + i, 0, summaryRowStart + i, 6));
  }

  rows.push([]);
  const reimburseTitleRow = rows.length;
  rows.push(["REIMBURSE"]);
  merges.push(makeMerge(reimburseTitleRow, 0, reimburseTitleRow, 5));
  rows.push(["NO", "TANGGAL", "KETERANGAN", "QTY", "HARGA SATUAN", "TOTAL"]);

  if (reimburseRows.length === 0) {
    rows.push(["1", "-", "Tidak ada reimburse", "0", formatCurrency(0), formatCurrency(0)]);
  } else {
    reimburseRows.forEach((row, index) => {
      rows.push([
        String(index + 1),
        formatDate(row.date),
        row.description,
        String(row.qty || 0),
        formatCurrency(row.unitPrice),
        formatCurrency(row.total),
      ]);
    });
  }

  const reimburseTotalRow = rows.length;
  rows.push(["TOTAL REIMBURSE", "", "", "", "", formatCurrency(totalReimburse)]);
  merges.push(makeMerge(reimburseTotalRow, 0, reimburseTotalRow, 4));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!merges"] = merges;
  sheet["!cols"] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 40 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Rekap Upah");

  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"rekap-upah-${from}-sampai-${to}.xlsx\"`,
    },
  });
}
