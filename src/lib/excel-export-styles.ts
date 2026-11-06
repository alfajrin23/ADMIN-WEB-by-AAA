import type * as XLSX from "xlsx";

export const EXCEL_REPORT_COLORS = {
  navy: "17365D",
  blue: "2F75B5",
  teal: "0F766E",
  green: "548235",
  darkGreen: "217346",
  paleGreen: "E2F0D9",
  paleBlue: "DDEBF7",
  paleGray: "F3F6F9",
  border: "B8C7D9",
  text: "243447",
  mutedText: "5B6573",
  white: "FFFFFF",
} as const;

const CATEGORY_COLORS: Record<string, string> = {
  material: "DDEBF7",
  upah_kasbon_tukang: "E2F0D9",
  upah_staff_pelaksana: "FCE4D6",
  upah_tim_spesialis: "F4CCCC",
  alat: "FFF2CC",
  operasional: "E4DFEC",
  listrik: "FFF2CC",
  subcont: "F4CCCC",
  perawatan: "DDEBF7",
  lain_lain: "E7E6E6",
};

export type ExcelColumnSpec = {
  column: number;
  format?: "currency" | "integer" | "decimal" | "date";
  align?: "left" | "center" | "right";
  wrapText?: boolean;
  fill?: string;
};

export const EXCEL_NUMBER_FORMATS = {
  currency: '"Rp" #,##0;[Red]("Rp" #,##0);-',
  integer: "#,##0;[Red](#,##0);-",
  decimal: "#,##0.##;[Red](#,##0.##);-",
  date: "dd mmm yyyy",
} as const;

function cellAddress(row: number, column: number) {
  let columnNumber = column + 1;
  let columnName = "";
  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }
  return `${columnName}${row + 1}`;
}

function getCell(sheet: XLSX.WorkSheet, row: number, column: number) {
  const address = cellAddress(row, column);
  const current = sheet[address];
  if (current && typeof current === "object" && "t" in current) {
    return current as XLSX.CellObject;
  }
  const cell: XLSX.CellObject = { t: "z" };
  sheet[address] = cell;
  return cell;
}

function applyCellStyle(
  sheet: XLSX.WorkSheet,
  row: number,
  column: number,
  style: Record<string, unknown>,
  numberFormat?: string,
) {
  const cell = getCell(sheet, row, column);
  cell.s = style;
  if (numberFormat && (cell.t === "n" || cell.t === "d")) {
    cell.z = numberFormat;
  }
}

function solidFill(hex: string) {
  return { patternType: "solid", fgColor: { rgb: hex } };
}

function cellGridBorder(color: string = EXCEL_REPORT_COLORS.border) {
  const edge = { style: "thin", color: { rgb: color } };
  return { top: edge, right: edge, bottom: edge, left: edge };
}

export function getExpenseCategoryExcelColor(category: string) {
  return CATEGORY_COLORS[category.trim().toLowerCase()] ?? "E7E6E6";
}

export function styleExcelTitleRow(
  sheet: XLSX.WorkSheet,
  row: number,
  firstColumn: number,
  lastColumn: number,
  fontSize = 16,
) {
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    applyCellStyle(sheet, row, column, {
      font: { name: "Aptos Display", sz: fontSize, bold: true, color: { rgb: EXCEL_REPORT_COLORS.white } },
      fill: solidFill(EXCEL_REPORT_COLORS.navy),
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: cellGridBorder(EXCEL_REPORT_COLORS.blue),
    });
  }
}

export function styleExcelCell(
  sheet: XLSX.WorkSheet,
  row: number,
  column: number,
  options: { fill?: string; fontColor?: string; bold?: boolean; align?: "left" | "center" | "right" },
) {
  const style: Record<string, unknown> = {
    font: {
      name: "Aptos",
      sz: 10,
      bold: options.bold ?? false,
      color: { rgb: options.fontColor ?? EXCEL_REPORT_COLORS.text },
    },
    alignment: { horizontal: options.align ?? "left", vertical: "center", wrapText: true },
    border: cellGridBorder(),
  };
  if (options.fill) {
    style.fill = solidFill(options.fill);
  }
  applyCellStyle(sheet, row, column, style);
}

export function styleExcelSubtitleRow(
  sheet: XLSX.WorkSheet,
  row: number,
  firstColumn: number,
  lastColumn: number,
) {
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    applyCellStyle(sheet, row, column, {
      font: { name: "Aptos", sz: 10, italic: true, color: { rgb: EXCEL_REPORT_COLORS.mutedText } },
      fill: solidFill(EXCEL_REPORT_COLORS.paleBlue),
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      border: cellGridBorder(),
    });
  }
}

export function styleExcelSectionRow(
  sheet: XLSX.WorkSheet,
  row: number,
  firstColumn: number,
  lastColumn: number,
  fill = EXCEL_REPORT_COLORS.teal,
) {
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    applyCellStyle(sheet, row, column, {
      font: { name: "Aptos", sz: 11, bold: true, color: { rgb: EXCEL_REPORT_COLORS.white } },
      fill: solidFill(fill),
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      border: cellGridBorder(EXCEL_REPORT_COLORS.white),
    });
  }
}

