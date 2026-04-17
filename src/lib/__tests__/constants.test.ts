import { describe, it, expect } from "vitest";
import {
  toCategorySlug,
  getCostCategoryLabel,
  formatCostCategoryLabel,
  isHiddenCostCategory,
  mergeExpenseCategoryOptions,
  parseCategoryListInput,
} from "@/lib/constants";

describe("toCategorySlug", () => {
  it("should normalize a string to a slug", () => {
    expect(toCategorySlug("Material")).toBe("material");
    expect(toCategorySlug("Upah / Kasbon Tukang")).toBe("upah_kasbon_tukang");
    expect(toCategorySlug("  alat  ")).toBe("alat");
  });

  it("should resolve aliases", () => {
    expect(toCategorySlug("pasir")).toBe("material");
  });

  it("should return empty for empty input", () => {
    expect(toCategorySlug("")).toBe("");
    expect(toCategorySlug("   ")).toBe("");
  });
});

describe("getCostCategoryLabel", () => {
  it("should return known category labels", () => {
    expect(getCostCategoryLabel("material")).toBe("Material");
    expect(getCostCategoryLabel("operasional")).toBe("Operasional");
  });

  it("should format unknown categories", () => {
    expect(getCostCategoryLabel("custom_stuff")).toBe("Custom Stuff");
  });
});

describe("formatCostCategoryLabel", () => {
  it("should title-case words", () => {
    expect(formatCostCategoryLabel("hello_world")).toBe("Hello World");
    expect(formatCostCategoryLabel("upah-tukang")).toBe("Upah Tukang");
  });

  it("should return 'Kategori' for empty input", () => {
    expect(formatCostCategoryLabel("")).toBe("Kategori");
  });
});

describe("isHiddenCostCategory", () => {
  it("should identify hidden categories", () => {
    expect(isHiddenCostCategory("perawatan")).toBe(true);
    expect(isHiddenCostCategory("Perawatan")).toBe(true);
  });

  it("should not hide normal categories", () => {
    expect(isHiddenCostCategory("material")).toBe(false);
    expect(isHiddenCostCategory("operasional")).toBe(false);
  });
});

describe("mergeExpenseCategoryOptions", () => {
  it("should include all default categories", () => {
    const result = mergeExpenseCategoryOptions();
    expect(result.length).toBeGreaterThanOrEqual(6);
    expect(result[0].value).toBe("material");
  });

  it("should merge custom categories", () => {
    const result = mergeExpenseCategoryOptions(["custom_new"]);
    const custom = result.find((item) => item.value === "custom_new");
    expect(custom).toBeDefined();
    expect(custom?.label).toBe("Custom New");
  });

  it("should not include hidden categories", () => {
    const result = mergeExpenseCategoryOptions(["perawatan"]);
    const hidden = result.find((item) => item.value === "perawatan");
    expect(hidden).toBeUndefined();
  });
});

describe("parseCategoryListInput", () => {
  it("should parse comma-separated categories", () => {
    const result = parseCategoryListInput("material, alat, operasional");
    expect(result).toEqual(["material", "alat", "operasional"]);
  });

  it("should resolve aliases and deduplicate", () => {
    const result = parseCategoryListInput("pasir, material");
    expect(result).toEqual(["material"]);
  });

  it("should filter empty and hidden categories", () => {
    const result = parseCategoryListInput(", perawatan, material");
    expect(result).toEqual(["material"]);
  });
});
