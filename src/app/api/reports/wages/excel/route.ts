import { Buffer } from "node:buffer";
import * as XLSX from "xlsx/xlsx.mjs";
import { getProjects, getWageRecap } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { WORKER_TEAM_LABEL } from "@/lib/constants";

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

  const workerRows = recap.workerSummaries.map((item, index) => ({
    No: index + 1,
    Pekerja: item.workerName,
    Project: item.projectName ?? "Gabungan Project",
    "Hari Kerja": item.workDays,
    "Total Gaji": item.totalDailyWage,
    "Total Kasbon": item.totalKasbon,
    "Total Harus Dibayar": item.totalNetPay,
    "Sisa Belum Digaji": item.totalNetPayUnpaid,
    "Status Gaji": item.payrollPaid ? "Sudah Digaji" : "Belum Digaji",
    "Update Terakhir": item.latestAttendanceDate ? formatDate(item.latestAttendanceDate) : "-",
  }));

  const detailRows = recap.rows.map((item, index) => ({
    No: index + 1,
    Tanggal: formatDate(item.attendanceDate),
    Project: item.projectName ?? "-",
    Pekerja: item.workerName,
    Tim:
      item.teamType === "spesialis"
        ? `Spesialis - ${item.specialistTeamName ?? "Lainnya"}`
        : WORKER_TEAM_LABEL[item.teamType],
    Status: item.status,
    "Gaji Harian": item.dailyWage,
    Kasbon: item.kasbonAmount,
    "Harus Dibayar": item.netPay,
    "Status Gaji": item.payrollPaid ? "Sudah Digaji" : "Belum Digaji",
    Catatan: item.notes ?? "-",
  }));

  const summaryRows = [
    {
      Keterangan: "Judul Laporan",
      Nilai: reportTitle,
    },
    {
      Keterangan: "Periode",
      Nilai: `${from} s/d ${to}`,
    },
    {
      Keterangan: "Project",
      Nilai: projectName,
    },
    {
      Keterangan: "Total Gaji",
      Nilai: formatCurrency(recap.totalDailyWage),
    },
    {
      Keterangan: "Total Kasbon",
      Nilai: formatCurrency(recap.totalKasbon),
    },
    {
      Keterangan: "Total Harus Dibayar",
      Nilai: formatCurrency(recap.totalNetPay),
    },
    {
      Keterangan: "Reimburse Input",
      Nilai: reimburseInput > 0 ? formatCurrency(reimburseInput) : "Rp0",
    },
    {
      Keterangan: "Keterangan Reimburse",
      Nilai: reimburseInput > 0 ? reimburseInputNote : "-",
    },
  ];
  const manualReimburseRows =
    reimburseInput > 0
      ? [
          {
            Tanggal: formatDate(to),
            Keterangan: reimburseInputNote,
            Nominal: reimburseInput,
          },
        ]
      : [{ Keterangan: "Tidak ada reimburse manual", Nominal: 0 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(summaryRows),
    "Ringkasan",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      workerRows.length > 0 ? workerRows : [{ Keterangan: "Tidak ada data pekerja" }],
    ),
    "Rekap Pekerja",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      detailRows.length > 0 ? detailRows : [{ Keterangan: "Tidak ada data absensi" }],
    ),
    "Detail Absensi",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(manualReimburseRows),
    "Reimburse Manual",
  );

  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"rekap-upah-${from}-sampai-${to}.xlsx\"`,
    },
  });
}