export function styleExcelHeaderRow(
  sheet: XLSX.WorkSheet,
  row: number,
  firstColumn: number,
  lastColumn: number,
  options: { fills?: Record<number, string>; totalColumn?: number } = {},
) {
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    const isTotal = column === options.totalColumn;
    const fill = isTotal
      ? EXCEL_REPORT_COLORS.darkGreen
      : options.fills?.[column] ?? EXCEL_REPORT_COLORS.blue;
    const isPastelCategory = Boolean(options.fills?.[column]) && !isTotal;
    applyCellStyle(sheet, row, column, {
      font: {
        name: "Aptos",
        sz: 10,
        bold: true,
        color: { rgb: isPastelCategory ? EXCEL_REPORT_COLORS.text : EXCEL_REPORT_COLORS.white },
      },
      fill: solidFill(fill),
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: EXCEL_REPORT_COLORS.white } },
        right: { style: "thin", color: { rgb: EXCEL_REPORT_COLORS.white } },
        bottom: { style: "medium", color: { rgb: EXCEL_REPORT_COLORS.navy } },
        left: { style: "thin", color: { rgb: EXCEL_REPORT_COLORS.white } },
      },
    });
  }
}

export function styleExcelDataRows(
  sheet: XLSX.WorkSheet,
  options: {
    startRow: number;
    endRow: number;
    firstColumn: number;
    lastColumn: number;
    columns?: ExcelColumnSpec[];
    totalRows?: number[];
    grandTotalRows?: number[];
  },
) {
  const columnSpecs = new Map((options.columns ?? []).map((item) => [item.column, item]));
  const totalRows = new Set(options.totalRows ?? []);
  const grandTotalRows = new Set(options.grandTotalRows ?? []);

  for (let row = options.startRow; row <= options.endRow; row += 1) {
    const isGrandTotal = grandTotalRows.has(row);
    const isTotal = totalRows.has(row) || isGrandTotal;
    const baseFill = isGrandTotal
      ? EXCEL_REPORT_COLORS.darkGreen
      : isTotal
        ? EXCEL_REPORT_COLORS.paleGreen
        : row % 2 === 0
          ? EXCEL_REPORT_COLORS.paleGray
          : EXCEL_REPORT_COLORS.white;

    for (let column = options.firstColumn; column <= options.lastColumn; column += 1) {
      const spec = columnSpecs.get(column);
      const fill = isGrandTotal
        ? EXCEL_REPORT_COLORS.darkGreen
        : isTotal
          ? EXCEL_REPORT_COLORS.paleGreen
          : spec?.fill ?? baseFill;
      const style: Record<string, unknown> = {
        font: {
          name: "Aptos",
          sz: 10,
          bold: isTotal,
          color: { rgb: isGrandTotal ? EXCEL_REPORT_COLORS.white : EXCEL_REPORT_COLORS.text },
        },
        fill: solidFill(fill),
        alignment: {
          horizontal: spec?.align ?? "left",
          vertical: "center",
          wrapText: spec?.wrapText ?? false,
        },
        border: isTotal ? cellGridBorder(EXCEL_REPORT_COLORS.green) : cellGridBorder(),
      };
      const format = spec?.format ? EXCEL_NUMBER_FORMATS[spec.format] : undefined;
      applyCellStyle(sheet, row, column, style, format);
    }
  }
}

export function setExcelAutoFilter(
  sheet: XLSX.WorkSheet,
  headerRow: number,
  firstColumn: number,
  lastRow: number,
  lastColumn: number,
) {
  if (lastRow < headerRow) {
    return;
  }
  sheet["!autofilter"] = {
    ref: `${cellAddress(headerRow, firstColumn)}:${cellAddress(lastRow, lastColumn)}`,
  };
}

export function setExcelRowHeight(sheet: XLSX.WorkSheet, row: number, height: number) {
  const rows = (sheet["!rows"] as XLSX.RowInfo[] | undefined) ?? [];
  rows[row] = { ...(rows[row] ?? {}), hpt: height };
  sheet["!rows"] = rows;
}

export function setExcelPrintLayout(sheet: XLSX.WorkSheet, orientation: "portrait" | "landscape" = "landscape") {
  sheet["!margins"] = {
    left: 0.25,
    right: 0.25,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  };
  sheet["!pageSetup"] = { orientation, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

export function styleExcelInfoSheet(sheet: XLSX.WorkSheet, rowCount: number) {
  if (rowCount === 0) {
    return;
  }
  styleExcelTitleRow(sheet, 0, 0, 1, 13);
  for (let row = 1; row < rowCount; row += 1) {
    applyCellStyle(sheet, row, 0, {
      font: { name: "Aptos", sz: 10, bold: true, color: { rgb: EXCEL_REPORT_COLORS.navy } },
      fill: solidFill(EXCEL_REPORT_COLORS.paleBlue),
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      border: cellGridBorder(),
    });
    applyCellStyle(sheet, row, 1, {
      font: { name: "Aptos", sz: 10, color: { rgb: EXCEL_REPORT_COLORS.text } },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      border: cellGridBorder(),
    });
  }
  setExcelRowHeight(sheet, 0, 28);
  setExcelPrintLayout(sheet, "portrait");
}
