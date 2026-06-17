import { describe, expect, it } from "vitest";
import {
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
