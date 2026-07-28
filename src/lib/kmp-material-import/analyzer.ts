import type * as XLSX from "xlsx";
import { parseKmpMaterialWorkbook } from "@/lib/kmp-material-import/parser";
import { matchKmpProject } from "@/lib/kmp-material-import/project-matcher";
import {
  buildKmpMaterialImportMasters,
  matchKmpMaterial,
} from "@/lib/kmp-material-import/material-matcher";
import { detectKmpMaterialDuplicate } from "@/lib/kmp-material-import/duplicate-checker";
import type {
  ImportRowStatus,
  KmpMaterialImportDatabaseContext,
  KmpMaterialImportPreview,
  KmpMaterialImportProjectAnalysis,
  KmpMaterialImportTerm,
} from "@/lib/kmp-material-import/types";
import { normalizeImportText } from "@/lib/kmp-material-import/validators";

function getProjectStatus(project: KmpMaterialImportProjectAnalysis): ImportRowStatus {
  if (project.status === "no_formula_to_analyze" || project.terms.length === 0) {
    return project.status;
  }
  if (project.status === "unsupported_formula" || project.status === "error") {
    return project.status;
  }
  if (project.difference !== null && project.difference !== 0) {
    return "formula_mismatch";
  }
  if (project.projectMatchStatus === "ambiguous_project") {
    return "ambiguous_project";
  }
  if (project.projectMatchStatus === "unmatched_project") {
    return "unmatched_project";
  }
  if (project.projectMatchStatus === "suggested" || !project.projectId) {
    return "needs_project_match";
  }
  if (project.databaseDifference !== null && project.databaseDifference !== 0) {
    return "baseline_mismatch";
  }

  const precedence: ImportRowStatus[] = [
    "error",
    "unsupported_formula",
    "formula_mismatch",
    "needs_material_name",
    "needs_material_mapping",
    "needs_split_review",
    "needs_review_partial_material",
    "possible_duplicate",
    "will_update",
    "already_exists",
    "ready",
  ];
  return (
    precedence.find((status) => project.terms.some((term) => term.status === status)) ??
    "ready"
  );
}

function updateTermMaterialMatch(
  term: KmpMaterialImportTerm,
  input: {
    projectId: string | null;
    projectName: string | null;
    projectMatchStatus: KmpMaterialImportProjectAnalysis["projectMatchStatus"];
    masters: KmpMaterialImportPreview["materials"];
    context: KmpMaterialImportDatabaseContext;
    createCanonicalExpenseId: (projectId: string, materialKey: string) => string;
  },
) {
  const requiresPartialReview = term.status === "needs_review_partial_material";
  term.projectId = input.projectId;
  term.projectName = input.projectName;

  if (
    term.status === "error" ||
    term.status === "formula_mismatch" ||
    term.status === "unsupported_formula"
  ) {
    return;
  }

  const match = matchKmpMaterial({
    sourceLabel: term.sourceLabel,
    amount: term.amount,
    masters: input.masters,
    aliases: input.context.materialAliases,
  });
  term.materialKey = match.materialKey;
  term.materialName = match.materialName;
  term.submissionName = match.submissionName;
  term.confidence = match.confidence;
  term.suggestedSplit = match.suggestedSplit;
  if (match.warning) {
    term.warnings.push(match.warning);
  }

  if (input.projectMatchStatus === "ambiguous_project") {
    term.status = "ambiguous_project";
    return;
  }
  if (input.projectMatchStatus === "unmatched_project") {
    term.status = "unmatched_project";
    return;
  }
  if (input.projectMatchStatus === "suggested" || !input.projectId || !input.projectName) {
    term.status = "needs_project_match";
    return;
  }
  if (!term.sourceLabel) {
    term.status = "needs_material_name";
    return;
  }
  if (match.suggestedSplit) {
    term.status = "needs_split_review";
    return;
  }
  if (!match.materialKey || !match.materialName || match.needsReview) {
    term.status = "needs_material_mapping";
    return;
  }

  const duplicate = detectKmpMaterialDuplicate({
    projectId: input.projectId,
    materialKey: match.materialKey,
    materialName: match.materialName,
    amount: term.amount,
    canonicalExpenseId: input.createCanonicalExpenseId(
      input.projectId,
      match.materialKey,
    ),
    expenses: input.context.expenses,
  });
  term.status = duplicate.status;
  term.action = duplicate.action;
  term.existingExpenses = duplicate.existingExpenses;
  term.approved = duplicate.status === "ready" && !requiresPartialReview;
  if (requiresPartialReview) {
    term.status = "needs_review_partial_material";
  }
}

