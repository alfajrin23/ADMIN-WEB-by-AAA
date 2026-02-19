import { Buffer } from "node:buffer";
import * as fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx/xlsx.mjs";
import { getProjectDetail, getProjects } from "@/lib/data";

XLSX.set_fs(fs);

export const runtime = "nodejs";

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

type ColumnMap = {
  no: number;
  requester: number;
  date: number;
  description: number;
  qty: number;
  unit: number;
  usage: number;
  unitPrice: number;
  material: number | null;
  alat: number | null;
  upah: number | null;
  lainLain: number | null;
  ops: number | null;
  listrik: number | null;
  subcont: number | null;
  perawatan: number | null;
  total: number | null;
  maxCol: number;
};

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

function normalizeText(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function cloneTemplateCell(cell: XLSX.CellObject | undefined) {
  if (!cell) {
    return undefined;
  }
  const cloned = { ...cell };
  if ("s" in cell && cell.s) {
    cloned.s = JSON.parse(JSON.stringify(cell.s)) as XLSX.CellObject["s"];
  }
  delete cloned.v;
  delete cloned.w;
  delete cloned.f;
  cloned.t = "z";
  return cloned;
}

function getCellAddress(col: number, row: number) {
  return XLSX.utils.encode_cell({ c: col, r: row - 1 });
}

function getCellText(sheet: XLSX.WorkSheet, col: number, row: number) {
  const cell = sheet[getCellAddress(col, row)] as XLSX.CellObject | undefined;
  if (!cell || cell.v == null) {
    return "";
  }
  return String(cell.v).trim();
}

function setCellValue(params: {
  sheet: XLSX.WorkSheet;
  col: number;
  row: number;
  value: string | number | null;
  templateCell?: XLSX.CellObject;
}) {
  const { sheet, col, row, value, templateCell } = params;
  const address = getCellAddress(col, row);
  const existing = sheet[address] as XLSX.CellObject | undefined;
  const cell = existing ? existing : cloneTemplateCell(templateCell) ?? ({ t: "z" } as XLSX.CellObject);

  if (typeof value === "number") {
    cell.t = "n";
    cell.v = value;
  } else if (typeof value === "string" && value.length > 0) {
    cell.t = "s";
    cell.v = value;
  } else {
    cell.t = "z";
    delete cell.v;
  }

  delete cell.w;
  delete cell.f;
  sheet[address] = cell;
}

function clearSheetData(sheet: XLSX.WorkSheet, startRow: number) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:Z12");
  for (let row = startRow; row <= range.e.r + 1; row += 1) {
    for (let col = 0; col <= range.e.c; col += 1) {
      const address = getCellAddress(col, row);
      const cell = sheet[address] as XLSX.CellObject | undefined;
      if (!cell) {
        continue;
      }
      delete cell.v;
      delete cell.w;
      delete cell.f;
      cell.t = "z";
      sheet[address] = cell;
    }
  }
}

function getHeaderColumns(sheet: XLSX.WorkSheet): ColumnMap {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:Z12");
  const maxCol = range.e.c;
  const headerRowTwo = Array.from({ length: maxCol + 1 }, (_, col) =>
    getCellText(sheet, col, 2).toUpperCase(),
  );

  const findBy = (predicate: (text: string) => boolean) => {
    for (let col = 0; col <= maxCol; col += 1) {
      if (predicate(headerRowTwo[col])) {
        return col;
      }
    }
    return null;
  };

  return {
    no: 0,
    requester: 1,
    date: 2,
    description: 3,
    qty: 4,
    unit: 5,
    usage: 6,
    unitPrice: 7,
    material: findBy((text) => text.includes("COST MATERIAL")),
    alat: findBy((text) => text === "ALAT" || text.includes("COST ALAT")),
    upah: findBy((text) => text.includes("UPAH")),
    lainLain: findBy((text) => text.includes("LAIN-LAIN")),
    ops: findBy((text) => text.includes("COST OPS") || text.includes("OPERASIONAL")),
    listrik: findBy((text) => text.includes("LISTRIK")),
    subcont: findBy((text) => text.includes("SUBCONT")),
    perawatan: findBy((text) => text.includes("PERAWATAN")),
    total: findBy(
      (text) =>
        text.includes("TOTAL COST") || text.includes("PENGELUARAN PER") || text.includes("TOTAL COST PER DESA"),
    ),
    maxCol,
  };
}

