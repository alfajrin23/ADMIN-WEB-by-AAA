"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import {
  completeKmpCianjurProjectsWithFullMaterialProgress,
  createDeterministicUuid,
  createExpenseMutationId,
  createTimestamp,
  getSupabaseMutationErrorMessage,
  revalidateExpenseCache,
  revalidateProjectCache,
  revalidateProjectPages,
  requireEditorActionUser,
  runFirebaseWriteSafely,
} from "@/app/actions/utils";
import { queueActivityLog } from "@/lib/activity-logs";
import { getKmpMaterialImportDatabaseContext } from "@/lib/data";
import {
  insertExcelExpense,
  updateExcelExpense,
} from "@/lib/excel-db";
import { getFirestoreServerClient } from "@/lib/firebase";
import { analyzeKmpMaterialWorkbook } from "@/lib/kmp-material-import/analyzer";
import { validateMaterialSplit } from "@/lib/kmp-material-import/aggregator";
import { detectKmpMaterialDuplicate } from "@/lib/kmp-material-import/duplicate-checker";
import type {
  ImportExpenseAction,
  KmpMaterialImportCommitIssue,
  KmpMaterialImportCommitRequest,
  KmpMaterialImportCommitResult,
  KmpMaterialImportDecision,
  KmpMaterialImportMaterialAlias,
  KmpMaterialImportNewMaster,
  KmpMaterialImportPreview,
  KmpMaterialImportProjectAlias,
  KmpMaterialImportSplitPart,
} from "@/lib/kmp-material-import/types";
import {
  KMP_MATERIAL_IMPORT_CLIENT_KEY,
  KMP_MATERIAL_IMPORT_CLIENT_NAME,
  isKmpCianjurClient,
  normalizeImportText,
  normalizeMaterialKey,
  validateExpenseDate,
  validateImportFile,
} from "@/lib/kmp-material-import/validators";
import { activeDataSource } from "@/lib/storage";
import {
  getSupabaseServerClient,
  isSupabaseWriteConfigured,
} from "@/lib/supabase";

export type AnalyzeKmpMaterialExcelActionResult =
  | { success: true; preview: KmpMaterialImportPreview }
  | { success: false; error: string };

type ExpenseMutationRow = {
  id: string;
  project_id: string;
  project_name: string;
  category: "material";
  specialist_type: null;
  requester_name: string;
  description: string;
  recipient_name: null;
  quantity: 1;
  unit_label: null;
  usage_info: string;
  unit_price: 0;
  amount: number;
  expense_date: string;
  action: ImportExpenseAction;
  source_project_id: string;
  term_ids: string[];
  material_key: string;
};

type CommitLine = {
  sourceProjectId: string;
  sourceSheet: string;
  formulaCell: string;
  sourceReference: string;
  termId: string;
  projectId: string;
  projectName: string;
  materialKey: string;
  materialName: string;
  submissionName: string;
  amount: number;
  action: ImportExpenseAction;
};

const IMPORT_ALIAS_TABLE = "kmp_material_import_aliases";
const IMPORT_RULE_TABLE = "kmp_material_import_rules";
const WRITE_CHUNK_SIZE = 100;

