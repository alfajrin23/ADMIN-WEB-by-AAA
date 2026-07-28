import fs from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseKmpMaterialWorkbook } from "@/lib/kmp-material-import/parser";

function createWorkbook(input: {
  formula: string;
  cachedValue: number;
  localValues?: Record<string, string | number>;
  referenceValues?: Record<string, string | number | { value: string | number; formula: string }>;
  referenceSheetName?: string;
}) {
  const projectSheet = XLSX.utils.aoa_to_sheet([
    ["NO", "KECAMATAN", "/KELURAHAN", "REAL COST", "KETERANGAN"],
    [1, "Cianjur", "Babakan Karet", null, "1.2.3.5.7.11.10"],
  ]);
  projectSheet.D2 = {
    t: "n",
    v: input.cachedValue,
    f: input.formula.replace(/^=/, ""),
  };
  for (const [address, value] of Object.entries(input.localValues ?? {})) {
    projectSheet[address] = {
      t: typeof value === "number" ? "n" : "s",
      v: value,
    };
  }
  projectSheet["!ref"] = "A1:K2";

  const referenceSheetName = input.referenceSheetName ?? "Sheet1";
  const referenceSheet = XLSX.utils.aoa_to_sheet([
    [1, "ATAP"],
    [2, "CNP"],
    [3, "KRAMIK"],
    [4, "FOLDING"],
    [5, "ME"],
  ]);
  for (const [address, value] of Object.entries(input.referenceValues ?? {})) {
    referenceSheet[address] =
      typeof value === "object"
        ? {
            t: typeof value.value === "number" ? "n" : "s",
            v: value.value,
            f: value.formula,
          }
        : {
            t: typeof value === "number" ? "n" : "s",
            v: value,
          };
  }
  referenceSheet["!ref"] = "A1:I5";

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, projectSheet, "UTARA");
  XLSX.utils.book_append_sheet(workbook, referenceSheet, referenceSheetName);
  return workbook;
}

describe("KMP material Excel formula parser", () => {
  it("extracts a baseline and a Sheet1 material reference", () => {
    const workbook = createWorkbook({
      formula: "=1000+Sheet1!H2",
      cachedValue: 1300,
      referenceValues: { H2: 300 },
    });
    const parsed = parseKmpMaterialWorkbook(workbook, "hash");
    const project = parsed.projects[0]!;

    expect(project.baselineAmount).toBe(1000);
    expect(project.formulaResult).toBe(1300);
    expect(project.terms).toMatchObject([
      {
        sourceType: "sheet_reference",
        sourceReference: "Sheet1!H2",
        sourceLabel: "CNP",
        amount: 300,
      },
    ]);
  });

  it("extracts a local reference and its J/K label suggestion", () => {
    const workbook = createWorkbook({
      formula: "=1000+I2",
      cachedValue: 1250,
      localValues: { I2: 250, J2: "(ATAP MERAH)" },
    });
    const term = parseKmpMaterialWorkbook(workbook, "hash").projects[0]!.terms[0]!;

    expect(term.sourceType).toBe("local_reference");
    expect(term.sourceLabel).toBe("ATAP MERAH");
    expect(term.amount).toBe(250);
  });

  it("keeps a direct literal after the baseline unnamed", () => {
    const workbook = createWorkbook({
      formula: "=1000+250+300",
      cachedValue: 1550,
    });
    const terms = parseKmpMaterialWorkbook(workbook, "hash").projects[0]!.terms;

    expect(terms).toHaveLength(2);
    expect(terms.every((term) => term.sourceType === "literal")).toBe(true);
    expect(terms.every((term) => term.status === "needs_material_name")).toBe(true);
  });

  it("preserves repeated material references", () => {
    const workbook = createWorkbook({
      formula: "=1000+Sheet1!H2+Sheet1!H2",
      cachedValue: 1600,
      referenceValues: { H2: 300 },
    });
    const terms = parseKmpMaterialWorkbook(workbook, "hash").projects[0]!.terms;

    expect(terms).toHaveLength(2);
    expect(terms.map((term) => term.amount)).toEqual([300, 300]);
    expect(new Set(terms.map((term) => term.id)).size).toBe(2);
  });

  it("supports absolute references", () => {
    const workbook = createWorkbook({
      formula: "=1000+Sheet1!$H$2",
      cachedValue: 1300,
      referenceValues: { H2: 300 },
    });
    const project = parseKmpMaterialWorkbook(workbook, "hash").projects[0]!;

    expect(project.formulaResult).toBe(1300);
    expect(project.terms[0]?.sourceReference).toBe("Sheet1!H2");
  });

  it("supports quoted sheet names", () => {
    const workbook = createWorkbook({
      formula: "=1000+'Material Ref'!H2",
      cachedValue: 1300,
      referenceSheetName: "Material Ref",
      referenceValues: { H2: 300 },
    });
    const term = parseKmpMaterialWorkbook(workbook, "hash").projects[0]!.terms[0]!;

    expect(term.sourceLabel).toBe("CNP");
    expect(term.amount).toBe(300);
  });

  it("normalizes a numeric string cell", () => {
    const workbook = createWorkbook({
      formula: "=1000+Sheet1!H2",
      cachedValue: 1300,
      referenceValues: { H2: "300" },
    });
    expect(parseKmpMaterialWorkbook(workbook, "hash").projects[0]?.formulaResult).toBe(1300);
  });

  it("uses a cached formula value before evaluating the referenced formula", () => {
    const workbook = createWorkbook({
      formula: "=1000+Sheet1!H2",
      cachedValue: 1300,
      referenceValues: {
        H2: { value: 300, formula: "UNSUPPORTED(1)" },
      },
    });
    expect(parseKmpMaterialWorkbook(workbook, "hash").projects[0]?.formulaResult).toBe(1300);
  });

  it("marks a missing referenced cell as unsupported", () => {
    const workbook = createWorkbook({
      formula: "=1000+Sheet1!H2",
      cachedValue: 1300,
    });
    const project = parseKmpMaterialWorkbook(workbook, "hash").projects[0]!;

    expect(project.status).toBe("unsupported_formula");
    expect(project.warnings[0]).toContain("kosong");
  });

  it("rejects unsupported Excel functions without eval", () => {
    const workbook = createWorkbook({
      formula: "=1000+SUM(Sheet1!H2)",
      cachedValue: 1300,
      referenceValues: { H2: 300 },
    });
    expect(parseKmpMaterialWorkbook(workbook, "hash").projects[0]?.status).toBe(
      "unsupported_formula",
    );
  });

  it("passes the Babakan Karet acceptance calculation", () => {
    const workbook = createWorkbook({
      formula:
        "=609147876+I2+Sheet1!H2+Sheet1!H3+Sheet1!H5+4252500+7560000+3150000+2520000+1980000+7000000",
      cachedValue: 868104276,
      localValues: { I2: 72857000, J2: "(ATAP MERAH)" },
      referenceValues: { H2: 127452900, H3: 12684000, H5: 19500000 },
    });
    const project = parseKmpMaterialWorkbook(workbook, "hash").projects[0]!;

    expect(project.baselineAmount).toBe(609147876);
    expect(project.candidateMaterialTotal).toBe(258956400);
    expect(project.projectedTotal).toBe(868104276);
    expect(project.difference).toBe(0);
    expect(project.terms.filter((term) => term.status === "needs_material_name")).toHaveLength(6);
  });
});

