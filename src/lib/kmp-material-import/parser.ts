import * as XLSX from "xlsx";
import {
  flattenAdditiveTerms,
  parseFormulaAst,
  tokenizeFormula,
  type FormulaAst,
  UnsupportedFormulaError,
} from "@/lib/kmp-material-import/formula-tokenizer";
import {
  createFormulaCellResolver,
  evaluateFormulaAst,
} from "@/lib/kmp-material-import/cell-resolver";
import type {
  ImportRowStatus,
  KmpMaterialImportProjectAnalysis,
  KmpMaterialImportTerm,
} from "@/lib/kmp-material-import/types";
import {
  normalizeImportText,
  parseSafeNumber,
  validateMaterialAmount,
} from "@/lib/kmp-material-import/validators";

type ProjectSheetHeaders = {
  row: number;
  districtColumn: number;
  projectColumn: number;
  realCostColumn: number;
  descriptionColumn: number | null;
};

export type ParsedKmpMaterialWorkbook = {
  sheetCount: number;
  projectSheets: string[];
  projects: KmpMaterialImportProjectAnalysis[];
  warnings: string[];
};

const MATERIAL_CODE_LABELS: Record<number, string> = {
  1: "ATAP",
  2: "CNP",
  3: "KRAMIK",
  4: "FOLDING",
  5: "ME",
  6: "ALUMUNIUM",
  7: "BESI",
  8: "FLOOR",
  9: "LOGO",
  10: "SEMEN",
  11: "ZINCHROMATE, THINER",
  12: "CAT",
  13: "SANITASI",
  14: "BETON",
  15: "PLN",
  16: "NIDI SLO",
};

function getSheetRange(sheet: XLSX.WorkSheet) {
  try {
    return XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  } catch {
    return XLSX.utils.decode_range("A1:A1");
  }
}

function getCell(sheet: XLSX.WorkSheet, row: number, column: number) {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined;
}

function getCellText(cell: XLSX.CellObject | undefined) {
  if (!cell || cell.v === null || cell.v === undefined) {
    return "";
  }
  return String(cell.v).trim();
}

export function detectProjectSheetHeaders(sheet: XLSX.WorkSheet): ProjectSheetHeaders | null {
  const range = getSheetRange(sheet);
  const lastRow = Math.min(range.e.r, range.s.r + 39);
  const lastColumn = Math.min(range.e.c, range.s.c + 29);

  for (let row = range.s.r; row <= lastRow; row += 1) {
    let districtColumn: number | null = null;
    let projectColumn: number | null = null;
    let realCostColumn: number | null = null;
    let descriptionColumn: number | null = null;

    for (let column = range.s.c; column <= lastColumn; column += 1) {
      const label = normalizeImportText(getCellText(getCell(sheet, row, column)));
      if (label === "kecamatan") {
        districtColumn = column;
      } else if (label === "kelurahan" || label === "desa" || label === "kelurahan desa") {
        projectColumn = column;
      } else if (label === "real cost" || label === "realcost") {
        realCostColumn = column;
      } else if (label === "keterangan") {
        descriptionColumn = column;
      }
    }

    if (districtColumn !== null && projectColumn !== null && realCostColumn !== null) {
      return {
        row,
        districtColumn,
        projectColumn,
        realCostColumn,
        descriptionColumn,
      };
    }
  }
  return null;
}

function createTermId(input: {
  fileHash: string;
  sheet: string;
  formulaCell: string;
  termIndex: number;
  sourceReference: string | null;
}) {
  return [
    "kmp-import",
    input.fileHash.slice(0, 24),
    input.sheet,
    input.formulaCell,
    String(input.termIndex),
    input.sourceReference ?? "literal",
  ]
    .map((value) => encodeURIComponent(value))
    .join(":");
}

function cleanLocalSuggestion(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) {
    return null;
  }
  const cleaned = trimmed
    .replace(/^\s*\((.*)\)\s*$/, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^\d+(?:[.,]\d+)*$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function getLocalReferenceLabel(sheet: XLSX.WorkSheet, address: string) {
  const decoded = XLSX.utils.decode_cell(address.replace(/\$/g, ""));
  for (const column of [9, 10]) {
    const suggestion = cleanLocalSuggestion(getCellText(getCell(sheet, decoded.r, column)));
    if (suggestion) {
      return suggestion;
    }
  }
  return null;
}

function getSheetReferenceLabel(
  workbook: XLSX.WorkBook,
  sheetName: string,
  address: string,
) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return null;
  }
  const decoded = XLSX.utils.decode_cell(address.replace(/\$/g, ""));
  return getCellText(getCell(sheet, decoded.r, 1)) || null;
}