function findSubtotalTemplateRow(sheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:Z12");
  for (let row = 4; row <= range.e.r + 1; row += 1) {
    const firstCol = getCellText(sheet, 0, row).toUpperCase();
    if (firstCol.includes("TOTAL PENGELUARAN")) {
      return row;
    }
  }
  return 4;
}

function ensureUniqueSheetName(baseName: string, usedNames: Set<string>) {
  const cleanedBase = baseName.replace(/[\\/?*[\]:]/g, " ").trim() || "SHEET";
  let candidate = cleanedBase.slice(0, 31);
  let counter = 2;
  while (usedNames.has(candidate.toUpperCase())) {
    const suffix = ` (${counter})`;
    const head = cleanedBase.slice(0, Math.max(1, 31 - suffix.length));
    candidate = `${head}${suffix}`;
    counter += 1;
  }
  usedNames.add(candidate.toUpperCase());
  return candidate;
}

function isRecapOrInternalSheet(sheetName: string) {
  const upper = sheetName.toUpperCase();
  return (
    upper.startsWith("REKAP ") ||
    upper.startsWith("BACKUP ") ||
    upper === "PROJECTS" ||
    upper === "PROJECT_EXPENSES" ||
    upper === "ATTENDANCE_RECORDS" ||
    upper === "PAYROLL_RESETS"
  );
}

function findDefaultDetailSheetName(workbook: XLSX.WorkBook) {
  const prefer = ["UMUM UPDATE", "BACKUP UMUM ALL"];
  for (const preferred of prefer) {
    const found = workbook.SheetNames.find((name) => name.toUpperCase() === preferred);
    if (found) {
      return found;
    }
  }

  const firstDetail = workbook.SheetNames.find((name) => {
    if (isRecapOrInternalSheet(name)) {
      return false;
    }
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      return false;
    }
    const row2 = getCellText(sheet, 1, 2).toUpperCase();
    return row2.includes("NAMA PENGAJUAN");
  });
  return firstDetail ?? workbook.SheetNames[0] ?? "RINCIAN";
}

function resolveProjectTemplateSheetName(workbook: XLSX.WorkBook, projectName: string) {
  const normalizedProject = normalizeText(projectName);
  const detailSheets = workbook.SheetNames.filter((name) => !isRecapOrInternalSheet(name));

  const exact = detailSheets.find((name) => normalizeText(name) === normalizedProject);
  if (exact) {
    return exact;
  }

  const partial = detailSheets.find((name) => {
    const normalizedSheet = normalizeText(name);
    return (
      normalizedSheet.includes(normalizedProject) || normalizedProject.includes(normalizedSheet)
    );
  });
  if (partial) {
    return partial;
  }

  return findDefaultDetailSheetName(workbook);
}

