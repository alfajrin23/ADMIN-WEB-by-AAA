import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import type { ExpenseEntry, Project } from "@/lib/types";
import { matchKmpProject } from "@/lib/kmp-material-import/project-matcher";
import {
  buildKmpMaterialImportMasters,
  matchKmpMaterial,
} from "@/lib/kmp-material-import/material-matcher";
import { aggregateKmpMaterialTerms, validateMaterialSplit } from "@/lib/kmp-material-import/aggregator";
import { detectKmpMaterialDuplicate } from "@/lib/kmp-material-import/duplicate-checker";
import { analyzeKmpMaterialWorkbook } from "@/lib/kmp-material-import/analyzer";
import type { KmpMaterialImportTerm } from "@/lib/kmp-material-import/types";

function project(input: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    id: input.id,
    name: input.name,
    code: input.code ?? null,
    clientName: input.clientName ?? "KMP Cianjur",
    startDate: input.startDate ?? null,
    status: input.status ?? "aktif",
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function expense(input: Partial<ExpenseEntry> & Pick<ExpenseEntry, "id" | "projectId">): ExpenseEntry {
  return {
    id: input.id,
    projectId: input.projectId,
    category: input.category ?? "material",
    specialistType: input.specialistType ?? null,
    requesterName: input.requesterName ?? null,
    description: input.description ?? null,
    recipientName: input.recipientName ?? null,
    quantity: input.quantity ?? 1,
    unitLabel: input.unitLabel ?? null,
    usageInfo: input.usageInfo ?? null,
    unitPrice: input.unitPrice ?? 0,
    amount: input.amount ?? 0,
    expenseDate: input.expenseDate ?? "2026-07-28",
    createdAt: input.createdAt ?? "2026-07-28T00:00:00.000Z",
  };
}

describe("KMP import project matcher", () => {
  it("normalizes Desa/Kel prefixes and punctuation", () => {
    const result = matchKmpProject({
      excelProjectName: " Desa Sukamulya ",
      district: "Cugenang",
      projects: [
        project({
          id: "one",
          name: "Kel. Sukamulya",
          code: "Kecamatan Cugenang",
        }),
      ],
    });
    expect(result).toMatchObject({ projectId: "one", status: "exact" });
  });

  it("does not choose only by village name when districts differ", () => {
    const result = matchKmpProject({
      excelProjectName: "Neglasari",
      district: "Cibinong",
      projects: [
        project({ id: "south", name: "Neglasari", code: "Cibinong" }),
        project({ id: "north", name: "Neglasari", code: "Kadupandak" }),
      ],
    });
    expect(result).toMatchObject({ projectId: "south", status: "exact" });
  });

  it("returns ambiguous when duplicate names have no district evidence", () => {
    const result = matchKmpProject({
      excelProjectName: "Sindangsari",
      district: "Pacet",
      projects: [
        project({ id: "a", name: "Sindangsari" }),
        project({ id: "b", name: "Sindangsari" }),
      ],
    });
    expect(result.status).toBe("ambiguous_project");
    expect(result.projectId).toBeNull();
  });
});
describe("KMP import material matcher and split", () => {
  const masters = buildKmpMaterialImportMasters([]);

  it("maps built-in Excel aliases", () => {
    expect(
      matchKmpMaterial({ sourceLabel: "FOLDING", amount: 30_000_000, masters }),
    ).toMatchObject({ materialKey: "folding_gate", confidence: "Alias" });
    expect(
      matchKmpMaterial({ sourceLabel: "ME", amount: 19_500_000, masters }),
    ).toMatchObject({ materialKey: "mep", confidence: "Alias" });
  });

  it("keeps ATAP MERAH as a suggestion requiring approval", () => {
    expect(
      matchKmpMaterial({ sourceLabel: "ATAP MERAH", amount: 72_857_000, masters }),
    ).toMatchObject({
      materialKey: "atap",
      confidence: "Suggested",
      needsReview: true,
    });
  });

  it("suggests the validated Zincromate/Thiner split", () => {
    const result = matchKmpMaterial({
      sourceLabel: "ZINCHROMATE, THINER",
      amount: 3_270_000,
      masters,
    });
    expect(result.suggestedSplit).toEqual([
      { materialKey: "zincromate", materialName: "Zincromate", amount: 2_100_000 },
      { materialKey: "thiner", materialName: "Thiner", amount: 1_170_000 },
    ]);
    expect(validateMaterialSplit(3_270_000, result.suggestedSplit ?? [])).toBe("");
  });
});

describe("KMP import aggregation and duplicate detection", () => {
  const baseTerm: KmpMaterialImportTerm = {
    id: "one",
    sourceSheet: "UTARA",
    sourceRow: 10,
    formulaCell: "UTARA!G10",
    formula: "=100+Sheet1!H10",
    termIndex: 1,
    sourceType: "sheet_reference",
    sourceReference: "Sheet1!H10",
    sourceLabel: "SEMEN",
    sourceLabelRaw: "SEMEN",
    amount: 9_000_000,
    projectId: "project",
    projectName: "Babakan Karet",
    materialKey: "semen",
    materialName: "Semen",
    submissionName: "Pengajuan Semen",
    confidence: "Exact",
    status: "ready",
    approved: true,
    action: "insert_new",
    warnings: [],
    existingExpenses: [],
    suggestedSplit: null,
    occurrenceCount: 1,
  };

  it("aggregates repeated materials but preserves both term identities", () => {
    const rows = aggregateKmpMaterialTerms([
      baseTerm,
      { ...baseTerm, id: "two", termIndex: 2 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: 18_000_000,
      occurrenceCount: 2,
      termIds: ["one", "two"],
    });
  });

  it("detects an idempotent second import by canonical ID", () => {
    const result = detectKmpMaterialDuplicate({
      projectId: "project",
      materialKey: "semen",
      materialName: "Semen",
      amount: 9_000_000,
      canonicalExpenseId: "canonical",
      expenses: [
        expense({
          id: "canonical",
          projectId: "project",
          description: "Semen",
          amount: 9_000_000,
        }),
      ],
    });
    expect(result).toMatchObject({
      status: "already_exists",
      action: "skip_existing",
    });
  });

  it("offers an update when the canonical amount changed", () => {
    const result = detectKmpMaterialDuplicate({
      projectId: "project",
      materialKey: "semen",
      materialName: "Semen",
      amount: 18_000_000,
      canonicalExpenseId: "canonical",
      expenses: [
        expense({
          id: "canonical",
          projectId: "project",
          description: "Semen",
          amount: 9_000_000,
        }),
      ],
    });
    expect(result).toMatchObject({
      status: "will_update",
      action: "update_existing",
    });
  });
});

describe("KMP import database baseline validation", () => {
  it("flags a database total that differs from the Excel baseline", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["KECAMATAN", "KELURAHAN", "REAL COST", "KETERANGAN"],
      ["Cianjur", "Babakan Karet", null, "1"],
    ]);
    sheet.C2 = { t: "n", v: 1_300, f: "1000+Sheet1!H1" };
    sheet["!ref"] = "A1:D2";
    const reference = XLSX.utils.aoa_to_sheet([[1, "ATAP", null, null, null, null, null, 300]]);
    reference["!ref"] = "A1:H1";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "UTARA");
    XLSX.utils.book_append_sheet(workbook, reference, "Sheet1");
    const dbProject = project({ id: "project", name: "Babakan Karet", code: "Cianjur" });
    const preview = analyzeKmpMaterialWorkbook({
      workbook,
      fileName: "test.xlsx",
      fileSize: 100,
      fileHash: "hash",
      context: {
        projects: [dbProject],
        expenses: [
          expense({
            id: "existing",
            projectId: dbProject.id,
            description: "Material lama",
            amount: 900,
          }),
        ],
        materialConfigs: [],
      },
      createCanonicalExpenseId: (projectId, key) => `${projectId}:${key}`,
    });

    expect(preview.projects[0]).toMatchObject({
      databaseMaterialTotal: 900,
      databaseDifference: -100,
      status: "baseline_mismatch",
    });
    expect(preview.projects[0]?.warnings).toContain(
      "Total material database tidak sama dengan baseline pada Excel.",
    );
  });
});