export function analyzeKmpMaterialWorkbook(input: {
  workbook: XLSX.WorkBook;
  fileName: string;
  fileSize: number;
  fileHash: string;
  context: KmpMaterialImportDatabaseContext;
  createCanonicalExpenseId: (projectId: string, materialKey: string) => string;
  analyzedAt?: string;
}): KmpMaterialImportPreview {
  const parsed = parseKmpMaterialWorkbook(input.workbook, input.fileHash);
  const materials = buildKmpMaterialImportMasters(input.context.materialConfigs);
  const expensesByProjectId = new Map<string, typeof input.context.expenses>();
  for (const expense of input.context.expenses) {
    const current = expensesByProjectId.get(expense.projectId) ?? [];
    current.push(expense);
    expensesByProjectId.set(expense.projectId, current);
  }

  for (const project of parsed.projects) {
    const projectMatch = matchKmpProject({
      excelProjectName: project.excelProjectName,
      district: project.district,
      projects: input.context.projects,
      aliases: input.context.projectAliases,
    });
    project.projectId = projectMatch.projectId;
    project.projectName = projectMatch.projectName;
    project.projectMatchStatus = projectMatch.status;
    project.projectCandidates = projectMatch.candidates;

    if (project.projectId) {
      const materialExpenses = (expensesByProjectId.get(project.projectId) ?? []).filter(
        (expense) => normalizeImportText(expense.category).includes("material"),
      );
      project.databaseMaterialTotal = materialExpenses.reduce(
        (sum, expense) => sum + (Number.isFinite(expense.amount) ? expense.amount : 0),
        0,
      );
      project.databaseDifference =
        project.baselineAmount === null
          ? null
          : project.databaseMaterialTotal - project.baselineAmount;
      if (project.databaseDifference !== null && project.databaseDifference !== 0) {
        project.warnings.push(
          "Total material database tidak sama dengan baseline pada Excel.",
        );
      }
    }

    for (const term of project.terms) {
      updateTermMaterialMatch(term, {
        projectId: project.projectId,
        projectName: project.projectName,
        projectMatchStatus: project.projectMatchStatus,
        masters: materials,
        context: input.context,
        createCanonicalExpenseId: input.createCanonicalExpenseId,
      });
    }

    if (project.projectId) {
      const termsByMaterialKey = new Map<string, KmpMaterialImportTerm[]>();
      for (const term of project.terms) {
        if (
          !term.materialKey ||
          !term.materialName ||
          term.status === "needs_material_mapping" ||
          term.status === "needs_material_name" ||
          term.status === "needs_split_review" ||
          term.status === "needs_review_partial_material" ||
          term.status === "formula_mismatch" ||
          term.status === "error" ||
          term.status === "unsupported_formula"
        ) {
          continue;
        }
        const current = termsByMaterialKey.get(term.materialKey) ?? [];
        current.push(term);
        termsByMaterialKey.set(term.materialKey, current);
      }
      for (const [materialKey, materialTerms] of termsByMaterialKey) {
        const materialName = materialTerms[0]?.materialName;
        if (!materialName) {
          continue;
        }
        const duplicate = detectKmpMaterialDuplicate({
          projectId: project.projectId,
          materialKey,
          materialName,
          amount: materialTerms.reduce((sum, term) => sum + term.amount, 0),
          canonicalExpenseId: input.createCanonicalExpenseId(
            project.projectId,
            materialKey,
          ),
          expenses: input.context.expenses,
        });
        for (const term of materialTerms) {
          term.status = duplicate.status;
          term.action = duplicate.action;
          term.existingExpenses = duplicate.existingExpenses;
          term.approved = duplicate.status === "ready";
        }
      }
    }

    const occurrences = new Map<string, number>();
    for (const term of project.terms) {
      const key = term.materialKey
        ? `${term.materialKey}:${term.sourceReference ?? term.sourceLabel ?? term.termIndex}`
        : `${term.sourceLabel ?? "unnamed"}:${term.sourceReference ?? term.amount}`;
      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    }
    for (const term of project.terms) {
      const key = term.materialKey
        ? `${term.materialKey}:${term.sourceReference ?? term.sourceLabel ?? term.termIndex}`
        : `${term.sourceLabel ?? "unnamed"}:${term.sourceReference ?? term.amount}`;
      term.occurrenceCount = occurrences.get(key) ?? 1;
    }
    project.status = getProjectStatus(project);
  }

  const terms = parsed.projects.flatMap((project) => project.terms);
  const formulaProjects = parsed.projects.filter((project) => project.formula);
  const reviewStatuses = new Set<ImportRowStatus>([
    "needs_project_match",
    "ambiguous_project",
    "unmatched_project",
    "needs_material_mapping",
    "needs_material_name",
    "needs_split_review",
    "needs_review_partial_material",
    "baseline_mismatch",
    "formula_mismatch",
    "possible_duplicate",
    "unsupported_formula",
    "error",
  ]);
  const summary = {
    sheetCount: parsed.sheetCount,
    projectSheetCount: parsed.projectSheets.length,
    projectSheets: parsed.projectSheets,
    projectCount: parsed.projects.length,
    formulaProjectCount: formulaProjects.length,
    noFormulaProjectCount: parsed.projects.length - formulaProjects.length,
    baselineCount: parsed.projects.filter((project) => project.baselineAmount !== null).length,
    formulaCount: formulaProjects.length,
    componentCount: terms.length,
    sheetReferenceCount: terms.filter((term) => term.sourceType === "sheet_reference").length,
    localReferenceCount: terms.filter((term) => term.sourceType === "local_reference").length,
    literalCount: terms.filter((term) => term.sourceType === "literal").length,
    recognizedMaterialCount: terms.filter(
      (term) => term.materialKey && term.confidence !== "Unresolved",
    ).length,
    needsReviewCount: terms.filter((term) => reviewStatuses.has(term.status)).length,
    unmatchedProjectCount: parsed.projects.filter(
      (project) =>
        project.projectMatchStatus === "unmatched_project" ||
        project.projectMatchStatus === "ambiguous_project" ||
        project.projectMatchStatus === "suggested",
    ).length,
    duplicateCount: terms.filter(
      (term) =>
        term.status === "already_exists" ||
        term.status === "will_update" ||
        term.status === "possible_duplicate",
    ).length,
    formulaErrorCount: parsed.projects.filter(
      (project) =>
        project.status === "formula_mismatch" ||
        project.status === "unsupported_formula" ||
        project.status === "error",
    ).length,
    unnamedComponentCount: terms.filter((term) => !term.sourceLabel).length,
    labeledLocalReferenceCount: terms.filter(
      (term) => term.sourceType === "local_reference" && term.sourceLabel,
    ).length,
    unlabeledLocalReferenceCount: terms.filter(
      (term) => term.sourceType === "local_reference" && !term.sourceLabel,
    ).length,
  };

  return {
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileHash: input.fileHash,
    analyzedAt: input.analyzedAt ?? new Date().toISOString(),
    summary,
    projects: parsed.projects,
    projectOptions: input.context.projects
      .filter((project) => normalizeImportText(project.clientName).includes("kmp cianjur"))
      .map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code,
        clientName: project.clientName,
        databaseMaterialTotal: input.context.expenses
          .filter(
            (expense) =>
              expense.projectId === project.id &&
              normalizeImportText(expense.category).includes("material"),
          )
          .reduce((sum, expense) => sum + expense.amount, 0),
        confidence: 1,
        reason: "Project KMP Cianjur tersedia.",
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "id-ID")),
    materials,
    warnings: parsed.warnings,
  };
}