function selectOpsColumn(map: ColumnMap) {
  if (map.ops != null) {
    return map.ops;
  }
  if (map.lainLain != null) {
    return map.lainLain;
  }
  if (map.listrik != null) {
    return map.listrik;
  }
  if (map.subcont != null) {
    return map.subcont;
  }
  if (map.perawatan != null) {
    return map.perawatan;
  }
  return null;
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
    return new Response("Pilih minimal satu project untuk Excel rincian.", { status: 400 });
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
  const rowsByProject = new Map<string, DetailedExpenseRow[]>();

  for (const detail of details) {
    if (!detail) {
      continue;
    }

    const rows: DetailedExpenseRow[] = detail.expenses.map((expense) => {
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
    });

    rows.sort((a, b) => {
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

  const templatePath =
    process.env.EXCEL_TEMPLATE_PATH?.trim() || path.join(process.cwd(), "data", "admin-web-template.xlsx");
  const templateWorkbook = fs.existsSync(templatePath)
    ? XLSX.readFile(templatePath, { cellStyles: true })
    : XLSX.utils.book_new();

  const outputWorkbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  for (const project of selectedProjects) {
    const projectRows = rowsByProject.get(project.id) ?? [];
    if (projectRows.length === 0) {
      continue;
    }

    const templateSheetName = resolveProjectTemplateSheetName(templateWorkbook, project.name);
    const templateSheet = templateWorkbook.Sheets[templateSheetName];
    if (!templateSheet) {
      continue;
    }

    const exportSheet = JSON.parse(JSON.stringify(templateSheet)) as XLSX.WorkSheet;
    if (exportSheet["!merges"]) {
      exportSheet["!merges"] = exportSheet["!merges"]?.filter((merge) => merge.e.r <= 2);
    }

    const map = getHeaderColumns(exportSheet);
    const dataStartRow = 4;
    const subtotalTemplateRow = findSubtotalTemplateRow(exportSheet);
    clearSheetData(exportSheet, dataStartRow);

    const normalTemplateCells = Array.from({ length: map.maxCol + 1 }, (_, col) =>
      cloneTemplateCell(exportSheet[getCellAddress(col, dataStartRow)] as XLSX.CellObject | undefined),
    );
    const subtotalTemplateCells = Array.from({ length: map.maxCol + 1 }, (_, col) =>
      cloneTemplateCell(exportSheet[getCellAddress(col, subtotalTemplateRow)] as XLSX.CellObject | undefined) ??
      normalTemplateCells[col],
    );

    setCellValue({
      sheet: exportSheet,
      col: map.no,
      row: 1,
      value: `PROJECT KMP CIANJUR DS ${project.name.toUpperCase()}`,
      templateCell: normalTemplateCells[map.no],
    });

    const opsCol = selectOpsColumn(map);
    const groupedByMonth = new Map<string, DetailedExpenseRow[]>();
    for (const row of projectRows) {
      const key = getMonthKey(row.expenseDate);
      if (!groupedByMonth.has(key)) {
        groupedByMonth.set(key, []);
      }
      groupedByMonth.get(key)?.push(row);
    }

    let rowPointer = dataStartRow;
    let rowNo = 1;

    for (const [monthKey, monthRows] of groupedByMonth.entries()) {
      const monthTotals = { material: 0, alat: 0, upah: 0, ops: 0, total: 0 };
      for (const item of monthRows) {
        monthTotals.material += item.material;
        monthTotals.alat += item.alat;
        monthTotals.upah += item.upah;
        monthTotals.ops += item.ops;
        monthTotals.total += item.total;

        setCellValue({
          sheet: exportSheet,
          col: map.no,
          row: rowPointer,
          value: rowNo,
          templateCell: normalTemplateCells[map.no],
        });
        setCellValue({
          sheet: exportSheet,
          col: map.requester,
          row: rowPointer,
          value: item.requesterName,
          templateCell: normalTemplateCells[map.requester],
        });
        setCellValue({
          sheet: exportSheet,
          col: map.date,
          row: rowPointer,
          value: formatDateCell(item.expenseDate),
          templateCell: normalTemplateCells[map.date],
        });
        setCellValue({
          sheet: exportSheet,
          col: map.description,
          row: rowPointer,
          value: item.description,
          templateCell: normalTemplateCells[map.description],
        });
        setCellValue({
          sheet: exportSheet,
          col: map.qty,
          row: rowPointer,
          value: item.quantity > 0 ? item.quantity : null,
          templateCell: normalTemplateCells[map.qty],
        });
        setCellValue({
          sheet: exportSheet,
          col: map.unit,
          row: rowPointer,
          value: item.unitLabel === "-" ? "" : item.unitLabel,
          templateCell: normalTemplateCells[map.unit],
        });
        setCellValue({
          sheet: exportSheet,
          col: map.usage,
          row: rowPointer,
          value: item.usageInfo === "-" ? "" : item.usageInfo,
          templateCell: normalTemplateCells[map.usage],
        });
        setCellValue({
          sheet: exportSheet,
          col: map.unitPrice,
          row: rowPointer,
          value: item.unitPrice > 0 ? item.unitPrice : null,
          templateCell: normalTemplateCells[map.unitPrice],
        });

        if (map.material != null) {
          setCellValue({
            sheet: exportSheet,
            col: map.material,
            row: rowPointer,
            value: item.material > 0 ? item.material : null,
            templateCell: normalTemplateCells[map.material],
          });
        }
        if (map.alat != null) {
          setCellValue({
            sheet: exportSheet,
            col: map.alat,
            row: rowPointer,
            value: item.alat > 0 ? item.alat : null,
            templateCell: normalTemplateCells[map.alat],
          });
        }
        if (map.upah != null) {
          setCellValue({
            sheet: exportSheet,
            col: map.upah,
            row: rowPointer,
            value: item.upah > 0 ? item.upah : null,
            templateCell: normalTemplateCells[map.upah],
          });
        }
        if (opsCol != null) {
          setCellValue({
            sheet: exportSheet,
            col: opsCol,
            row: rowPointer,
            value: item.ops > 0 ? item.ops : null,
            templateCell: normalTemplateCells[opsCol],
          });
        }
        if (map.total != null) {
          setCellValue({
            sheet: exportSheet,
            col: map.total,
            row: rowPointer,
            value: item.total,
            templateCell: normalTemplateCells[map.total],
          });
        }

        rowPointer += 1;
        rowNo += 1;
      }

      setCellValue({
        sheet: exportSheet,
        col: map.no,
        row: rowPointer,
        value: `TOTAL PENGELUARAN COST ${formatMonthLabel(monthKey)}`,
        templateCell: subtotalTemplateCells[map.no],
      });
      if (map.material != null) {
        setCellValue({
          sheet: exportSheet,
          col: map.material,
          row: rowPointer,
          value: monthTotals.material > 0 ? monthTotals.material : null,
          templateCell: subtotalTemplateCells[map.material],
        });
      }
      if (map.alat != null) {
        setCellValue({
          sheet: exportSheet,
          col: map.alat,
          row: rowPointer,
          value: monthTotals.alat > 0 ? monthTotals.alat : null,
          templateCell: subtotalTemplateCells[map.alat],
        });
      }
      if (map.upah != null) {
        setCellValue({
          sheet: exportSheet,
          col: map.upah,
          row: rowPointer,
          value: monthTotals.upah > 0 ? monthTotals.upah : null,
          templateCell: subtotalTemplateCells[map.upah],
        });
      }
      if (opsCol != null) {
        setCellValue({
          sheet: exportSheet,
          col: opsCol,
          row: rowPointer,
          value: monthTotals.ops > 0 ? monthTotals.ops : null,
          templateCell: subtotalTemplateCells[opsCol],
        });
      }
      if (map.total != null) {
        setCellValue({
          sheet: exportSheet,
          col: map.total,
          row: rowPointer,
          value: monthTotals.total > 0 ? monthTotals.total : null,
          templateCell: subtotalTemplateCells[map.total],
        });
      }
      rowPointer += 1;
    }

    const range = XLSX.utils.decode_range(exportSheet["!ref"] ?? "A1:Z12");
    range.e.r = Math.max(2, rowPointer - 1);
    exportSheet["!ref"] = XLSX.utils.encode_range(range);

    const outputSheetName = ensureUniqueSheetName(project.name, usedNames);
    XLSX.utils.book_append_sheet(outputWorkbook, exportSheet, outputSheetName);
  }

  if (outputWorkbook.SheetNames.length === 0) {
    return new Response("Belum ada data biaya project.", { status: 404 });
  }

  const bytes = XLSX.write(outputWorkbook, { type: "buffer", bookType: "xlsx" });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"rincian-rekap-biaya-semua-project.xlsx\"",
    },
  });
}
