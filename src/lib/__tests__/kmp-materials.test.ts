import { describe, expect, it } from "vitest";
import {
  KMP_CIANJUR_MATERIAL_CHECKLIST,
  getKmpCianjurMaterialAmountOptions,
  getKmpCianjurMaterialRule,
} from "@/lib/kmp-materials";
import {
  buildKmpCianjurMaterialRequesterName,
  buildKmpCianjurMissingMaterialReport,
} from "@/lib/data";
import type { KmpClientMaterialConfig } from "@/lib/data";
import type { ExpenseEntry, Project } from "@/lib/types";

const project: Project = {
  id: "kmp-1",
  name: "KMP Test",
  code: null,
  clientName: "KMP Cianjur",
  startDate: "2026-05-01",
  status: "aktif",
  createdAt: "2026-05-01T00:00:00.000Z",
};

function createExpense(
  patch: Partial<ExpenseEntry> & Pick<ExpenseEntry, "id" | "description" | "amount">,
): ExpenseEntry {
  return {
    projectId: project.id,
    category: "material",
    specialistType: null,
    requesterName: "Pengaju Material",
    recipientName: null,
    quantity: 1,
    unitLabel: null,
    usageInfo: null,
    unitPrice: 0,
    expenseDate: "2026-05-30",
    createdAt: "2026-05-30T00:00:00.000Z",
    ...patch,
    id: patch.id,
    description: patch.description,
    amount: patch.amount,
  };
}

