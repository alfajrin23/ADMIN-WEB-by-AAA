import type { ExpenseEntry } from "@/lib/types";
import type {
  ImportExpenseAction,
  ImportRowStatus,
  KmpMaterialImportExistingExpense,
} from "@/lib/kmp-material-import/types";
import { normalizeImportText } from "@/lib/kmp-material-import/validators";

export type KmpDuplicateCheckResult = {
  status: ImportRowStatus;
  action: ImportExpenseAction;
  existingExpenses: KmpMaterialImportExistingExpense[];
};

export function detectKmpMaterialDuplicate(input: {
  projectId: string;
  materialKey: string;
  materialName: string;
  amount: number;
  canonicalExpenseId: string;
  expenses: ExpenseEntry[];
}): KmpDuplicateCheckResult {
  const projectExpenses = input.expenses.filter(
    (expense) =>
      expense.projectId === input.projectId &&
      normalizeImportText(expense.category).includes("material"),
  );
  const normalizedName = normalizeImportText(input.materialName);
  const normalizedKey = normalizeImportText(input.materialKey);
  const importIdentity = normalizeImportText(
    `kmp import key ${input.projectId} ${input.materialKey}`,
  );
  const matches: KmpMaterialImportExistingExpense[] = [];

  for (const expense of projectExpenses) {
    const description = normalizeImportText(expense.description);
    const usage = normalizeImportText(expense.usageInfo);
    let matchKind: KmpMaterialImportExistingExpense["matchKind"] | null = null;
    if (expense.id === input.canonicalExpenseId) {
      matchKind = "canonical";
    } else if (usage.includes(importIdentity)) {
      matchKind = "import_identity";
    } else if (description && description === normalizedName) {
      matchKind = "exact_name";
    } else if (
      normalizedKey.length >= 3 &&
      (` ${description} `.includes(` ${normalizedKey} `) ||
        ` ${usage} `.includes(` ${normalizedKey} `))
    ) {
      matchKind = "keyword";
    }
    if (matchKind) {
      matches.push({
        id: expense.id,
        description: expense.description,
        requesterName: expense.requesterName,
        usageInfo: expense.usageInfo,
        amount: expense.amount,
        expenseDate: expense.expenseDate,
        matchKind,
      });
    }
  }

  const canonical = matches.find(
    (match) => match.matchKind === "canonical" || match.matchKind === "import_identity",
  );
  if (canonical) {
    if (canonical.amount === input.amount) {
      return {
        status: "already_exists",
        action: "skip_existing",
        existingExpenses: matches,
      };
    }
    return {
      status: "will_update",
      action: "update_existing",
      existingExpenses: matches,
    };
  }

  const exactMatches = matches.filter((match) => match.matchKind === "exact_name");
  const exactTotal = exactMatches.reduce((sum, match) => sum + match.amount, 0);
  if (exactMatches.length > 0 && exactTotal >= input.amount) {
    return {
      status: "already_exists",
      action: "skip_existing",
      existingExpenses: matches,
    };
  }
  if (matches.length > 0) {
    return {
      status: "possible_duplicate",
      action: "skip_existing",
      existingExpenses: matches,
    };
  }
  return {
    status: "ready",
    action: "insert_new",
    existingExpenses: [],
  };
}
