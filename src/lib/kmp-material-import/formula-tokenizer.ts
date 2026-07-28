export type FormulaToken =
  | { type: "number"; value: number; raw: string; position: number }
  | {
      type: "reference";
      sheet: string | null;
      address: string;
      raw: string;
      position: number;
    }
  | { type: "operator"; value: "+" | "-" | "*" | "/"; position: number }
  | { type: "left_paren" | "right_paren"; position: number };

export class UnsupportedFormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFormulaError";
  }
}

function readQuotedSheet(formula: string, start: number) {
  let index = start + 1;
  let sheet = "";
  while (index < formula.length) {
    const character = formula[index];
    if (character === "'") {
      if (formula[index + 1] === "'") {
        sheet += "'";
        index += 2;
        continue;
      }
      if (formula[index + 1] !== "!") {
        throw new UnsupportedFormulaError("Nama sheet dengan tanda petik tidak valid.");
      }
      return { sheet, end: index + 2 };
    }
    sheet += character;
    index += 1;
  }
  throw new UnsupportedFormulaError("Nama sheet dengan tanda petik tidak ditutup.");
}

function readUnquotedSheet(formula: string, start: number) {
  let index = start;
  while (index < formula.length && /[A-Za-z0-9_. ]/.test(formula[index] ?? "")) {
    index += 1;
  }
  if (formula[index] !== "!") {
    return null;
  }
  const sheet = formula.slice(start, index).trim();
  if (!sheet || sheet.includes("[")) {
    throw new UnsupportedFormulaError("Referensi workbook eksternal tidak didukung.");
  }
  return { sheet, end: index + 1 };
}

function readCellAddress(formula: string, start: number) {
  const match = formula.slice(start).match(/^\$?([A-Za-z]{1,3})\$?([1-9]\d*)/);
  if (!match) {
    return null;
  }
  return {
    address: `${match[1]?.toUpperCase()}${match[2]}`,
    raw: match[0],
    end: start + match[0].length,
  };
}

export function tokenizeFormula(input: string): FormulaToken[] {
  const formula = input.trim().replace(/^=/, "");
  if (!formula) {
    throw new UnsupportedFormulaError("Rumus kosong.");
  }
  if (formula.includes("[") || formula.includes("]")) {
    throw new UnsupportedFormulaError("Referensi workbook eksternal tidak didukung.");
  }

  const tokens: FormulaToken[] = [];
  let index = 0;
  while (index < formula.length) {
    const character = formula[index] ?? "";
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "+" || character === "-" || character === "*" || character === "/") {
      tokens.push({ type: "operator", value: character, position: index });
      index += 1;
      continue;
    }
    if (character === "(") {
      tokens.push({ type: "left_paren", position: index });
      index += 1;
      continue;
    }
    if (character === ")") {
      tokens.push({ type: "right_paren", position: index });
      index += 1;
      continue;
    }
    if (/\d|\./.test(character)) {
      const match = formula.slice(index).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
      if (!match) {
        throw new UnsupportedFormulaError(`Angka tidak valid pada posisi ${index + 1}.`);
      }
      const value = Number(match[0]);
      if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
        throw new UnsupportedFormulaError("Angka pada rumus melebihi batas aman.");
      }
      tokens.push({ type: "number", value, raw: match[0], position: index });
      index += match[0].length;
      continue;
    }

    const tokenStart = index;
    let sheet: string | null = null;
    if (character === "'") {
      const quoted = readQuotedSheet(formula, index);
      sheet = quoted.sheet;
      index = quoted.end;
    } else {
      const unquoted = readUnquotedSheet(formula, index);
      if (unquoted) {
        sheet = unquoted.sheet;
        index = unquoted.end;
      }
    }

    const cell = readCellAddress(formula, index);
    if (cell) {
      index = cell.end;
      tokens.push({
        type: "reference",
        sheet,
        address: cell.address,
        raw: formula.slice(tokenStart, index),
        position: tokenStart,
      });
      continue;
    }

    const word = formula.slice(tokenStart).match(/^[A-Za-z_][A-Za-z0-9_.]*/)?.[0] ?? character;
    throw new UnsupportedFormulaError(
      `Formula atau nama "${word}" belum didukung. Hanya operasi matematika dan referensi sel yang diizinkan.`,
    );
  }

  return tokens;
}

export type FormulaAst =
  | { type: "number"; value: number; raw: string }
  | { type: "reference"; sheet: string | null; address: string; raw: string }
  | { type: "unary"; operator: "+" | "-"; operand: FormulaAst }
  | {
      type: "binary";
      operator: "+" | "-" | "*" | "/";
      left: FormulaAst;
      right: FormulaAst;
    };

export function parseFormulaAst(tokens: FormulaToken[]): FormulaAst {
  let cursor = 0;

  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  const parsePrimary = (): FormulaAst => {
    const token = consume();
    if (!token) {
      throw new UnsupportedFormulaError("Rumus berhenti sebelum ekspresi selesai.");
    }
    if (token.type === "number") {
      return { type: "number", value: token.value, raw: token.raw };
    }
    if (token.type === "reference") {
      return {
        type: "reference",
        sheet: token.sheet,
        address: token.address,
        raw: token.raw,
      };
    }
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      return { type: "unary", operator: token.value, operand: parsePrimary() };
    }
    if (token.type === "left_paren") {
      const expression = parseAdditive();
      if (consume()?.type !== "right_paren") {
        throw new UnsupportedFormulaError("Tanda kurung pada rumus tidak seimbang.");
      }
      return expression;
    }
    throw new UnsupportedFormulaError("Struktur rumus tidak valid.");
  };

  const parseMultiplicative = (): FormulaAst => {
    let node = parsePrimary();
    while (true) {
      const next = peek();
      if (
        next?.type !== "operator" ||
        (next.value !== "*" && next.value !== "/")
      ) {
        break;
      }
      const operator = (consume() as Extract<FormulaToken, { type: "operator" }>).value as "*" | "/";
      node = { type: "binary", operator, left: node, right: parsePrimary() };
    }
    return node;
  };

  const parseAdditive = (): FormulaAst => {
    let node = parseMultiplicative();
    while (true) {
      const next = peek();
      if (
        next?.type !== "operator" ||
        (next.value !== "+" && next.value !== "-")
      ) {
        break;
      }
      const operator = (consume() as Extract<FormulaToken, { type: "operator" }>).value as "+" | "-";
      node = { type: "binary", operator, left: node, right: parseMultiplicative() };
    }
    return node;
  };

  const result = parseAdditive();
  if (cursor !== tokens.length) {
    throw new UnsupportedFormulaError("Terdapat token formula yang tidak dapat divalidasi.");
  }
  return result;
}

export type AdditiveFormulaTerm = {
  sign: 1 | -1;
  node: FormulaAst;
};

export function flattenAdditiveTerms(ast: FormulaAst): AdditiveFormulaTerm[] {
  const terms: AdditiveFormulaTerm[] = [];
  const visit = (node: FormulaAst, sign: 1 | -1) => {
    if (node.type === "binary" && (node.operator === "+" || node.operator === "-")) {
      visit(node.left, sign);
      visit(node.right, node.operator === "+" ? sign : sign === 1 ? -1 : 1);
      return;
    }
    if (node.type === "unary") {
      visit(node.operand, node.operator === "+" ? sign : sign === 1 ? -1 : 1);
      return;
    }
    terms.push({ sign, node });
  };
  visit(ast, 1);
  return terms;
}