function canonicalExpenseId(projectId: string, materialKey: string) {
  return createExpenseMutationId({
    mode: "kmp_material_check",
    submissionToken: "kmp-material-check",
    projectId,
    rowKey: materialKey,
  });
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(value: unknown) {
  return value === true;
}

function getSafeNonNegativeInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function getExpenseAction(value: unknown): ImportExpenseAction {
  return value === "update_existing" || value === "skip_existing"
    ? value
    : "insert_new";
}

function parseSplit(value: unknown): KmpMaterialImportSplitPart[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const parts = value
    .map((item) => {
      const row = getObject(item);
      if (!row) {
        return null;
      }
      const materialKey = getText(row.materialKey);
      const materialName = getText(row.materialName);
      const amount = getSafeNonNegativeInteger(row.amount);
      return materialKey && materialName && amount > 0
        ? { materialKey, materialName, amount }
        : null;
    })
    .filter((part): part is KmpMaterialImportSplitPart => Boolean(part));
  return parts.length > 0 ? parts : null;
}

function parseDecision(value: unknown): KmpMaterialImportDecision | null {
  const row = getObject(value);
  if (!row) {
    return null;
  }
  const termId = getText(row.termId);
  if (!termId) {
    return null;
  }
  return {
    termId,
    approved: getBoolean(row.approved),
    ignored: getBoolean(row.ignored),
    ignoreReason: getText(row.ignoreReason) || null,
    projectId: getText(row.projectId) || null,
    materialKey: getText(row.materialKey) || null,
    materialName: getText(row.materialName) || null,
    submissionName: getText(row.submissionName) || null,
    action: getExpenseAction(row.action),
    rememberProjectMapping: getBoolean(row.rememberProjectMapping),
    rememberMaterialMapping: getBoolean(row.rememberMaterialMapping),
    split: parseSplit(row.split),
  };
}

function parseNewMaster(value: unknown): KmpMaterialImportNewMaster | null {
  const row = getObject(value);
  if (!row) {
    return null;
  }
  const materialName = getText(row.materialName);
  const materialKey =
    normalizeMaterialKey(getText(row.materialKey) || materialName);
  if (!materialName || !materialKey) {
    return null;
  }
  const rawAliases = Array.isArray(row.aliases) ? row.aliases : [];
  return {
    clientKey: KMP_MATERIAL_IMPORT_CLIENT_KEY,
    materialKey,
    materialName,
    submissionName: getText(row.submissionName) || null,
    standardAmount: getSafeNonNegativeInteger(row.standardAmount),
    minimumAmount: getSafeNonNegativeInteger(row.minimumAmount),
    checklistType:
      row.checklistType === "none" || row.checklistType === "manual"
        ? row.checklistType
        : "system",
    checklistStatus:
      row.checklistStatus === "pending" || row.checklistStatus === "fulfilled"
        ? row.checklistStatus
        : "auto",
    aliases: Array.from(
      new Set(
        rawAliases
          .map((alias) => getText(alias))
          .filter((alias) => alias.length > 0),
      ),
    ),
  };
}

function parseCommitRequest(raw: string): KmpMaterialImportCommitRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const row = getObject(parsed);
  if (!row) {
    return null;
  }
  const fileHash = getText(row.fileHash);
  const expenseDate = getText(row.expenseDate);
  if (!/^[a-f0-9]{64}$/i.test(fileHash) || !validateExpenseDate(expenseDate)) {
    return null;
  }
  const decisions = (Array.isArray(row.decisions) ? row.decisions : [])
    .map(parseDecision)
    .filter((decision): decision is KmpMaterialImportDecision => Boolean(decision));
  const newMasters = (Array.isArray(row.newMasters) ? row.newMasters : [])
    .map(parseNewMaster)
    .filter((master): master is KmpMaterialImportNewMaster => Boolean(master));
  const confirmedWarningProjectIds = Array.from(
    new Set(
      (Array.isArray(row.confirmedWarningProjectIds)
        ? row.confirmedWarningProjectIds
        : []
      )
        .map((value) => getText(value))
        .filter(Boolean),
    ),
  );
  return {
    fileHash,
    expenseDate,
    confirmedWarningProjectIds,
    decisions,
    newMasters,
  };
}

async function readImportFile(formData: FormData) {
  const value = formData.get("file");
  if (!(value instanceof File)) {
    throw new Error("Pilih file Excel terlebih dahulu.");
  }
  const validationError = validateImportFile(value);
  if (validationError) {
    throw new Error(validationError);
  }
  const buffer = new Uint8Array(await value.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "array",
      cellFormula: true,
      cellDates: false,
      cellNF: false,
      cellText: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("password") || message.includes("encrypt")) {
      throw new Error("File terenkripsi atau memakai password dan tidak dapat dianalisis.");
    }
    throw new Error("File Excel rusak atau tidak dapat dibaca.");
  }
  return { file: value, buffer, fileHash, workbook };
}

function isMissingImportTableError(error: unknown) {
  const row = getObject(error);
  const code = getText(row?.code);
  const text = [row?.message, row?.details]
    .map((value) => getText(value))
    .join(" ")
    .toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    text.includes("does not exist") ||
    text.includes("schema cache")
  );
}

async function loadRememberedMappings() {
  const projectAliases: KmpMaterialImportProjectAlias[] = [];
  const materialAliases: KmpMaterialImportMaterialAlias[] = [];
  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return { projectAliases, materialAliases };
    }
    const [projectResult, materialResult] = await Promise.all([
      supabase
        .from(IMPORT_ALIAS_TABLE)
        .select("client_key, excel_project_name, excel_district, project_id")
        .eq("client_key", KMP_MATERIAL_IMPORT_CLIENT_KEY),
      supabase
        .from(IMPORT_RULE_TABLE)
        .select("client_key, source_label, material_key, split_rule")
        .eq("client_key", KMP_MATERIAL_IMPORT_CLIENT_KEY),
    ]);
    if (projectResult.error && !isMissingImportTableError(projectResult.error)) {
      console.warn("[kmp-import] gagal membaca alias proyek.", projectResult.error.message);
    }
    if (materialResult.error && !isMissingImportTableError(materialResult.error)) {
      console.warn("[kmp-import] gagal membaca rule material.", materialResult.error.message);
    }
    for (const value of projectResult.data ?? []) {
      projectAliases.push({
        clientKey: String(value.client_key ?? ""),
        excelProjectName: String(value.excel_project_name ?? ""),
        excelDistrict: String(value.excel_district ?? ""),
        projectId: String(value.project_id ?? ""),
      });
    }
    for (const value of materialResult.data ?? []) {
      materialAliases.push({
        clientKey: String(value.client_key ?? ""),
        sourceLabel: String(value.source_label ?? ""),
        materialKey: String(value.material_key ?? ""),
        split: parseSplit(value.split_rule),
      });
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return { projectAliases, materialAliases };
    }
    const [projectSnapshot, materialSnapshot] = await Promise.all([
      firestore
        .collection(IMPORT_ALIAS_TABLE)
        .where("client_key", "==", KMP_MATERIAL_IMPORT_CLIENT_KEY)
        .get(),
      firestore
        .collection(IMPORT_RULE_TABLE)
        .where("client_key", "==", KMP_MATERIAL_IMPORT_CLIENT_KEY)
        .get(),
    ]);
    for (const doc of projectSnapshot.docs) {
      const value = doc.data();
      projectAliases.push({
        clientKey: String(value.client_key ?? ""),
        excelProjectName: String(value.excel_project_name ?? ""),
        excelDistrict: String(value.excel_district ?? ""),
        projectId: String(value.project_id ?? ""),
      });
    }
    for (const doc of materialSnapshot.docs) {
      const value = doc.data();
      materialAliases.push({
        clientKey: String(value.client_key ?? ""),
        sourceLabel: String(value.source_label ?? ""),
        materialKey: String(value.material_key ?? ""),
        split: parseSplit(value.split_rule),
      });
    }
  }
  return { projectAliases, materialAliases };
}

