import { getWageRecap } from "@/lib/data";

export type WageExportMode = "selected" | "project" | "specialist";

export type WageWorkerReportRow = {
  workerName: string;
  daysWorked: number;
  overtimeHours: number;
  overtimeRate: number;
  totalOvertimePay: number;
  dailyRate: number;
  totalWage: number;
  totalKasbon: number;
  totalPaid: number;
  projectNames: string[];
  notes: string[];
};

export type WageReimburseReportRow = {
  date: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export type WageReportData = {
  from: string;
  to: string;
  exportMode: WageExportMode;
  reportTitle: string;
  workers: WageWorkerReportRow[];
  reimburseRows: WageReimburseReportRow[];
  totalUpah: number;
  totalLembur: number;
  totalKasbon: number;
  totalReimburse: number;
  subtotal: number;
  totalKeseluruhan: number;
};

type WageReportResult =
  | {
      ok: true;
      data: WageReportData;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

type FilterRowsResult =
  | {
      ok: true;
      rows: WageAttendanceRow[];
      specialistTeamName: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

type WageAttendanceRow = Awaited<ReturnType<typeof getWageRecap>>["rows"][number];

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

function parseExportMode(value: string | null): WageExportMode {
  if (value === "project" || value === "specialist") {
    return value;
  }
  return "selected";
}

function parseSelectedIds(searchParams: URLSearchParams) {
  return Array.from(
    new Set(
      searchParams
        .getAll("selected")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function parseReimburseRows(searchParams: URLSearchParams, to: string): WageReimburseReportRow[] {
  const reimburseAmounts = searchParams.getAll("reimburse_amount");
  const reimburseNotes = searchParams.getAll("reimburse_note");
  const rowCount = Math.max(reimburseAmounts.length, reimburseNotes.length);
  const rows: WageReimburseReportRow[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const amount = parseRupiah(reimburseAmounts[index] ?? null);
    const description = (reimburseNotes[index] ?? "").trim();
    if (amount <= 0 && description.length === 0) {
      continue;
    }
    if (amount <= 0) {
      continue;
    }
    rows.push({
      date: to,
      description: description || `Reimburse ${index + 1}`,
      qty: 1,
      unitPrice: amount,
      total: amount,
    });
  }

  return rows;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((item) => item.length > 0)));
}

function buildDefaultTitle(params: {
  exportMode: WageExportMode;
  specialistTeamName: string;
  specialistProjectName: string;
  rowProjectNames: string[];
}) {
  if (params.exportMode === "specialist") {
    const projectLabel =
      params.specialistProjectName || params.rowProjectNames.join(", ") || "LINTAS PROJECT";
    return `RINCIAN UPAH TIM ${params.specialistTeamName.toUpperCase()} (${projectLabel.toUpperCase()})`;
  }
  if (params.exportMode === "project") {
    if (params.rowProjectNames.length === 1) {
      return `RINCIAN UPAH PROJECT ${params.rowProjectNames[0].toUpperCase()}`;
    }
    if (params.rowProjectNames.length > 1) {
      return `RINCIAN UPAH PROJECT ${params.rowProjectNames.join(", ").toUpperCase()}`;
    }
    return "RINCIAN UPAH PROJECT";
  }
  if (params.rowProjectNames.length === 1) {
    return `RINCIAN UPAH PROJECT ${params.rowProjectNames[0].toUpperCase()}`;
  }
  return "RINCIAN UPAH PEKERJA TERPILIH";
}

function filterRowsByMode(params: {
  rows: WageAttendanceRow[];
  exportMode: WageExportMode;
  selectedIds: string[];
  specialistTeamNameInput: string;
}): FilterRowsResult {
  const selectedSet = new Set(params.selectedIds);
  const selectedRows = params.rows.filter((row) => selectedSet.has(row.id));

  if (params.exportMode === "selected") {
    if (selectedRows.length === 0) {
      return {
        ok: false,
        status: 400,
        message: "Belum ada data checklist terpilih. Pilih pekerja dulu lalu export.",
      };
    }
    return { ok: true, rows: selectedRows, specialistTeamName: params.specialistTeamNameInput };
  }

  if (params.exportMode === "project") {
    if (selectedRows.length === 0) {
      return {
        ok: false,
        status: 400,
        message: "Checklist project wajib dipilih dulu sebelum export mode project.",
      };
    }
    const selectedProjectIds = uniqueStrings(
      selectedRows
        .filter((row) => row.teamType !== "spesialis")
        .map((row) => row.projectId.trim()),
    );
    if (selectedProjectIds.length === 0) {
      return {
        ok: false,
        status: 400,
        message: "Checklist project belum ada. Pilih minimal 1 data non-spesialis.",
      };
    }
    return {
      ok: true,
      rows: params.rows.filter(
        (row) => row.teamType !== "spesialis" && selectedProjectIds.includes(row.projectId),
      ),
      specialistTeamName: params.specialistTeamNameInput,
    };
  }

  if (selectedRows.length === 0 && params.specialistTeamNameInput.length === 0) {
    return {
      ok: false,
      status: 400,
      message: "Checklist tim spesialis atau nama tim spesialis wajib diisi.",
    };
  }

  let specialistTeamName = params.specialistTeamNameInput;
  if (specialistTeamName.length === 0) {
    const selectedSpecialistTeams = uniqueStrings(
      selectedRows
        .filter((row) => row.teamType === "spesialis")
        .map((row) => row.specialistTeamName?.trim() || ""),
    );
    if (selectedSpecialistTeams.length === 1) {
      [specialistTeamName] = selectedSpecialistTeams;
    }
  }
  if (specialistTeamName.length === 0) {
    return {
      ok: false,
      status: 400,
      message: "Nama tim spesialis wajib diisi atau pilih checklist tim spesialis yang sama.",
    };
  }

  const normalizedSpecialist = normalizeText(specialistTeamName);
  return {
    ok: true,
    rows: params.rows.filter(
      (row) =>
        row.teamType === "spesialis" && normalizeText(row.specialistTeamName) === normalizedSpecialist,
    ),
    specialistTeamName,
  };
}

function buildWorkerRows(rows: WageAttendanceRow[]) {
  const grouped = new Map<
    string,
    {
      workerName: string;
      daysWorked: number;
      overtimeHours: number;
      totalOvertimePay: number;
      totalWage: number;
      totalKasbon: number;
      totalPaid: number;
      projectNames: Set<string>;
      notes: string[];
    }
  >();

  for (const row of rows) {
    const key = `${row.workerName.toLowerCase()}|${row.teamType}|${(row.specialistTeamName ?? "").toLowerCase()}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        workerName: row.workerName,
        daysWorked: 0,
        overtimeHours: 0,
        totalOvertimePay: 0,
        totalWage: 0,
        totalKasbon: 0,
        totalPaid: 0,
        projectNames: new Set<string>(),
        notes: [],
      });
    }

    const current = grouped.get(key)!;
    if (row.status === "hadir") {
      current.daysWorked += row.workDays;
      current.totalWage += row.dailyWage * row.workDays;
      current.overtimeHours += row.overtimeHours;
      current.totalOvertimePay += row.overtimePay;
    }
    current.totalKasbon += row.kasbonAmount;
    current.totalPaid += row.netPay;
    if (row.projectName?.trim()) {
      current.projectNames.add(row.projectName.trim());
    }
    if (row.notes && !current.notes.includes(row.notes)) {
      current.notes.push(row.notes);
    }
  }

  return Array.from(grouped.values())
    .map((item) => ({
      workerName: item.workerName,
      daysWorked: item.daysWorked,
      overtimeHours: item.overtimeHours,
      overtimeRate:
        item.overtimeHours > 0 ? Math.round(item.totalOvertimePay / item.overtimeHours) : 0,
      totalOvertimePay: item.totalOvertimePay,
      dailyRate: item.daysWorked > 0 ? Math.round(item.totalWage / item.daysWorked) : 0,
      totalWage: item.totalWage,
      totalKasbon: item.totalKasbon,
      totalPaid: item.totalPaid,
      projectNames: Array.from(item.projectNames).sort((a, b) => a.localeCompare(b)),
      notes: item.notes,
    }))
    .sort((a, b) => a.workerName.localeCompare(b.workerName));
}

export async function buildWageReportData(searchParams: URLSearchParams): Promise<WageReportResult> {
  const today = new Date().toISOString().slice(0, 10);
  const from = isDateString(searchParams.get("from"))
    ? String(searchParams.get("from"))
    : getMonthStartDate();
  const to = isDateString(searchParams.get("to")) ? String(searchParams.get("to")) : today;
  const exportMode = parseExportMode(searchParams.get("export_mode"));
  const selectedIds = parseSelectedIds(searchParams);
  const specialistTeamNameInput = searchParams.get("scope_specialist_team_name")?.trim() || "";
  const specialistProjectName = searchParams.get("scope_project_name")?.trim() || "";
  const reportTitleCustom = searchParams.get("report_title_custom")?.trim() || "";

  const recap = await getWageRecap({
    from,
    to,
    includePaid: true,
    recapMode: "gabung",
  });

  const filtered = filterRowsByMode({
    rows: recap.rows,
    exportMode,
    selectedIds,
    specialistTeamNameInput,
  });
  if (!filtered.ok) {
    return filtered;
  }

  if (filtered.rows.length === 0) {
    return {
      ok: false,
      status: 404,
      message: "Data absensi tidak ditemukan untuk filter export ini.",
    };
  }

  const rowProjectNames = uniqueStrings(
    filtered.rows
      .map((row) => row.projectName?.trim() || "")
      .filter((projectName) => projectName.length > 0),
  ).sort((a, b) => a.localeCompare(b));

  const reportTitle =
    reportTitleCustom.length > 0
      ? reportTitleCustom
      : buildDefaultTitle({
          exportMode,
          specialistTeamName: filtered.specialistTeamName,
          specialistProjectName,
          rowProjectNames,
        });

  const workers = buildWorkerRows(filtered.rows);
  const reimburseRows = parseReimburseRows(searchParams, to);
  const totalUpah = workers.reduce((sum, row) => sum + row.totalWage, 0);
  const totalLembur = workers.reduce((sum, row) => sum + row.totalOvertimePay, 0);
  const totalKasbon = workers.reduce((sum, row) => sum + row.totalKasbon, 0);
  const totalReimburse = reimburseRows.reduce((sum, row) => sum + row.total, 0);
  const subtotal = totalUpah + totalLembur + totalReimburse;
  const totalKeseluruhan = subtotal - totalKasbon;

  return {
    ok: true,
    data: {
      from,
      to,
      exportMode,
      reportTitle,
      workers,
      reimburseRows,
      totalUpah,
      totalLembur,
      totalKasbon,
      totalReimburse,
      subtotal,
      totalKeseluruhan,
    },
  };
}