function renderAst(ast: FormulaAst): string {
  if (ast.type === "number") {
    return ast.raw;
  }
  if (ast.type === "reference") {
    return ast.raw;
  }
  if (ast.type === "unary") {
    return `${ast.operator}${renderAst(ast.operand)}`;
  }
  return `(${renderAst(ast.left)}${ast.operator}${renderAst(ast.right)})`;
}

function parseValidationMaterialCodes(description: string | null) {
  if (!description) {
    return [];
  }
  const codes = new Set<string>();
  const matches = description.matchAll(/(?<!\d)(1[0-6]|[1-9])(?!\d)/g);
  for (const match of matches) {
    const label = MATERIAL_CODE_LABELS[Number(match[1])];
    if (label) {
      codes.add(label);
    }
  }
  return Array.from(codes);
}

function getProjectStatusFromTerms(
  terms: KmpMaterialImportTerm[],
  fallback: ImportRowStatus,
): ImportRowStatus {
  const precedence: ImportRowStatus[] = [
    "error",
    "unsupported_formula",
    "formula_mismatch",
    "needs_project_match",
    "ambiguous_project",
    "unmatched_project",
    "needs_material_name",
    "needs_material_mapping",
    "needs_split_review",
    "needs_review_partial_material",
    "possible_duplicate",
    "will_update",
    "already_exists",
    "ready",
  ];
  return precedence.find((status) => terms.some((term) => term.status === status)) ?? fallback;
}

function createBaseTerm(input: {
  id: string;
  sourceSheet: string;
  sourceRow: number;
  formulaCell: string;
  formula: string;
  termIndex: number;
  sourceType: KmpMaterialImportTerm["sourceType"];
  sourceReference: string | null;
  sourceLabel: string | null;
  sourceLabelRaw: string | null;
  amount: number;
  status: ImportRowStatus;
  warnings: string[];
}): KmpMaterialImportTerm {
  return {
    ...input,
    projectId: null,
    projectName: null,
    materialKey: null,
    materialName: null,
    submissionName: null,
    confidence: "Unresolved",
    approved: false,
    action: "insert_new",
    existingExpenses: [],
    suggestedSplit: null,
    occurrenceCount: 1,
  };
}