async function buildPreview(input: Awaited<ReturnType<typeof readImportFile>>) {
  const [context, remembered] = await Promise.all([
    getKmpMaterialImportDatabaseContext(),
    loadRememberedMappings(),
  ]);
  return analyzeKmpMaterialWorkbook({
    workbook: input.workbook,
    fileName: input.file.name,
    fileSize: input.file.size,
    fileHash: input.fileHash,
    context: { ...context, ...remembered },
    createCanonicalExpenseId: canonicalExpenseId,
  });
}

export async function analyzeKmpMaterialExcelAction(
  formData: FormData,
): Promise<AnalyzeKmpMaterialExcelActionResult> {
  await requireEditorActionUser();
  try {
    const file = await readImportFile(formData);
    const preview = await buildPreview(file);
    if (preview.summary.projectSheetCount === 0) {
      return {
        success: false,
        error:
          "Tidak ditemukan sheet proyek dengan header KECAMATAN, KELURAHAN, dan REAL COST.",
      };
    }
    return { success: true, preview };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Analisis file gagal.",
    };
  }
}

function issue(input: {
  projectId?: string | null;
  projectName?: string;
  termId?: string | null;
  reason: string;
  amount?: number;
}): KmpMaterialImportCommitIssue {
  return {
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? "-",
    termId: input.termId ?? null,
    reason: input.reason,
    amount: input.amount ?? 0,
  };
}

async function persistNewMasters(masters: KmpMaterialImportNewMaster[]) {
  const failedKeys = new Set<string>();
  if (masters.length === 0) {
    return failedKeys;
  }
  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase || !isSupabaseWriteConfigured) {
      masters.forEach((master) => failedKeys.add(master.materialKey));
      return failedKeys;
    }
    const { error } = await supabase.from("kmp_client_materials").upsert(
      masters.map((master) => ({
        client_key: KMP_MATERIAL_IMPORT_CLIENT_KEY,
        client_name: KMP_MATERIAL_IMPORT_CLIENT_NAME,
        material_key: master.materialKey,
        material_name: master.materialName,
        submission_name: master.submissionName,
        standard_amount: master.standardAmount,
        nominal_minimal: master.minimumAmount,
        minimum_amount: master.minimumAmount,
        checklist_type: master.checklistType,
        checklist_status: master.checklistStatus,
        updated_at: createTimestamp(),
      })),
      { onConflict: "client_key,material_key" },
    );
    if (error) {
      console.warn("[kmp-import] gagal membuat master material.", error.message);
      masters.forEach((master) => failedKeys.add(master.materialKey));
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      masters.forEach((master) => failedKeys.add(master.materialKey));
      return failedKeys;
    }
    try {
      await runFirebaseWriteSafely(async () => {
        const batch = firestore.batch();
        for (const master of masters) {
          const id = `${KMP_MATERIAL_IMPORT_CLIENT_KEY}:${master.materialKey}`;
          batch.set(
            firestore.collection("kmp_client_materials").doc(id),
            {
              id,
              client_key: KMP_MATERIAL_IMPORT_CLIENT_KEY,
              client_name: KMP_MATERIAL_IMPORT_CLIENT_NAME,
              material_key: master.materialKey,
              material_name: master.materialName,
              submission_name: master.submissionName,
              standard_amount: master.standardAmount,
              nominal_minimal: master.minimumAmount,
              minimum_amount: master.minimumAmount,
              checklist_type: master.checklistType,
              checklist_status: master.checklistStatus,
              created_at: createTimestamp(),
              updated_at: createTimestamp(),
            },
            { merge: true },
          );
        }
        await batch.commit();
      });
    } catch {
      masters.forEach((master) => failedKeys.add(master.materialKey));
    }
  } else {
    masters.forEach((master) => failedKeys.add(master.materialKey));
  }
  return failedKeys;
}