describe("KMP Cianjur material checklist", () => {
  it("excludes Hollo and Wiremesh from the KMP material check", () => {
    const removedConfigs: KmpClientMaterialConfig[] = [
      {
        id: "removed-hollo",
        clientKey: "kmp cianjur",
        clientName: "KMP Cianjur",
        materialKey: "hollo",
        materialName: "Hollo",
        submissionName: null,
        standardAmount: 69_440_000,
        minimumAmount: 0,
        checklistType: "system",
        checklistStatus: "auto",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "removed-wiremesh",
        clientKey: "kmp cianjur",
        clientName: "KMP Cianjur",
        materialKey: "wiremesh",
        materialName: "Wiremesh",
        submissionName: null,
        standardAmount: 10_500_000,
        minimumAmount: 0,
        checklistType: "system",
        checklistStatus: "auto",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ];
    const report = buildKmpCianjurMissingMaterialReport([project], [], removedConfigs);

    expect(KMP_CIANJUR_MATERIAL_CHECKLIST.map((item) => item.key)).not.toContain("hollo");
    expect(KMP_CIANJUR_MATERIAL_CHECKLIST.map((item) => item.key)).not.toContain("wiremesh");
    expect(report.projects[0]?.materialProgress.map((item) => item.materialKey)).not.toContain("hollo");
    expect(report.projects[0]?.materialProgress.map((item) => item.materialKey)).not.toContain("wiremesh");
  });

  it("includes Cat with the required minimum detection amount", () => {
    const rule = getKmpCianjurMaterialRule("cat");

    expect(rule?.label).toBe("Cat");
    expect(rule?.minimumDetectedAmount).toBe(5_500_000);
    expect(rule ? getKmpCianjurMaterialAmountOptions(rule) : []).toEqual([
      { label: "Sistem", amount: 5_500_000 },
    ]);
  });

  it("requires the Cat minimum for automatic detection", () => {
    const belowMinimum = buildKmpCianjurMissingMaterialReport(
      [project],
      [createExpense({ id: "cat-low", description: "Cat", amount: 5_499_999 })],
    );
    const atMinimum = buildKmpCianjurMissingMaterialReport(
      [project],
      [createExpense({ id: "cat-ok", description: "Cat", amount: 5_500_000 })],
    );

    expect(belowMinimum.projects[0]?.detectedMaterials).not.toContain("Cat");
    expect(atMinimum.projects[0]?.detectedMaterials).toContain("Cat");
  });

  it("accepts an explicit Cat checklist without nominal", () => {
    const report = buildKmpCianjurMissingMaterialReport(
      [project],
      [
        createExpense({
          id: "cat-checklist",
          description: "Cat",
          usageInfo: "Checklist Material KMP Cianjur - Cat - tanpa nominal",
          amount: 0,
        }),
      ],
    );

    expect(report.projects[0]?.detectedMaterials).toContain("Cat");
  });

  it("accepts an explicit custom material checklist without nominal", () => {
    const customMaterial: KmpClientMaterialConfig = {
      id: "custom-1",
      clientKey: "kmp cianjur",
      clientName: "KMP Cianjur",
      materialKey: "custom_plafon",
      materialName: "Custom Plafon",
      submissionName: null,
      standardAmount: 0,
      minimumAmount: 0,
      checklistType: "none",
      checklistStatus: "auto",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    };
    const report = buildKmpCianjurMissingMaterialReport(
      [project],
      [
        createExpense({
          id: "custom-checklist",
          description: "Custom Plafon",
          usageInfo: "Checklist Material KMP Cianjur - Custom Plafon - tanpa nominal",
          amount: 0,
        }),
      ],
      [customMaterial],
    );

    expect(report.projects[0]?.detectedMaterials).toContain("Custom Plafon");
  });

  it("does not detect material from nominal or vendor-only matches", () => {
    const bojongPetirProject: Project = {
      ...project,
      id: "bojong-petir",
      name: "Bojong Petir",
    };
    const customMaterial: KmpClientMaterialConfig = {
      id: "bojong-petir-alumunium",
      clientKey: "kmp cianjur",
      clientName: "KMP Cianjur",
      materialKey: "bojong_petir_alumunium",
      materialName: "Alumunium",
      submissionName: null,
      standardAmount: 46_105_000,
      minimumAmount: 0,
      checklistType: "system",
      checklistStatus: "auto",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    };
    const report = buildKmpCianjurMissingMaterialReport(
      [bojongPetirProject],
      [
        createExpense({
          id: "bojong-petir-nominal-only",
          projectId: bojongPetirProject.id,
          description: "Pembelian material",
          recipientName: "Supplier Alumunium Bojong Petir",
          amount: 46_105_000,
        }),
      ],
      [customMaterial],
    );

    const progress = report.projects[0]?.materialProgress.find(
      (item) => item.materialKey === customMaterial.materialKey,
    );

    expect(progress?.expenses).toEqual([]);
    expect(progress?.detectedAmount).toBe(0);
    expect(progress?.isFulfilled).toBe(false);
  });

  it("does not mark web-completed KMP projects as fulfilled without material input", () => {
    const completedProject: Project = {
      ...project,
      id: "kmp-completed",
      status: "selesai",
    };
    const customMaterial: KmpClientMaterialConfig = {
      id: "custom-completed",
      clientKey: "kmp cianjur",
      clientName: "KMP Cianjur",
      materialKey: "custom_plafon",
      materialName: "Custom Plafon",
      submissionName: null,
      standardAmount: 0,
      minimumAmount: 0,
      checklistType: "system",
      checklistStatus: "auto",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    };

    const report = buildKmpCianjurMissingMaterialReport(
      [completedProject],
      [],
      [customMaterial],
    );
    const projectReport = report.projects[0];

    expect(projectReport?.missingCount).toBe(projectReport?.totalChecklistCount);
    expect(projectReport?.missingMaterialDetails).toHaveLength(projectReport?.totalChecklistCount ?? 0);
    expect(projectReport?.totalChecklistCount).toBe(KMP_CIANJUR_MATERIAL_CHECKLIST.length + 1);
    expect(projectReport?.detectedCount).toBe(0);
    expect(projectReport?.materialProgress.every((item) => !item.isFulfilled)).toBe(true);
    expect(projectReport?.missingMaterials).toContain("Custom Plafon");
  });

  it("keeps project expense totals for completed material simulation", () => {
    const completedProject: Project = {
      ...project,
      id: "kmp-completed-total",
      status: "selesai",
    };
    const report = buildKmpCianjurMissingMaterialReport(
      [completedProject],
      [
        createExpense({
          id: "existing-material",
          projectId: completedProject.id,
          description: "Semen",
          amount: 9_300_000,
        }),
        createExpense({
          id: "existing-operational",
          projectId: completedProject.id,
          category: "operasional",
          description: "Operasional proyek",
          amount: 1_250_000,
        }),
      ],
    );

    expect(report.projects[0]?.projectExpenseTotal).toBe(10_550_000);
  });

  it("excludes generated checklist rows when resolving the majority requester", () => {
    const requesterName = buildKmpCianjurMaterialRequesterName(
      [project],
      [
        createExpense({ id: "real", description: "Semen", requesterName: "Pengaju Asli", amount: 9_300_000 }),
        createExpense({
          id: "generated-1",
          description: "Besi",
          requesterName: "Nama Sistem",
          usageInfo: "Checklist Material KMP Cianjur - Besi - nominal sistem",
          amount: 39_569_320,
        }),
        createExpense({
          id: "generated-2",
          description: "Atap",
          requesterName: "Nama Sistem",
          usageInfo: "Checklist Material KMP Cianjur - Atap - nominal sistem",
          amount: 113_577_500,
        }),
      ],
    );

    expect(requesterName).toBe("Pengaju Asli");
  });
});