function parseProjectFormula(input: {
  workbook: XLSX.WorkBook;
  fileHash: string;
  sheetName: string;
  sheet: XLSX.WorkSheet;
  sourceRow: number;
  formulaAddress: string;
  formulaCell: XLSX.CellObject;
}) {
  const formula = String(input.formulaCell.f ?? "").trim();
  const displayFormula = formula.startsWith("=") ? formula : `=${formula}`;
  const resolveCell = createFormulaCellResolver(input.workbook);
  const ast = parseFormulaAst(tokenizeFormula(formula));
  const additiveTerms = flattenAdditiveTerms(ast);
  const first = additiveTerms[0];
  if (!first || first.sign !== 1 || first.node.type !== "number") {
    throw new UnsupportedFormulaError("Angka pertama rumus REAL COST harus berupa baseline numerik.");
  }

  const baselineAmount = first.node.value;
  const terms: KmpMaterialImportTerm[] = [];
  for (let index = 1; index < additiveTerms.length; index += 1) {
    const additive = additiveTerms[index]!;
    const node = additive.node;
    const rawAmount = evaluateFormulaAst(node, input.sheetName, resolveCell) * additive.sign;
    const amountError = validateMaterialAmount(rawAmount);
    const warnings = amountError ? [amountError] : [];

    if (node.type === "reference") {
      const referencedSheetName = node.sheet ?? input.sheetName;
      const sourceReference = node.sheet
        ? `${node.sheet}!${node.address}`
        : node.address;
      const isCrossSheet = Boolean(node.sheet && node.sheet !== input.sheetName);
      const sourceLabelRaw = isCrossSheet
        ? getSheetReferenceLabel(input.workbook, referencedSheetName, node.address)
        : getLocalReferenceLabel(input.sheet, node.address);
      const sourceLabel = sourceLabelRaw ? cleanLocalSuggestion(sourceLabelRaw) : null;
      terms.push(
        createBaseTerm({
          id: createTermId({
            fileHash: input.fileHash,
            sheet: input.sheetName,
            formulaCell: input.formulaAddress,
            termIndex: index,
            sourceReference,
          }),
          sourceSheet: input.sheetName,
          sourceRow: input.sourceRow,
          formulaCell: `${input.sheetName}!${input.formulaAddress}`,
          formula: displayFormula,
          termIndex: index,
          sourceType: isCrossSheet ? "sheet_reference" : "local_reference",
          sourceReference,
          sourceLabel,
          sourceLabelRaw,
          amount: rawAmount,
          status: amountError
            ? "error"
            : sourceLabel
              ? "needs_material_mapping"
              : "needs_material_name",
          warnings,
        }),
      );
      continue;
    }

    const sourceReference = node.type === "number" ? null : renderAst(node);
    terms.push(
      createBaseTerm({
        id: createTermId({
          fileHash: input.fileHash,
          sheet: input.sheetName,
          formulaCell: input.formulaAddress,
          termIndex: index,
          sourceReference,
        }),
        sourceSheet: input.sheetName,
        sourceRow: input.sourceRow,
        formulaCell: `${input.sheetName}!${input.formulaAddress}`,
        formula: displayFormula,
        termIndex: index,
        sourceType: "literal",
        sourceReference,
        sourceLabel: null,
        sourceLabelRaw: null,
        amount: rawAmount,
        status: amountError ? "error" : "needs_material_name",
        warnings,
      }),
    );
  }

  const formulaResult = evaluateFormulaAst(ast, input.sheetName, resolveCell);
  const excelRealCost = parseSafeNumber(input.formulaCell.v);
  return {
    formula: displayFormula,
    baselineAmount,
    terms,
    formulaResult,
    excelRealCost,
  };
}

