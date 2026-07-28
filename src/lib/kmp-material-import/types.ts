import type { ExpenseEntry, Project } from "@/lib/types";
import type {
  KmpChecklistStatus,
  KmpChecklistType,
  KmpClientMaterialConfig,
} from "@/lib/data";

export type ImportSourceType =
  | "sheet_reference"
  | "local_reference"
  | "literal";

export type ImportRowStatus =
  | "ready"
  | "needs_project_match"
  | "ambiguous_project"
  | "unmatched_project"
  | "needs_material_mapping"
  | "needs_material_name"
  | "needs_split_review"
  | "needs_review_partial_material"
  | "baseline_mismatch"
  | "formula_mismatch"
  | "no_formula_to_analyze"
  | "already_exists"
  | "will_update"
  | "possible_duplicate"
  | "ignored"
  | "unsupported_formula"
  | "error";

export type MaterialMatchConfidence =
  | "Exact"
  | "Alias"
  | "Suggested"
  | "Manual"
  | "Unresolved";

export type ImportExpenseAction =
  | "insert_new"
  | "update_existing"
  | "skip_existing";

export type KmpMaterialImportExistingExpense = {
  id: string;
  description: string | null;
  requesterName: string | null;
  usageInfo: string | null;
  amount: number;
  expenseDate: string;
  matchKind: "canonical" | "exact_name" | "keyword" | "import_identity";
};

export type KmpMaterialImportSplitPart = {
  materialKey: string;
  materialName: string;
  amount: number;
};

export type KmpMaterialImportTerm = {
  id: string;
  sourceSheet: string;
  sourceRow: number;
  formulaCell: string;
  formula: string;
  termIndex: number;
  sourceType: ImportSourceType;
  sourceReference: string | null;
  sourceLabel: string | null;
  sourceLabelRaw: string | null;
  amount: number;
  projectId: string | null;
  projectName: string | null;
  materialKey: string | null;
  materialName: string | null;
  submissionName: string | null;
  confidence: MaterialMatchConfidence;
  status: ImportRowStatus;
  approved: boolean;
  action: ImportExpenseAction;
  warnings: string[];
  existingExpenses: KmpMaterialImportExistingExpense[];
  suggestedSplit: KmpMaterialImportSplitPart[] | null;
  occurrenceCount: number;
};

export type KmpMaterialImportProjectCandidate = {
  id: string;
  name: string;
  code: string | null;
  clientName: string | null;
  databaseMaterialTotal?: number;
  confidence: number;
  reason: string;
};

export type KmpMaterialImportProjectAnalysis = {
  id: string;
  sourceSheet: string;
  sourceRow: number;
  district: string;
  excelProjectName: string;
  originalDescription: string | null;
  realCostCell: string;
  formula: string | null;
  baselineAmount: number | null;
  databaseMaterialTotal: number;
  candidateMaterialTotal: number;
  excelRealCost: number | null;
  projectedTotal: number | null;
  difference: number | null;
  databaseDifference: number | null;
  projectId: string | null;
  projectName: string | null;
  projectMatchStatus:
    | "exact"
    | "alias"
    | "suggested"
    | "ambiguous_project"
    | "unmatched_project";
  projectCandidates: KmpMaterialImportProjectCandidate[];
  status: ImportRowStatus;
  warnings: string[];
  validationMaterialCodes: string[];
  terms: KmpMaterialImportTerm[];
  formulaResult: number | null;
};

export type KmpMaterialImportSummary = {
  sheetCount: number;
  projectSheetCount: number;
  projectSheets: string[];
  projectCount: number;
  formulaProjectCount: number;
  noFormulaProjectCount: number;
  baselineCount: number;
  formulaCount: number;
  componentCount: number;
  sheetReferenceCount: number;
  localReferenceCount: number;
  literalCount: number;
  recognizedMaterialCount: number;
  needsReviewCount: number;
  unmatchedProjectCount: number;
  duplicateCount: number;
  formulaErrorCount: number;
  unnamedComponentCount: number;
  labeledLocalReferenceCount: number;
  unlabeledLocalReferenceCount: number;
};

export type KmpMaterialImportMaster = {
  id: string | null;
  materialKey: string;
  materialName: string;
  submissionName: string | null;
  standardAmount: number;
  minimumAmount: number;
  checklistType: KmpChecklistType;
  checklistStatus: KmpChecklistStatus;
  aliases: string[];
  isStatic: boolean;
};

export type KmpMaterialImportProjectAlias = {
  clientKey: string;
  excelProjectName: string;
  excelDistrict: string;
  projectId: string;
};

export type KmpMaterialImportMaterialAlias = {
  clientKey: string;
  sourceLabel: string;
  materialKey: string;
  split: KmpMaterialImportSplitPart[] | null;
};

export type KmpMaterialImportPreview = {
  fileName: string;
  fileSize: number;
  fileHash: string;
  analyzedAt: string;
  summary: KmpMaterialImportSummary;
  projects: KmpMaterialImportProjectAnalysis[];
  projectOptions: KmpMaterialImportProjectCandidate[];
  materials: KmpMaterialImportMaster[];
  warnings: string[];
};

export type KmpMaterialImportDatabaseContext = {
  projects: Project[];
  expenses: ExpenseEntry[];
  materialConfigs: KmpClientMaterialConfig[];
  projectAliases?: KmpMaterialImportProjectAlias[];
  materialAliases?: KmpMaterialImportMaterialAlias[];
};

export type KmpMaterialImportNewMaster = {
  clientKey: "kmp cianjur";
  materialKey: string;
  materialName: string;
  submissionName: string | null;
  standardAmount: number;
  minimumAmount: number;
  checklistType: KmpChecklistType;
  checklistStatus: KmpChecklistStatus;
  aliases: string[];
};

export type KmpMaterialImportDecision = {
  termId: string;
  approved: boolean;
  ignored: boolean;
  ignoreReason: string | null;
  projectId: string | null;
  materialKey: string | null;
  materialName: string | null;
  submissionName: string | null;
  action: ImportExpenseAction;
  rememberProjectMapping: boolean;
  rememberMaterialMapping: boolean;
  split: KmpMaterialImportSplitPart[] | null;
};

export type KmpMaterialImportCommitRequest = {
  fileHash: string;
  expenseDate: string;
  confirmedWarningProjectIds: string[];
  decisions: KmpMaterialImportDecision[];
  newMasters: KmpMaterialImportNewMaster[];
};

export type KmpMaterialImportCommitIssue = {
  projectId: string | null;
  projectName: string;
  termId: string | null;
  reason: string;
  amount: number;
};

export type KmpMaterialImportCommitResult = {
  success: boolean;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  inserted_projects: string[];
  updated_projects: string[];
  skipped_projects: KmpMaterialImportCommitIssue[];
  failed_projects: KmpMaterialImportCommitIssue[];
  total_nominal_success: number;
  total_nominal_failed: number;
  created_master_count: number;
  message: string;
};

export type KmpMaterialImportAggregatedRow = {
  id: string;
  projectId: string;
  projectName: string;
  materialKey: string;
  materialName: string;
  submissionName: string;
  amount: number;
  action: ImportExpenseAction;
  sourceSheet: string;
  formulaCells: string[];
  sourceReferences: string[];
  termIds: string[];
  occurrenceCount: number;
  existingExpenses: KmpMaterialImportExistingExpense[];
};
