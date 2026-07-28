import * as XLSX from "xlsx";
import type { FormulaAst } from "@/lib/kmp-material-import/formula-tokenizer";
import {
  parseFormulaAst,
  tokenizeFormula,
  UnsupportedFormulaError,
} from "@/lib/kmp-material-import/formula-tokenizer";
import { parseSafeNumber } from "@/lib/kmp-material-import/validators";

export type FormulaCellResolver = (
  sheetName: string,
  address: string,
  visited?: Set<string>,
) => number;

export function createFormulaCellResolver(workbook: XLSX.WorkBook): FormulaCellResolver {
  const resolveCell: FormulaCellResolver = (sheetName, address, visited = new Set()) => {
    const normalizedAddress = address.replace(/\$/g, "").toUpperCase();
    const identity = `${sheetName}!${normalizedAddress}`;
    if (visited.has(identity)) {
      throw new UnsupportedFormulaError(`Referensi sel berulang terdeteksi pada ${identity}.`);
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new UnsupportedFormulaError(`Sheet "${sheetName}" tidak ditemukan.`);
    }
    const cell = sheet[normalizedAddress] as XLSX.CellObject | undefined;
    if (!cell) {
      throw new UnsupportedFormulaError(`Sel ${identity} kosong atau tidak ditemukan.`);
    }

    const cached = parseSafeNumber(cell.v);
    if (cached !== null) {
      return cached;
    }
    if (!cell.f) {
      throw new UnsupportedFormulaError(`Sel ${identity} tidak mempunyai nilai numerik.`);
    }

    const nextVisited = new Set(visited);
    nextVisited.add(identity);
    const ast = parseFormulaAst(tokenizeFormula(cell.f));
    return evaluateFormulaAst(ast, sheetName, resolveCell, nextVisited);
  };
  return resolveCell;
}

export function evaluateFormulaAst(
  ast: FormulaAst,
  currentSheet: string,
  resolveCell: FormulaCellResolver,
  visited = new Set<string>(),
): number {
  if (ast.type === "number") {
    return ast.value;
  }
  if (ast.type === "reference") {
    return resolveCell(ast.sheet ?? currentSheet, ast.address, visited);
  }
  if (ast.type === "unary") {
    const value = evaluateFormulaAst(ast.operand, currentSheet, resolveCell, visited);
    return ast.operator === "-" ? -value : value;
  }

  const left = evaluateFormulaAst(ast.left, currentSheet, resolveCell, visited);
  const right = evaluateFormulaAst(ast.right, currentSheet, resolveCell, visited);
  let result: number;
  if (ast.operator === "+") {
    result = left + right;
  } else if (ast.operator === "-") {
    result = left - right;
  } else if (ast.operator === "*") {
    result = left * right;
  } else {
    if (right === 0) {
      throw new UnsupportedFormulaError("Pembagian dengan nol tidak diizinkan.");
    }
    result = left / right;
  }

  if (!Number.isFinite(result) || !Number.isSafeInteger(result)) {
    throw new UnsupportedFormulaError("Hasil formula tidak berupa bilangan bulat yang aman.");
  }
  return result;
}