function analyzeProjectRow(input: {
  workbook: XLSX.WorkBook;
  fileHash: string;
  sheetName: string;
  sheet: XLSX.WorkSheet;
  headers: ProjectSheetHeaders;
  row: number;
  district: string;
  projectName: string;
}): KmpMaterialImportProjectAnalysis {
  const realCostAddress = XLSX.utils.encode_cell({
    r: input.row,
    c: input.headers.realCostColumn,
  });
  const realCostCell = getCell(input.sheet, input.row, input.headers.realCostColumn);
  const description = input.headers.descriptionColumn === null
    ? null
    : getCellText(getCell(input.sheet, input.row, input.headers.descriptionColumn)) || null;
  const validationMaterialCodes = parseValidationMaterialCodes(description);
  const base = {
    id: `${encodeURIComponent(input.sheetName)}:${input.row + 1}`,
    sourceSheet: input.sheetName,
    sourceRow: input.row + 1,
    district: input.district,
    excelProjectName: input.projectName,
    originalDescription: description,
    realCostCell: `${input.sheetName}!${realCostAddress}`,
    databaseMaterialTotal: 0,
    projectId: null,
    projectName: null,
    projectMatchStatus: "unmatched_project" as const,
    projectCandidates: [],
    validationMaterialCodes,
  };

  if (!realCostCell?.f) {
    return {
      ...base,
      formula: null,
      baselineAmount: null,
      candidateMaterialTotal: 0,
      excelRealCost: parseSafeNumber(realCostCell?.v),
      projectedTotal: null,
      difference: null,
      databaseDifference: null,
      status: "no_formula_to_analyze",
      warnings: ["REAL COST tidak mempunyai rumus sehingga tidak ada material yang dianalisis."],
      terms: [],
      formulaResult: null,
    };
  }

  try {
    const parsed = parseProjectFormula({
      workbook: input.workbook,
      fileHash: input.fileHash,
      sheetName: input.sheetName,
      sheet: input.sheet,
      sourceRow: input.row + 1,
      formulaAddress: realCostAddress,
      formulaCell: realCostCell,
    });
    const warnings: string[] = [];
    const candidateMaterialTotal = parsed.terms.reduce((sum, term) => sum + term.amount, 0);
    const projectedTotal = parsed.baselineAmount + candidateMaterialTotal;
    const difference = parsed.excelRealCost === null
      ? null
      : parsed.excelRealCost - projectedTotal;

    if (parsed.excelRealCost === null) {
      warnings.push("Cached value REAL COST tidak tersedia atau tidak numerik.");
    } else if (parsed.formulaResult !== parsed.excelRealCost || difference !== 0) {
      warnings.push(
        `Hasil parser Rp${parsed.formulaResult.toLocaleString("id-ID")} berbeda dari cached REAL COST Rp${parsed.excelRealCost.toLocaleString("id-ID")}.`,
      );
      for (const term of parsed.terms) {
        if (term.status !== "error") {
          term.status = "formula_mismatch";
        }
      }
    }

    if (description && /\(\s*kurang\s*\)/i.test(description)) {
      warnings.push("KETERANGAN mengandung (KURANG); keputusan material perlu direview.");
      for (const term of parsed.terms) {
        if (term.status !== "error" && term.status !== "formula_mismatch") {
          term.status = "needs_review_partial_material";
        }
      }
    }

    const formulaLabels = new Set(
      parsed.terms
        .map((term) => normalizeImportText(term.sourceLabel))
        .filter(Boolean),
    );
    for (const codeLabel of validationMaterialCodes) {
      const normalizedCodeLabel = normalizeImportText(codeLabel);
      if (
        normalizedCodeLabel &&
        !Array.from(formulaLabels).some(
          (label) => label.includes(normalizedCodeLabel) || normalizedCodeLabel.includes(label),
        )
      ) {
        warnings.push(`Kode KETERANGAN ${codeLabel} tidak ditemukan pada label referensi formula.`);
      }
    }

    const formulaMismatch = parsed.excelRealCost === null ||
      parsed.formulaResult !== parsed.excelRealCost ||
      difference !== 0;
    return {
      ...base,
      formula: parsed.formula,
      baselineAmount: parsed.baselineAmount,
      candidateMaterialTotal,
      excelRealCost: parsed.excelRealCost,
      projectedTotal,
      difference,
      databaseDifference: null,
      status: formulaMismatch
        ? "formula_mismatch"
        : getProjectStatusFromTerms(parsed.terms, "needs_project_match"),
      warnings,
      terms: parsed.terms,
      formulaResult: parsed.formulaResult,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rumus tidak dapat dianalisis.";
    const status: ImportRowStatus =
      error instanceof UnsupportedFormulaError ? "unsupported_formula" : "error";
    return {
      ...base,
      formula: `=${String(realCostCell.f)}`,
      baselineAmount: null,
      candidateMaterialTotal: 0,
      excelRealCost: parseSafeNumber(realCostCell.v),
      projectedTotal: null,
      difference: null,
      databaseDifference: null,
      status,
      warnings: [message],
      terms: [],
      formulaResult: null,
    };
  }
}

export function parseKmpMaterialWorkbook(
  workbook: XLSX.WorkBook,
  fileHash: string,
): ParsedKmpMaterialWorkbook {
  const projectSheets: string[] = [];
  const projects: KmpMaterialImportProjectAnalysis[] = [];
  const warnings: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }
    const headers = detectProjectSheetHeaders(sheet);
    if (!headers) {
      continue;
    }
    projectSheets.push(sheetName);
    const range = getSheetRange(sheet);
    for (let row = headers.row + 1; row <= range.e.r; row += 1) {
      const district = getCellText(getCell(sheet, row, headers.districtColumn));
      const projectName = getCellText(getCell(sheet, row, headers.projectColumn));
      if (!district || !projectName || !/[A-Za-zÀ-ž]/.test(district + projectName)) {
        continue;
      }
      projects.push(
        analyzeProjectRow({
          workbook,
          fileHash,
          sheetName,
          sheet,
          headers,
          row,
          district,
          projectName,
        }),
      );
    }
  }

  if (projectSheets.length === 0) {
    warnings.push(
      "Tidak ditemukan sheet proyek dengan header KECAMATAN, KELURAHAN, dan REAL COST.",
    );
  }
  return {
    sheetCount: workbook.SheetNames.length,
    projectSheets,
    projects,
    warnings,
  };
}