async function saveRememberedMappings(input: {
  projectAliases: KmpMaterialImportProjectAlias[];
  materialAliases: KmpMaterialImportMaterialAlias[];
}) {
  if (input.projectAliases.length === 0 && input.materialAliases.length === 0) {
    return;
  }
  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase || !isSupabaseWriteConfigured) {
      return;
    }
    const results = await Promise.all([
      input.projectAliases.length
        ? supabase.from(IMPORT_ALIAS_TABLE).upsert(
            input.projectAliases.map((alias) => ({
              id: createDeterministicUuid(
                `kmp-project-alias|${normalizeImportText(alias.excelProjectName)}|${normalizeImportText(alias.excelDistrict)}`,
              ),
              client_key: KMP_MATERIAL_IMPORT_CLIENT_KEY,
              excel_project_name: alias.excelProjectName,
              excel_district: alias.excelDistrict,
              project_id: alias.projectId,
              updated_at: createTimestamp(),
            })),
            { onConflict: "id" },
          )
        : Promise.resolve({ error: null }),
      input.materialAliases.length
        ? supabase.from(IMPORT_RULE_TABLE).upsert(
            input.materialAliases.map((alias) => ({
              id: createDeterministicUuid(
                `kmp-material-alias|${normalizeImportText(alias.sourceLabel)}`,
              ),
              client_key: KMP_MATERIAL_IMPORT_CLIENT_KEY,
              source_label: alias.sourceLabel,
              material_key: alias.materialKey,
              split_rule: alias.split,
              updated_at: createTimestamp(),
            })),
            { onConflict: "id" },
          )
        : Promise.resolve({ error: null }),
    ]);
    for (const result of results) {
      if (result.error && !isMissingImportTableError(result.error)) {
        console.warn("[kmp-import] gagal menyimpan mapping.", result.error);
      }
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return;
    }
    await runFirebaseWriteSafely(async () => {
      const batch = firestore.batch();
      for (const alias of input.projectAliases) {
        const id = createDeterministicUuid(
          `kmp-project-alias|${normalizeImportText(alias.excelProjectName)}|${normalizeImportText(alias.excelDistrict)}`,
        );
        batch.set(
          firestore.collection(IMPORT_ALIAS_TABLE).doc(id),
          {
            id,
            client_key: KMP_MATERIAL_IMPORT_CLIENT_KEY,
            excel_project_name: alias.excelProjectName,
            excel_district: alias.excelDistrict,
            project_id: alias.projectId,
            updated_at: createTimestamp(),
          },
          { merge: true },
        );
      }
      for (const alias of input.materialAliases) {
        const id = createDeterministicUuid(
          `kmp-material-alias|${normalizeImportText(alias.sourceLabel)}`,
        );
        batch.set(
          firestore.collection(IMPORT_RULE_TABLE).doc(id),
          {
            id,
            client_key: KMP_MATERIAL_IMPORT_CLIENT_KEY,
            source_label: alias.sourceLabel,
            material_key: alias.materialKey,
            split_rule: alias.split,
            updated_at: createTimestamp(),
          },
          { merge: true },
        );
      }
      await batch.commit();
    });
  }
}

function aggregateCommitLines(lines: CommitLine[], input: {
  fileName: string;
  fileHash: string;
  expenseDate: string;
  latestExpenses: Awaited<ReturnType<typeof getKmpMaterialImportDatabaseContext>>["expenses"];
}) {
  const grouped = new Map<string, CommitLine[]>();
  for (const line of lines) {
    const key = `${line.projectId}:${line.materialKey}`;
    const current = grouped.get(key) ?? [];
    current.push(line);
    grouped.set(key, current);
  }
  const rows: ExpenseMutationRow[] = [];
  for (const group of grouped.values()) {
    const first = group[0]!;
    const amount = group.reduce((sum, line) => sum + line.amount, 0);
    const canonicalId = canonicalExpenseId(first.projectId, first.materialKey);
    const duplicate = detectKmpMaterialDuplicate({
      projectId: first.projectId,
      materialKey: first.materialKey,
      materialName: first.materialName,
      amount,
      canonicalExpenseId: canonicalId,
      expenses: input.latestExpenses,
    });
    const requestedAction = group.some((line) => line.action === "update_existing")
      ? "update_existing"
      : group.every((line) => line.action === "skip_existing")
        ? "skip_existing"
        : "insert_new";
    const matchedIdentity = duplicate.existingExpenses.find(
      (expense) =>
        expense.matchKind === "canonical" ||
        expense.matchKind === "import_identity",
    );
    const id =
      requestedAction === "update_existing" && matchedIdentity
        ? matchedIdentity.id
        : canonicalId;
    const effectiveAction: ImportExpenseAction =
      (duplicate.status === "already_exists" || duplicate.status === "will_update") &&
      requestedAction !== "update_existing"
        ? "skip_existing"
        : requestedAction === "update_existing" && !matchedIdentity
          ? "skip_existing"
          : requestedAction;
    const sourceReferences = Array.from(
      new Set(group.map((line) => line.sourceReference)),
    ).join(", ");
    const formulaCells = Array.from(
      new Set(group.map((line) => line.formulaCell)),
    ).join(", ");
    const metadata = [
      "Import Excel Material KMP",
      `File: ${input.fileName}`,
      `Sheet: ${first.sourceSheet}`,
      `Formula: ${formulaCells}`,
      `Source: ${sourceReferences.slice(0, 280)}`,
      `Hash: ${input.fileHash}`,
      `KMP_IMPORT_KEY:${first.projectId}:${first.materialKey}`,
    ].join(" | ");
    rows.push({
      id,
      project_id: first.projectId,
      project_name: first.projectName,
      category: "material",
      specialist_type: null,
      requester_name: first.submissionName,
      description: first.materialName,
      recipient_name: null,
      quantity: 1,
      unit_label: null,
      usage_info: metadata,
      unit_price: 0,
      amount,
      expense_date: input.expenseDate,
      action: effectiveAction,
      source_project_id: first.sourceProjectId,
      term_ids: group.map((line) => line.termId),
      material_key: first.materialKey,
    });
  }
  return rows;
}