const realWorkbookPath =
  process.env.KMP_REAL_C_PATH?.trim() || "G:/My Drive/ANANDA/REAL C.xlsx";
const runRealWorkbookTest = fs.existsSync(realWorkbookPath) ? it : it.skip;

runRealWorkbookTest("passes the complete REAL C.xlsx acceptance counts", () => {
  const workbook = XLSX.readFile(realWorkbookPath, {
    cellFormula: true,
    cellDates: false,
  });
  const parsed = parseKmpMaterialWorkbook(workbook, "real-c-acceptance");
  const terms = parsed.projects.flatMap((project) => project.terms);
  const babakanKaret = parsed.projects.find(
    (project) =>
      project.sourceSheet === "UTARA" &&
      project.realCostCell === "UTARA!G10",
  );

  expect(parsed.projects).toHaveLength(102);
  expect(parsed.projects.filter((project) => project.formula)).toHaveLength(95);
  expect(parsed.projects.filter((project) => !project.formula)).toHaveLength(7);
  expect(parsed.projects.filter((project) => project.baselineAmount !== null)).toHaveLength(95);
  expect(terms.filter((term) => term.sourceType === "sheet_reference")).toHaveLength(524);
  expect(terms.filter((term) => term.sourceType === "local_reference")).toHaveLength(9);
  expect(terms.filter((term) => term.sourceType === "literal")).toHaveLength(31);
  expect(terms).toHaveLength(564);
  expect(
    terms.filter((term) => term.sourceType === "local_reference" && term.sourceLabel),
  ).toHaveLength(6);
  expect(
    terms.filter((term) => term.sourceType === "local_reference" && !term.sourceLabel),
  ).toHaveLength(3);
  expect(terms.filter((term) => !term.sourceLabel)).toHaveLength(34);

  expect(babakanKaret).toMatchObject({
    baselineAmount: 609147876,
    candidateMaterialTotal: 309182400,
    projectedTotal: 918330276,
    excelRealCost: 918330276,
    difference: 0,
  });
  expect(
    babakanKaret?.terms.filter((term) => term.status === "needs_material_name"),
  ).toHaveLength(6);
});
