import {
  getCostCategoryLabel,
  isHiddenCostCategory,
  resolveSummaryCostCategory,
  type ExpenseCategoryOption,
} from "@/lib/constants";
import { buildReportCategoryOptions, buildReportCategoryTotals } from "@/lib/expense-report";
import type { ExpenseEntry } from "@/lib/types";

type ClipboardProjectDetail = {
  projectName: string;
  expenses: ExpenseEntry[];
};

const amountFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

const SUMMARY_LABEL_MAP: Record<string, string> = {
  material: "MATERIAL",
  upah_kasbon_tukang: "HOK",
  upah_staff_pelaksana: "UPAH STAFF/PELAKSANA",
  upah_tim_spesialis: "UPAH TIM SPESIALIS",
  operasional: "OPERASIONAL",
  alat: "ALAT",
};

const SECTION_SEPARATOR = "----------------------------------------------------";

function normalizeText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function formatProjectTitle(projectName: string) {
  const normalized = normalizeText(projectName);
  return (normalized || "PROJECT").toUpperCase();
}

function formatAmount(value: number) {
  return amountFormatter.format(value);
}

function formatQuantity(value: number) {
  return quantityFormatter.format(value);
}

function formatSummaryLabel(category: string) {
  return SUMMARY_LABEL_MAP[category] ?? getCostCategoryLabel(category).toUpperCase();
}

function formatDetailLabel(category: string, specialistType: string | null | undefined) {
  const categoryLabel = getCostCategoryLabel(category).toUpperCase();
  const specialistLabel = normalizeText(specialistType);
  if (!specialistLabel) {
    return categoryLabel;
  }
  return `${categoryLabel} (${specialistLabel.toUpperCase()})`;
}

function formatDetailDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const day = String(date.getDate()).padStart(2, "0");
  const month = monthNames[date.getMonth()] ?? "Jan";
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function formatTextValue(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized || "-";
}

function sortExpenses(a: ExpenseEntry, b: ExpenseEntry) {
  if (a.expenseDate !== b.expenseDate) {
    return a.expenseDate.localeCompare(b.expenseDate);
  }
  return (a.requesterName ?? "").localeCompare(b.requesterName ?? "");
}

function joinSections(sections: string[]) {
  return sections.join(`\n\n${SECTION_SEPARATOR}\n\n`);
}

export function buildExpenseRecapClipboardText(
  details: ClipboardProjectDetail[],
  expenseCategories: ExpenseCategoryOption[],
) {
  const categoryValues = details.flatMap((detail) =>
    detail.expenses
      .filter((expense) => !isHiddenCostCategory(expense.category))
      .map((expense) =>
        resolveSummaryCostCategory({
          category: expense.category,
          description: expense.description,
          usageInfo: expense.usageInfo,
        }),
      )
      .filter((category) => category.length > 0),
  );
  const categoryOptions = buildReportCategoryOptions(expenseCategories, categoryValues);

  const sections = details
    .map((detail) => {
      const summaryRows = detail.expenses
        .filter((expense) => !isHiddenCostCategory(expense.category))
        .map((expense) => ({
          category: resolveSummaryCostCategory({
            category: expense.category,
            description: expense.description,
            usageInfo: expense.usageInfo,
          }),
          amount: expense.amount,
        }))
        .filter((expense) => expense.category.length > 0);
      const { totalsByCategory, total } = buildReportCategoryTotals(summaryRows, categoryOptions);
      const categoryLines = categoryOptions
        .map((category) => ({
          label: formatSummaryLabel(category.value),
          total: totalsByCategory[category.value] ?? 0,
        }))
        .filter((category) => category.total !== 0)
        .map((category) => `${category.label} : ${formatAmount(category.total)}`);

      if (categoryLines.length === 0 && total === 0) {
        return "";
      }

      const projectTitle = formatProjectTitle(detail.projectName);
      return [
        `*REKAP PENGELUARAN ${projectTitle}*`,
        ...categoryLines,
        "",
        `*TOTAL PENGELUARAN ${projectTitle} : ${formatAmount(total)}*`,
      ].join("\n");
    })
    .filter((section) => section.length > 0);

  return joinSections(sections);
}

export function buildExpenseDetailClipboardText(details: ClipboardProjectDetail[]) {
  const sections = details
    .map((detail) => {
      const rows = detail.expenses
        .filter((expense) => !isHiddenCostCategory(expense.category))
        .slice()
        .sort(sortExpenses);
      if (rows.length === 0) {
        return "";
      }

      const total = rows.reduce((sum, row) => sum + row.amount, 0);
      const projectTitle = formatProjectTitle(detail.projectName);
      const body = rows
        .map((row, index) => {
          const unitLabel = normalizeText(row.unitLabel) || "unit";
          const quantityPrice = `${formatQuantity(row.quantity)} ${unitLabel} x ${formatAmount(row.unitPrice)}`;

          return [
            `${index + 1}. ${formatDetailDate(row.expenseDate)} | ${formatDetailLabel(row.category, row.specialistType)} | ${formatAmount(row.amount)}`,
            `Pengaju : ${formatTextValue(row.requesterName)}`,
            `Rincian : ${formatTextValue(row.description)}`,
            `Vendor : ${formatTextValue(row.recipientName)}`,
            `Qty x Harga : ${quantityPrice}`,
            `Penggunaan : ${formatTextValue(row.usageInfo)}`,
          ].join("\n");
        })
        .join("\n\n");

      return [
        `*RINCIAN BIAYA ${projectTitle}*`,
        "",
        body,
        "",
        `*TOTAL RINCIAN ${projectTitle} : ${formatAmount(total)}*`,
      ].join("\n");
    })
    .filter((section) => section.length > 0);

  return joinSections(sections);
}
