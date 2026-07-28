import type {
  KmpMaterialImportAggregatedRow,
  KmpMaterialImportTerm,
} from "@/lib/kmp-material-import/types";

export function aggregateKmpMaterialTerms(
  terms: KmpMaterialImportTerm[],
): KmpMaterialImportAggregatedRow[] {
  const rows = new Map<string, KmpMaterialImportAggregatedRow>();
  for (const term of terms) {
    if (
      !term.approved ||
      !term.projectId ||
      !term.projectName ||
      !term.materialKey ||
      !term.materialName ||
      term.amount <= 0 ||
      term.status === "ignored"
    ) {
      continue;
    }
    const key = `${term.projectId}:${term.materialKey}`;
    const current = rows.get(key);
    if (current) {
      current.amount += term.amount;
      current.termIds.push(term.id);
      current.formulaCells = Array.from(
        new Set([...current.formulaCells, term.formulaCell]),
      );
      current.sourceReferences.push(term.sourceReference ?? `literal:${term.termIndex}`);
      current.occurrenceCount += 1;
      current.existingExpenses = Array.from(
        new Map(
          [...current.existingExpenses, ...term.existingExpenses].map((expense) => [
            expense.id,
            expense,
          ]),
        ).values(),
      );
      if (term.action === "update_existing") {
        current.action = "update_existing";
      } else if (
        term.action === "skip_existing" &&
        current.action !== "update_existing"
      ) {
        current.action = "skip_existing";
      }
      continue;
    }
    rows.set(key, {
      id: key,
      projectId: term.projectId,
      projectName: term.projectName,
      materialKey: term.materialKey,
      materialName: term.materialName,
      submissionName: term.submissionName?.trim() || "Pengajuan Material KMP Cianjur",
      amount: term.amount,
      action: term.action,
      sourceSheet: term.sourceSheet,
      formulaCells: [term.formulaCell],
      sourceReferences: [term.sourceReference ?? `literal:${term.termIndex}`],
      termIds: [term.id],
      occurrenceCount: 1,
      existingExpenses: [...term.existingExpenses],
    });
  }
  return Array.from(rows.values()).sort(
    (left, right) =>
      left.projectName.localeCompare(right.projectName, "id-ID") ||
      left.materialName.localeCompare(right.materialName, "id-ID"),
  );
}

export function validateMaterialSplit(
  sourceAmount: number,
  parts: Array<{ amount: number; materialKey: string; materialName: string }>,
) {
  if (parts.length < 2) {
    return "Split minimal terdiri dari dua material.";
  }
  if (
    parts.some(
      (part) =>
        !part.materialKey ||
        !part.materialName ||
        !Number.isSafeInteger(part.amount) ||
        part.amount <= 0,
    )
  ) {
    return "Setiap hasil split harus mempunyai material dan nominal valid.";
  }
  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  return total === sourceAmount
    ? ""
    : `Total split Rp${total.toLocaleString("id-ID")} tidak sama dengan sumber Rp${sourceAmount.toLocaleString("id-ID")}.`;
}