async function writeExpenseRows(rows: ExpenseMutationRow[]) {
  const inserted: ExpenseMutationRow[] = [];
  const updated: ExpenseMutationRow[] = [];
  const skipped: ExpenseMutationRow[] = [];
  const failed: Array<{ row: ExpenseMutationRow; reason: string }> = [];
  const writable = rows.filter((row) => {
    if (row.action === "skip_existing") {
      skipped.push(row);
      return false;
    }
    return true;
  });

  if (activeDataSource === "excel") {
    for (const row of writable) {
      try {
        if (row.action === "update_existing") {
          const result = updateExcelExpense({
            id: row.id,
            project_id: row.project_id,
            category: row.category,
            specialist_type: null,
            requester_name: row.requester_name,
            description: row.description,
            recipient_name: null,
            quantity: 1,
            unit_label: null,
            usage_info: row.usage_info,
            unit_price: 0,
            amount: row.amount,
            expense_date: row.expense_date,
          });
          if (!result) {
            throw new Error("Biaya existing tidak ditemukan saat update.");
          }
          updated.push(row);
        } else {
          insertExcelExpense({
            id: row.id,
            project_id: row.project_id,
            category: row.category,
            specialist_type: null,
            requester_name: row.requester_name,
            description: row.description,
            recipient_name: null,
            quantity: 1,
            unit_label: null,
            usage_info: row.usage_info,
            unit_price: 0,
            amount: row.amount,
            expense_date: row.expense_date,
          });
          inserted.push(row);
        }
      } catch (error) {
        failed.push({
          row,
          reason: error instanceof Error ? error.message : "Gagal menulis Excel database.",
        });
      }
    }
  } else if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase || !isSupabaseWriteConfigured) {
      const reason = getSupabaseMutationErrorMessage(
        "Supabase belum terkonfigurasi untuk import material.",
      );
      writable.forEach((row) => failed.push({ row, reason }));
      return { inserted, updated, skipped, failed };
    }
    for (let index = 0; index < writable.length; index += WRITE_CHUNK_SIZE) {
      const chunk = writable.slice(index, index + WRITE_CHUNK_SIZE);
      const { error } = await supabase.from("project_expenses").upsert(
        chunk.map((row) => ({
          id: row.id,
          project_id: row.project_id,
          category: row.category,
          specialist_type: row.specialist_type,
          requester_name: row.requester_name,
          description: row.description,
          recipient_name: row.recipient_name,
          quantity: row.quantity,
          unit_label: row.unit_label,
          usage_info: row.usage_info,
          unit_price: row.unit_price,
          amount: row.amount,
          expense_date: row.expense_date,
        })),
        { onConflict: "id" },
      );
      if (error) {
        chunk.forEach((row) => failed.push({ row, reason: error.message }));
      } else {
        chunk.forEach((row) =>
          row.action === "update_existing" ? updated.push(row) : inserted.push(row),
        );
      }
    }
  } else if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      writable.forEach((row) =>
        failed.push({ row, reason: "Firebase belum terkonfigurasi." }),
      );
      return { inserted, updated, skipped, failed };
    }
    for (let index = 0; index < writable.length; index += 400) {
      const chunk = writable.slice(index, index + 400);
      try {
        const batch = firestore.batch();
        for (const row of chunk) {
          batch.set(
            firestore.collection("project_expenses").doc(row.id),
            {
              id: row.id,
              project_id: row.project_id,
              category: row.category,
              specialist_type: row.specialist_type,
              requester_name: row.requester_name,
              description: row.description,
              recipient_name: row.recipient_name,
              quantity: row.quantity,
              unit_label: row.unit_label,
              usage_info: row.usage_info,
              unit_price: row.unit_price,
              amount: row.amount,
              expense_date: row.expense_date,
              created_at: createTimestamp(),
            },
            { merge: true },
          );
        }
        await batch.commit();
        chunk.forEach((row) =>
          row.action === "update_existing" ? updated.push(row) : inserted.push(row),
        );
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Gagal menulis Firebase.";
        chunk.forEach((row) => failed.push({ row, reason }));
      }
    }
  } else {
    writable.forEach((row) =>
      failed.push({ row, reason: "Mode demo tidak dapat menyimpan data." }),
    );
  }
  return { inserted, updated, skipped, failed };
}

