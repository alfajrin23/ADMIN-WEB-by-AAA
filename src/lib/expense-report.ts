import {
  COST_CATEGORIES,
  getCostCategoryLabel,
  toCategorySlug,
  type ExpenseCategoryOption,
} from "@/lib/constants";

export type ReportCategoryTotals = Record<string, number>;

const REPORT_CATEGORY_FILL_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0.91, 0.86, 0.69],
  [0.86, 0.72, 0.86],
  [0.78, 0.8, 0.87],
  [0.79, 0.79, 0.81],
  [0.79, 0.84, 0.76],
  [0.89, 0.81, 0.75],
  [0.91, 0.8, 0.42],
  [0.57, 0.76, 0.88],
  [0.86, 0.9, 0.78],
  [0.98, 0.86, 0.66],
];

export function buildReportCategoryOptions(
  expenseCategories: ExpenseCategoryOption[] | undefined,
  categoryValues: Array<string | null | undefined>,
) {
  const normalizedValues = categoryValues
    .map((value) => toCategorySlug(value ?? ""))
    .filter((value) => value.length > 0);
  if (normalizedValues.length === 0) {
    return [];
  }

  const includedValues = new Set(normalizedValues);
  const byValue = new Map<string, ExpenseCategoryOption>();
  const orderedValues: string[] = [];
  const seenValues = new Set<string>();

  const register = (item: string | ExpenseCategoryOption) => {
    const rawValue = typeof item === "string" ? item : item.value;
    const value = toCategorySlug(rawValue);
    if (!value) {
      return;
    }

    const explicitLabel = typeof item === "string" ? "" : item.label;
    const label = explicitLabel.trim() || getCostCategoryLabel(value);
    byValue.set(value, { value, label });
  };

  const appendIfIncluded = (rawValue: string) => {
    const value = toCategorySlug(rawValue);
    if (!value || !includedValues.has(value) || seenValues.has(value)) {
      return;
    }
    seenValues.add(value);
    if (!byValue.has(value)) {
      byValue.set(value, { value, label: getCostCategoryLabel(value) });
    }
    orderedValues.push(value);
  };

  for (const item of COST_CATEGORIES) {
    register(item);
    appendIfIncluded(item.value);
  }
  for (const item of expenseCategories ?? []) {
    register(item);
    appendIfIncluded(item.value);
  }
  for (const value of normalizedValues) {
    appendIfIncluded(value);
  }

  return orderedValues
    .map((value) => byValue.get(value))
    .filter((item): item is ExpenseCategoryOption => Boolean(item));
}

export function createEmptyCategoryTotals(categoryOptions: ExpenseCategoryOption[]) {
  return Object.fromEntries(
    categoryOptions.map((category) => [category.value, 0]),
  ) as ReportCategoryTotals;
}

export function buildReportCategoryTotals<T extends { category: string; amount: number }>(
  rows: T[],
  categoryOptions: ExpenseCategoryOption[],
) {
  const totalsByCategory = createEmptyCategoryTotals(categoryOptions);
  let total = 0;
  for (const row of rows) {
    totalsByCategory[row.category] = (totalsByCategory[row.category] ?? 0) + row.amount;
    total += row.amount;
  }
  return { totalsByCategory, total };
}

export function getExpenseCategoryFill(index: number) {
  return REPORT_CATEGORY_FILL_PALETTE[index % REPORT_CATEGORY_FILL_PALETTE.length] ?? [0.9, 0.9, 0.9];
}
