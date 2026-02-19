import { Buffer } from "node:buffer";
import * as fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx/xlsx.mjs";
import { getProjectDetail, getProjects } from "@/lib/data";

XLSX.set_fs(fs);

export const runtime = "nodejs";

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

function normalizeSheetName(name: string) {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim();
  if (!cleaned) {
    return "REKAP PROJECT";
  }
  return cleaned.slice(0, 31);
}

function findRecapSheetName(workbook: XLSX.WorkBook) {
  const upperByName = workbook.SheetNames.map((name) => ({ name, upper: name.toUpperCase() }));
  const exact = upperByName.find((item) => item.upper === "REKAP KMP CIANJUR");
  if (exact) {
    return exact.name;
  }
  const startsWithRekap = upperByName.find((item) => item.upper.startsWith("REKAP "));
  if (startsWithRekap) {
    return startsWithRekap.name;
  }
  return workbook.SheetNames[0] ?? "REKAP";
}

function getCellAddress(col: number, row: number) {
  return XLSX.utils.encode_cell({ c: col, r: row - 1 });
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

function clearSheetData(sheet: XLSX.WorkSheet, startRow: number, maxCol: number) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:L12");
  for (let row = startRow; row <= range.e.r + 1; row += 1) {
    for (let col = 0; col <= maxCol; col += 1) {
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
    return new Response("Pilih minimal satu project untuk Excel terpilih.", { status: 400 });
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

  const templatePath =
    process.env.EXCEL_TEMPLATE_PATH?.trim() || path.join(process.cwd(), "data", "admin-web-template.xlsx");
  const templateWorkbook = fs.existsSync(templatePath)
    ? XLSX.readFile(templatePath, { cellStyles: true })
    : XLSX.utils.book_new();
  const recapSheetName = findRecapSheetName(templateWorkbook);
  const templateSheet = templateWorkbook.Sheets[recapSheetName];

  let exportSheet: XLSX.WorkSheet;
  if (templateSheet) {
    exportSheet = JSON.parse(JSON.stringify(templateSheet)) as XLSX.WorkSheet;
  } else {
    exportSheet = XLSX.utils.aoa_to_sheet([
      ["REKAPITULASI BIAYA PENGELUARAN PROJECT"],
      [
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
        "TOTAL COST PER BULAN",
        "KETERANGAN",
      ],
    ]);
  }

  if (exportSheet["!merges"]) {
    exportSheet["!merges"] = exportSheet["!merges"]?.filter((merge) => merge.e.r <= 1);
  }

  const maxCol = 11;
  const dataStartRow = 3;
  clearSheetData(exportSheet, dataStartRow, maxCol);

  const normalTemplateCells = Array.from({ length: maxCol + 1 }, (_, col) =>
    cloneTemplateCell(exportSheet[getCellAddress(col, dataStartRow)] as XLSX.CellObject | undefined),
  );
  const totalTemplateCells = Array.from({ length: maxCol + 1 }, (_, col) =>
    cloneTemplateCell(exportSheet[getCellAddress(col, 11)] as XLSX.CellObject | undefined) ??
    normalTemplateCells[col],
  );

  const selectedLabel =
    requestedProjectIds.length > 0 ? `${requestedProjectIds.length} PROJECT TERPILIH` : "SEMUA PROJECT";
  setCellValue({
    sheet: exportSheet,
    col: 0,
    row: 1,
    value: `REKAPITULASI BIAYA PENGELUARAN PROJECT ${selectedLabel} ${new Date().getFullYear()}`,
    templateCell: normalTemplateCells[0],
  });

  let row = dataStartRow;
  for (const [index, item] of summaries.entries()) {
    setCellValue({
      sheet: exportSheet,
      col: 0,
      row,
      value: index + 1,
      templateCell: normalTemplateCells[0],
    });
    setCellValue({
      sheet: exportSheet,
      col: 1,
      row,
      value: item.projectName,
      templateCell: normalTemplateCells[1],
    });
    setCellValue({
      sheet: exportSheet,
      col: 2,
      row,
      value: item.material,
      templateCell: normalTemplateCells[2],
    });
    setCellValue({
      sheet: exportSheet,
      col: 3,
      row,
      value: item.alat,
      templateCell: normalTemplateCells[3],
    });
    setCellValue({
      sheet: exportSheet,
      col: 4,
      row,
      value: item.lainLain,
      templateCell: normalTemplateCells[4],
    });
    setCellValue({
      sheet: exportSheet,
      col: 5,
      row,
      value: item.upah,
      templateCell: normalTemplateCells[5],
    });
    setCellValue({
      sheet: exportSheet,
      col: 6,
      row,
      value: item.listrik,
      templateCell: normalTemplateCells[6],
    });
    setCellValue({
      sheet: exportSheet,
      col: 7,
      row,
      value: item.subcont,
      templateCell: normalTemplateCells[7],
    });
    setCellValue({
      sheet: exportSheet,
      col: 8,
      row,
      value: item.perawatan,
      templateCell: normalTemplateCells[8],
    });
    setCellValue({
      sheet: exportSheet,
      col: 9,
      row,
      value: item.ops,
      templateCell: normalTemplateCells[9],
    });
    setCellValue({
      sheet: exportSheet,
      col: 10,
      row,
      value: item.total,
      templateCell: normalTemplateCells[10],
    });
    setCellValue({
      sheet: exportSheet,
      col: 11,
      row,
      value: item.note,
      templateCell: normalTemplateCells[11],
    });

    row += 1;
  }

  setCellValue({
    sheet: exportSheet,
    col: 0,
    row,
    value: "TOTAL COST PER ITEM",
    templateCell: totalTemplateCells[0],
  });
  setCellValue({
    sheet: exportSheet,
    col: 1,
    row,
    value: "",
    templateCell: totalTemplateCells[1],
  });
  setCellValue({
    sheet: exportSheet,
    col: 2,
    row,
    value: totals.material,
    templateCell: totalTemplateCells[2],
  });
  setCellValue({
    sheet: exportSheet,
    col: 3,
    row,
    value: totals.alat,
    templateCell: totalTemplateCells[3],
  });
  setCellValue({
    sheet: exportSheet,
    col: 4,
    row,
    value: totals.lainLain,
    templateCell: totalTemplateCells[4],
  });
  setCellValue({
    sheet: exportSheet,
    col: 5,
    row,
    value: totals.upah,
    templateCell: totalTemplateCells[5],
  });
  setCellValue({
    sheet: exportSheet,
    col: 6,
    row,
    value: totals.listrik,
    templateCell: totalTemplateCells[6],
  });
  setCellValue({
    sheet: exportSheet,
    col: 7,
    row,
    value: totals.subcont,
    templateCell: totalTemplateCells[7],
  });
  setCellValue({
    sheet: exportSheet,
    col: 8,
    row,
    value: totals.perawatan,
    templateCell: totalTemplateCells[8],
  });
  setCellValue({
    sheet: exportSheet,
    col: 9,
    row,
    value: totals.ops,
    templateCell: totalTemplateCells[9],
  });
  setCellValue({
    sheet: exportSheet,
    col: 10,
    row,
    value: totals.total,
    templateCell: totalTemplateCells[10],
  });
  setCellValue({
    sheet: exportSheet,
    col: 11,
    row,
    value: "",
    templateCell: totalTemplateCells[11],
  });

  const currentRange = XLSX.utils.decode_range(exportSheet["!ref"] ?? "A1:L12");
  currentRange.e.c = Math.max(currentRange.e.c, maxCol);
  currentRange.e.r = Math.max(currentRange.e.r, row - 1);
  exportSheet["!ref"] = XLSX.utils.encode_range(currentRange);

  const outputWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outputWorkbook, exportSheet, normalizeSheetName(recapSheetName));
  const bytes = XLSX.write(outputWorkbook, { type: "buffer", bookType: "xlsx" });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"rekap-biaya-semua-project.xlsx\"",
    },
  });
}