function uniqueProjectNames(rows: ExpenseMutationRow[]) {
  return Array.from(new Set(rows.map((row) => row.project_name)));
}

export async function commitKmpMaterialExcelImportAction(
  formData: FormData,
): Promise<KmpMaterialImportCommitResult> {
  const actor = await requireEditorActionUser();
  const emptyResult: KmpMaterialImportCommitResult = {
    success: false,
    inserted_count: 0,
    updated_count: 0,
    skipped_count: 0,
    failed_count: 0,
    inserted_projects: [],
    updated_projects: [],
    skipped_projects: [],
    failed_projects: [],
    total_nominal_success: 0,
    total_nominal_failed: 0,
    created_master_count: 0,
    message: "",
  };

  let fileInput: Awaited<ReturnType<typeof readImportFile>>;
  try {
    fileInput = await readImportFile(formData);
  } catch (error) {
    return {
      ...emptyResult,
      failed_count: 1,
      message: error instanceof Error ? error.message : "File tidak valid.",
      failed_projects: [
        issue({ reason: error instanceof Error ? error.message : "File tidak valid." }),
      ],
    };
  }
  const request = parseCommitRequest(getText(formData.get("request_json")));
  if (!request) {
    return {
      ...emptyResult,
      failed_count: 1,
      message: "Payload konfirmasi import tidak valid.",
      failed_projects: [issue({ reason: "Payload konfirmasi import tidak valid." })],
    };
  }
  if (request.fileHash !== fileInput.fileHash) {
    return {
      ...emptyResult,
      failed_count: 1,
      message: "Hash file berubah sejak analisis. Analisis ulang file sebelum menyimpan.",
      failed_projects: [
        issue({ reason: "Hash file berbeda antara tahap analisis dan commit." }),
      ],
    };
  }

  const preview = await buildPreview(fileInput);
  const latestContext = await getKmpMaterialImportDatabaseContext();
  const termById = new Map(
    preview.projects.flatMap((project) =>
      project.terms.map((term) => [term.id, { project, term }] as const),
    ),
  );
  const projectById = new Map(latestContext.projects.map((project) => [project.id, project]));
  const existingMasterByKey = new Map(
    preview.materials.map((master) => [master.materialKey, master] as const),
  );
  const newMasterByKey = new Map(
    request.newMasters.map((master) => [master.materialKey, master] as const),
  );
  const decisionByTermId = new Map(
    request.decisions.map((decision) => [decision.termId, decision] as const),
  );
  const confirmedWarnings = new Set(request.confirmedWarningProjectIds);
  const failedIssues: KmpMaterialImportCommitIssue[] = [];
  const lines: CommitLine[] = [];
  const selectedSourceProjectIds = new Set<string>();

  for (const decision of request.decisions) {
    const source = termById.get(decision.termId);
    if (!source) {
      failedIssues.push(
        issue({ termId: decision.termId, reason: "Term tidak ditemukan pada file yang diverifikasi ulang." }),
      );
      continue;
    }
    if (decision.ignored) {
      if (!decision.ignoreReason) {
        failedIssues.push(
          issue({
            termId: decision.termId,
            projectName: source.project.excelProjectName,
            reason: "Komponen yang diabaikan wajib mempunyai alasan.",
            amount: source.term.amount,
          }),
        );
      }
      continue;
    }
    if (!decision.approved) {
      continue;
    }
    selectedSourceProjectIds.add(source.project.id);
    const targetProject = decision.projectId
      ? projectById.get(decision.projectId)
      : null;
    if (!targetProject || !isKmpCianjurClient(targetProject.clientName)) {
      failedIssues.push(
        issue({
          projectId: decision.projectId,
          projectName: source.project.excelProjectName,
          termId: decision.termId,
          reason: "Project tidak tersedia atau bukan client KMP Cianjur.",
          amount: source.term.amount,
        }),
      );
      continue;
    }
    const targetDatabaseMaterialTotal = latestContext.expenses
      .filter(
        (expense) =>
          expense.projectId === targetProject.id &&
          normalizeImportText(expense.category).includes("material"),
      )
      .reduce((sum, expense) => sum + expense.amount, 0);
    const targetBaselineMismatch =
      source.project.baselineAmount !== null &&
      targetDatabaseMaterialTotal !== source.project.baselineAmount;
    if (
      (source.project.status === "formula_mismatch" ||
        source.project.status === "baseline_mismatch" ||
        source.project.status === "needs_review_partial_material" ||
        source.project.warnings.some((warning) => warning.includes("(KURANG)")) ||
        targetBaselineMismatch) &&
      !confirmedWarnings.has(source.project.id)
    ) {
      failedIssues.push(
        issue({
          projectId: targetProject.id,
          projectName: targetProject.name,
          termId: decision.termId,
          reason: "Warning proyek belum dikonfirmasi.",
          amount: source.term.amount,
        }),
      );
      continue;
    }

    if (decision.split) {
      const splitError = validateMaterialSplit(source.term.amount, decision.split);
      if (splitError) {
        failedIssues.push(
          issue({
            projectId: targetProject.id,
            projectName: targetProject.name,
            termId: decision.termId,
            reason: splitError,
            amount: source.term.amount,
          }),
        );
        continue;
      }
      let splitValid = true;
      for (const part of decision.split) {
        const master =
          existingMasterByKey.get(part.materialKey) ??
          newMasterByKey.get(part.materialKey);
        if (!master) {
          splitValid = false;
          failedIssues.push(
            issue({
              projectId: targetProject.id,
              projectName: targetProject.name,
              termId: decision.termId,
              reason: `Master material split ${part.materialKey} tidak tersedia.`,
              amount: part.amount,
            }),
          );
          continue;
        }
        lines.push({
          sourceProjectId: source.project.id,
          sourceSheet: source.term.sourceSheet,
          formulaCell: source.term.formulaCell,
          sourceReference:
            source.term.sourceReference ?? `literal:${source.term.termIndex}`,
          termId: decision.termId,
          projectId: targetProject.id,
          projectName: targetProject.name,
          materialKey: part.materialKey,
          materialName: master.materialName,
          submissionName:
            decision.submissionName ||
            master.submissionName ||
            `Pengajuan ${master.materialName}`,
          amount: part.amount,
          action: decision.action,
        });
      }
      if (!splitValid) {
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          if (lines[index]?.termId === decision.termId) {
            lines.splice(index, 1);
          }
        }
      }
      continue;
    }

    const materialKey = decision.materialKey ?? "";
    const master =
      existingMasterByKey.get(materialKey) ?? newMasterByKey.get(materialKey);
    if (!master || !materialKey) {
      failedIssues.push(
        issue({
          projectId: targetProject.id,
          projectName: targetProject.name,
          termId: decision.termId,
          reason: "Master material belum dipilih atau tidak tersedia.",
          amount: source.term.amount,
        }),
      );
      continue;
    }
    lines.push({
      sourceProjectId: source.project.id,
      sourceSheet: source.term.sourceSheet,
      formulaCell: source.term.formulaCell,
      sourceReference:
        source.term.sourceReference ?? `literal:${source.term.termIndex}`,
      termId: decision.termId,
      projectId: targetProject.id,
      projectName: targetProject.name,
      materialKey,
      materialName: master.materialName,
      submissionName:
        decision.submissionName ||
        master.submissionName ||
        `Pengajuan ${master.materialName}`,
      amount: source.term.amount,
      action: decision.action,
    });
  }

  const blockedSourceProjects = new Set<string>();
  for (const sourceProjectId of selectedSourceProjectIds) {
    const project = preview.projects.find((item) => item.id === sourceProjectId);
    if (!project) {
      continue;
    }
    for (const term of project.terms) {
      if (
        term.status !== "needs_material_name" &&
        term.status !== "needs_material_mapping" &&
        term.status !== "needs_split_review" &&
        term.status !== "needs_project_match" &&
        term.status !== "ambiguous_project" &&
        term.status !== "unmatched_project"
      ) {
        continue;
      }
      const decision = decisionByTermId.get(term.id);
      const resolved =
        Boolean(decision?.approved && decision.projectId && (decision.materialKey || decision.split?.length)) ||
        Boolean(decision?.ignored && decision.ignoreReason);
      if (!resolved) {
        blockedSourceProjects.add(sourceProjectId);
        failedIssues.push(
          issue({
            projectId: decision?.projectId ?? project.projectId,
            projectName: project.excelProjectName,
            termId: term.id,
            reason:
              "Proyek masih mempunyai komponen tanpa mapping. Beri nama material atau abaikan dengan alasan.",
            amount: term.amount,
          }),
        );
      }
    }
  }
  const filteredLines = lines.filter(
    (line) => !blockedSourceProjects.has(line.sourceProjectId),
  );

  const usedNewMasterKeys = new Set(
    filteredLines
      .map((line) => line.materialKey)
      .filter((key) => newMasterByKey.has(key)),
  );
  const usedNewMasters = request.newMasters.filter((master) =>
    usedNewMasterKeys.has(master.materialKey),
  );
  const failedNewMasterKeys = await persistNewMasters(usedNewMasters);
  const linesWithAvailableMasters = filteredLines.filter((line) => {
    if (!failedNewMasterKeys.has(line.materialKey)) {
      return true;
    }
    failedIssues.push(
      issue({
        projectId: line.projectId,
        projectName: line.projectName,
        termId: line.termId,
        reason: `Master material baru ${line.materialName} gagal dibuat.`,
        amount: line.amount,
      }),
    );
    return false;
  });

  const rows = aggregateCommitLines(linesWithAvailableMasters, {
    fileName: fileInput.file.name,
    fileHash: fileInput.fileHash,
    expenseDate: request.expenseDate,
    latestExpenses: latestContext.expenses,
  });
  const writeResult = await writeExpenseRows(rows);
  for (const failure of writeResult.failed) {
    failedIssues.push(
      issue({
        projectId: failure.row.project_id,
        projectName: failure.row.project_name,
        termId: failure.row.term_ids[0] ?? null,
        reason: failure.reason,
        amount: failure.row.amount,
      }),
    );
  }

  const projectAliases: KmpMaterialImportProjectAlias[] = [];
  const materialAliases: KmpMaterialImportMaterialAlias[] = [];
  for (const decision of request.decisions) {
    const source = termById.get(decision.termId);
    if (!source) {
      continue;
    }
    if (decision.rememberProjectMapping && decision.projectId) {
      projectAliases.push({
        clientKey: KMP_MATERIAL_IMPORT_CLIENT_KEY,
        excelProjectName: source.project.excelProjectName,
        excelDistrict: source.project.district,
        projectId: decision.projectId,
      });
    }
    if (decision.rememberMaterialMapping && source.term.sourceLabel) {
      materialAliases.push({
        clientKey: KMP_MATERIAL_IMPORT_CLIENT_KEY,
        sourceLabel: source.term.sourceLabel,
        materialKey: decision.materialKey ?? "",
        split: decision.split,
      });
    }
  }
  for (const master of usedNewMasters) {
    for (const alias of master.aliases) {
      materialAliases.push({
        clientKey: KMP_MATERIAL_IMPORT_CLIENT_KEY,
        sourceLabel: alias,
        materialKey: master.materialKey,
        split: null,
      });
    }
  }
  await saveRememberedMappings({
    projectAliases: Array.from(
      new Map(
        projectAliases.map((alias) => [
          `${normalizeImportText(alias.excelProjectName)}:${normalizeImportText(alias.excelDistrict)}`,
          alias,
        ]),
      ).values(),
    ),
    materialAliases: Array.from(
      new Map(
        materialAliases.map((alias) => [
          normalizeImportText(alias.sourceLabel),
          alias,
        ]),
      ).values(),
    ),
  });

  if (writeResult.inserted.length > 0 || writeResult.updated.length > 0) {
    await completeKmpCianjurProjectsWithFullMaterialProgress();
    revalidateProjectPages();
    revalidateProjectCache();
    revalidateExpenseCache();
    revalidatePath("/logs");
  }
  const successfulRows = [...writeResult.inserted, ...writeResult.updated];
  const skippedIssues = writeResult.skipped.map((row) =>
    issue({
      projectId: row.project_id,
      projectName: row.project_name,
      termId: row.term_ids[0] ?? null,
      reason: "Material existing dipilih untuk dilewati.",
      amount: row.amount,
    }),
  );
  const success =
    failedIssues.length === 0 &&
    (successfulRows.length > 0 || skippedIssues.length > 0);
  const message = failedIssues.length > 0
    ? `${successfulRows.length} material berhasil diproses, ${failedIssues.length} gagal.`
    : `${writeResult.inserted.length} insert, ${writeResult.updated.length} update, dan ${writeResult.skipped.length} skip selesai diproses.`;

  queueActivityLog({
    actor,
    actionType: failedIssues.length > 0 ? "partial_import" : "import",
    module: "expense",
    entityId: fileInput.fileHash,
    entityName: fileInput.file.name,
    description: message,
    payload: {
      expense_mode: "kmp_material_excel_import",
      source_file_hash: fileInput.fileHash,
      source_file_name: fileInput.file.name,
      inserted_count: writeResult.inserted.length,
      updated_count: writeResult.updated.length,
      skipped_count: writeResult.skipped.length,
      failed_count: failedIssues.length,
      created_master_count: usedNewMasters.length - failedNewMasterKeys.size,
      expense_ids: successfulRows.map((row) => row.id),
      project_ids: Array.from(new Set(successfulRows.map((row) => row.project_id))),
      total_amount: successfulRows.reduce((sum, row) => sum + row.amount, 0),
      failed_reasons: failedIssues.slice(0, 100),
      source_formulas: preview.projects
        .filter((project) =>
          successfulRows.some((row) => row.source_project_id === project.id),
        )
        .map((project) => ({
          sheet: project.sourceSheet,
          cell: project.realCostCell,
          formula: project.formula,
        })),
    },
  });

  return {
    success,
    inserted_count: writeResult.inserted.length,
    updated_count: writeResult.updated.length,
    skipped_count: writeResult.skipped.length,
    failed_count: failedIssues.length,
    inserted_projects: uniqueProjectNames(writeResult.inserted),
    updated_projects: uniqueProjectNames(writeResult.updated),
    skipped_projects: skippedIssues,
    failed_projects: failedIssues,
    total_nominal_success: successfulRows.reduce((sum, row) => sum + row.amount, 0),
    total_nominal_failed: failedIssues.reduce((sum, item) => sum + item.amount, 0),
    created_master_count: usedNewMasters.length - failedNewMasterKeys.size,
    message,
  };
}
