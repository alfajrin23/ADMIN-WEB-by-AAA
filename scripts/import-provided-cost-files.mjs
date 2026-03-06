import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const FILE_CONFIGS = [
  {
    filePath: "C:/Users/victu/Downloads/RINCIAN COST BALI SANCTUARY.xlsx",
    projectName: "SANCTUARY BALI",
    clientName: "Bali",
    code: "SANCTUARY-BALI",
  },
  {
    filePath: "C:/Users/victu/Downloads/COST SSC.xlsx",
    projectName: "SSC",
    clientName: "Purworejo",
    code: "SSC",
  },
  {
    filePath: "C:/Users/victu/Downloads/COST KOST SBY1.xlsx",
    projectName: "KOST SBY1",
    clientName: "Surabaya",
    code: "KOST-SBY1",
  },
  {
    filePath: "C:/Users/victu/Downloads/RINCIAN MELATI MAS 2.xlsx",
    projectName: "MELATI MAS",
    clientName: "Melati Mas",
    code: "MELATI-MAS",
  },
  {
    filePath: "C:/Users/victu/Downloads/COST RS PURWOREJO.xlsx",
    projectName: "RS PURWOREJO",
    clientName: "Purworejo",
    code: "RS-PURWOREJO",
  },
  {
    filePath: "C:/Users/victu/Downloads/RINCIAN COST OOMJU 2.xlsx",
    projectName: "OOMJU",
    clientName: "OOMJU",
    code: "OOMJU",
  },
  {
    filePath: "C:/Users/victu/Downloads/COST CEMPAKA ALARA.xlsx",
    projectName: "CEMPAKA ALARA",
    clientName: "Cempaka Alara",
    code: "CEMPAKA-ALARA",
  },
  {
    filePath: "C:/Users/victu/Downloads/COST DAAN MOGOT1.xlsx",
    projectName: "DAAN MOGOT",
    clientName: "Daan Mogot",
    code: "DAAN-MOGOT",
  },
];

const DEFAULT_STATUS = "aktif";
const DRY_RUN = process.argv.includes("--dry-run");
const CHUNK_SIZE = 300;

function loadEnvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toCategorySlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function chunkArray(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("id-ID").format(Math.round(value));
}

function toIsoDateIfValid(yearText, monthText, dayText) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTemplateDate(value, options = {}) {
  const todayDate = new Date().toISOString().slice(0, 10);
  const defaultYear =
    Number.isInteger(options.defaultYear) && options.defaultYear >= 1900
      ? options.defaultYear
      : new Date().getFullYear();
  const previousDate =
    typeof options.previousDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(options.previousDate)
      ? options.previousDate
      : null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return todayDate;
    }

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const resolved = toIsoDateIfValid(isoMatch[1], isoMatch[2], isoMatch[3]);
      if (resolved) {
        return resolved;
      }
    }

    const monthMap = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      mei: "05",
      may: "05",
      jun: "06",
      jul: "07",
      agu: "08",
      ags: "08",
      aug: "08",
      sep: "09",
      okt: "10",
      oct: "10",
      nov: "11",
      des: "12",
      dec: "12",
    };

    const localizedMatch = trimmed.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[-/. ](\d{2,4})?$/);
    if (localizedMatch) {
      const day = String(Number(localizedMatch[1])).padStart(2, "0");
      const month = monthMap[localizedMatch[2].toLowerCase()];
      const currentMonth = Number(month);
      const previousMonth = previousDate ? Number(previousDate.slice(5, 7)) : null;
      const previousYear = previousDate ? Number(previousDate.slice(0, 4)) : defaultYear;
      let inferredYear = previousYear;
      if (
        !localizedMatch[3] &&
        previousMonth !== null &&
        previousMonth === 12 &&
        currentMonth === 1
      ) {
        inferredYear += 1;
      }
      const yearRaw = localizedMatch[3] ?? String(inferredYear || defaultYear);
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      if (month) {
        const resolved = toIsoDateIfValid(year, month, day);
        if (resolved) {
          return resolved;
        }
      }
    }

    const localDateMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (localDateMatch) {
      const day = String(Number(localDateMatch[1])).padStart(2, "0");
      const month = String(Number(localDateMatch[2])).padStart(2, "0");
      const yearRaw = localDateMatch[3];
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      const resolved = toIsoDateIfValid(year, month, day);
      if (resolved) {
        return resolved;
      }
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return todayDate;
}

function parseTemplateNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  let normalized = trimmed
    .replace(/rp/gi, "")
    .replace(/[^\d,.\-]/g, "")
    .replace(/(?!^)-/g, "");
  if (!normalized) {
    return 0;
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const fractionDigits = normalized.length - lastComma - 1;
    normalized =
      fractionDigits > 0 && fractionDigits <= 2
        ? normalized.replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const fractionDigits = normalized.length - lastDot - 1;
    const dotCount = normalized.split(".").length - 1;
    if (dotCount > 1 || fractionDigits === 3) {
      normalized = normalized.replace(/\./g, "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTemplateCost(value) {
  const parsed = parseTemplateNumeric(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toStringOrNull(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isTransactionSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, range: 0 });
  const secondRow = rows[1] ?? [];
  return secondRow.join(" ").toUpperCase().includes("NAMA PENGAJUAN");
}

function getCellAddress(col, row) {
  return XLSX.utils.encode_cell({ c: col, r: row - 1 });
}

function getCellText(sheet, col, row) {
  const cell = sheet[getCellAddress(col, row)];
  if (!cell || cell.v == null) {
    return "";
  }
  return String(cell.v).trim();
}

function resolveCategoryMeta(headerText) {
  const upper = headerText.toUpperCase();
  if (upper.includes("TOTAL COST") || upper.includes("PENGELUARAN PER")) {
    return null;
  }
  if (upper.includes("COST MATERIAL")) {
    return { slug: "material", label: "Material" };
  }
  if (upper.includes("ALAT") || upper.includes("COST ALAT")) {
    return { slug: "alat", label: "Alat" };
  }
  if (upper.includes("UPAH") || upper.includes("KASBON")) {
    return { slug: "upah_kasbon_tukang", label: "Upah / Kasbon Tukang" };
  }
  if (upper.includes("COST OPS") || upper.includes("OPERASIONAL")) {
    return { slug: "operasional", label: "Operasional" };
  }
  if (upper.includes("FEE")) {
    return { slug: "fee", label: "Fee" };
  }
  if (upper.includes("LISTRIK")) {
    return { slug: "listrik", label: "Listrik" };
  }
  if (upper.includes("SUBCONT")) {
    return { slug: "subcont", label: "Subcont" };
  }
  if (upper.includes("PERAWATAN")) {
    return { slug: "biaya_perawatan", label: "Biaya Perawatan" };
  }
  if (upper.includes("LAIN-LAIN")) {
    return { slug: "lain_lain", label: "Lain-Lain" };
  }
  return null;
}

function getCategoryColumns(sheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:Z12");
  const columns = [];
  for (let col = 8; col <= range.e.c; col += 1) {
    const headerTop = getCellText(sheet, col, 2);
    const headerBottom = getCellText(sheet, col, 3);
    const categoryMeta = resolveCategoryMeta(`${headerTop} ${headerBottom}`.trim());
    if (!categoryMeta) {
      continue;
    }
    columns.push({ column: col, ...categoryMeta });
  }
  return columns;
}

function isSubtotalRow(row, description) {
  const marker = `${String(row[0] ?? "")} ${description ?? ""}`.toUpperCase();
  return marker.includes("TOTAL PENGELUARAN");
}

function buildExpenseSignature(input) {
  return [
    input.projectId.trim(),
    toCategorySlug(input.category),
    String(input.expenseDate ?? "").slice(0, 10),
    normalizeText(input.requesterName),
    normalizeText(input.description),
    normalizeText(input.unitLabel),
    normalizeText(input.usageInfo),
    Number(input.quantity ?? 0).toFixed(2),
    Number(input.unitPrice ?? 0).toFixed(2),
    Number(input.amount ?? 0).toFixed(2),
  ].join("|");
}

function parseWorkbookExpenses(config) {
  const workbook = XLSX.readFile(config.filePath, { cellStyles: true });
  const parsedExpenses = [];
  const categoryLabels = new Map();
  const sourceSheets = [];
  const todayDate = new Date().toISOString().slice(0, 10);
  const workbookBaseYear = detectWorkbookBaseYear(workbook);

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !isTransactionSheet(sheet)) {
      continue;
    }

    sourceSheets.push(sheetName);
    const categoryColumns = getCategoryColumns(sheet);
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    let lastRequesterName = null;
    let lastExpenseDate = null;

    for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const rawRequesterName = toStringOrNull(row[1]);
      const rawExpenseDate = parseTemplateDateOrNullWithContext(row[2], {
        defaultYear: workbookBaseYear,
        previousDate: lastExpenseDate,
      });
      const description = toStringOrNull(row[3]);
      const qty = parseTemplateNumeric(row[4]);
      const unitLabel = toStringOrNull(row[5]);
      const usageInfo = toStringOrNull(row[6]);
      const unitPrice = parseTemplateNumeric(row[7]);
      const transactionNumber = parseTemplateNumeric(row[0]);
      const hasTransactionNumber = transactionNumber > 0;
      const hasRowDetails = Boolean(
        hasTransactionNumber ||
          rawRequesterName ||
          rawExpenseDate ||
          description ||
          usageInfo ||
          qty > 0 ||
          unitLabel ||
          unitPrice > 0,
      );
      if (isSubtotalRow(row, description)) {
        continue;
      }

      const requesterName = rawRequesterName ?? (!hasTransactionNumber ? lastRequesterName : null);
      const expenseDate = rawExpenseDate ?? lastExpenseDate ?? todayDate;
      const hasPrimaryData = Boolean(
        hasTransactionNumber || description || usageInfo || rawRequesterName || rawExpenseDate,
      );

      if (rawRequesterName && hasPrimaryData) {
        lastRequesterName = rawRequesterName;
      }
      if (rawExpenseDate && hasPrimaryData) {
        lastExpenseDate = rawExpenseDate;
      }

      for (const categoryColumn of categoryColumns) {
        const amount = parseTemplateCost(row[categoryColumn.column]);
        if (amount <= 0) {
          continue;
        }
        if (!hasRowDetails) {
          continue;
        }
        categoryLabels.set(categoryColumn.slug, categoryColumn.label);
        parsedExpenses.push({
          category: categoryColumn.slug,
          specialist_type: null,
          requester_name: requesterName,
          description,
          recipient_name: null,
          quantity: qty,
          unit_label: unitLabel,
          usage_info: usageInfo,
          unit_price: unitPrice,
          amount,
          expense_date: expenseDate,
        });
      }
    }
  }

  return {
    project: {
      name: config.projectName,
      code: config.code,
      client_name: config.clientName,
      status: DEFAULT_STATUS,
      start_date: null,
    },
    expenses: parsedExpenses,
    categoryLabels,
    sourceSheets,
  };
}

function parseTemplateDateOrNullWithContext(value, options = {}) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }
  return parseTemplateDate(value, options);
}

function detectWorkbookBaseYear(workbook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, range: 0 });
    for (const row of rows.slice(0, 20)) {
      for (const cell of row) {
        const text = String(cell ?? "");
        const yearMatch = text.match(/\b(20\d{2})\b/);
        if (yearMatch) {
          return Number(yearMatch[1]);
        }
      }
    }
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !isTransactionSheet(sheet)) {
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
      const rawDate = rows[rowIndex]?.[2];
      if (typeof rawDate === "number" && Number.isFinite(rawDate)) {
        const parsed = XLSX.SSF.parse_date_code(rawDate);
        if (parsed?.y) {
          return parsed.y;
        }
      }
    }
  }

  return new Date().getFullYear();
}

async function upsertCategories(supabase, categoryLabelMap) {
  const rows = Array.from(categoryLabelMap.entries()).map(([slug, label]) => ({
    slug,
    label,
  }));
  if (rows.length === 0) {
    return;
  }
  const { error } = await supabase.from("expense_categories").upsert(rows, {
    onConflict: "slug",
  });
  if (error) {
    throw error;
  }
}

async function fetchExistingProjects(supabase) {
  const { data, error } = await supabase.from("projects").select("id, name, code, client_name");
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function ensureProjects(supabase, parsedFiles) {
  const existingProjects = await fetchExistingProjects(supabase);
  const byName = new Map(existingProjects.map((row) => [normalizeText(row.name), row]));
  const projectIdByName = new Map();
  const createdProjects = [];
  const updatedProjects = [];

  for (const parsed of parsedFiles) {
    const normalizedName = normalizeText(parsed.project.name);
    const existing = byName.get(normalizedName);
    if (!existing) {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: parsed.project.name,
          code: parsed.project.code,
          client_name: parsed.project.client_name,
          start_date: parsed.project.start_date,
          status: parsed.project.status,
        })
        .select("id, name, code, client_name")
        .single();
      if (error) {
        throw error;
      }
      byName.set(normalizedName, data);
      projectIdByName.set(normalizedName, data.id);
      createdProjects.push({
        name: data.name,
        client_name: data.client_name,
      });
      continue;
    }

    projectIdByName.set(normalizedName, existing.id);
    const shouldUpdate =
      normalizeText(existing.client_name) !== normalizeText(parsed.project.client_name) ||
      normalizeText(existing.code) !== normalizeText(parsed.project.code);
    if (!shouldUpdate) {
      continue;
    }

    const { error } = await supabase
      .from("projects")
      .update({
        client_name: parsed.project.client_name,
        code: parsed.project.code,
      })
      .eq("id", existing.id);
    if (error) {
      throw error;
    }
    updatedProjects.push({
      name: existing.name,
      from_client_name: existing.client_name,
      to_client_name: parsed.project.client_name,
    });
  }

  return { projectIdByName, createdProjects, updatedProjects };
}

async function synchronizeProjectExpenses(supabase, parsedFiles, projectIdByName) {
  const syncStats = [];

  for (const parsed of parsedFiles) {
    const projectId = projectIdByName.get(normalizeText(parsed.project.name));
    if (!projectId) {
      continue;
    }

    const expectedCounts = new Map();
    const expectedRowsBySignature = new Map();
    for (const expense of parsed.expenses) {
      const signature = buildExpenseSignature({
        projectId,
        category: expense.category,
        requesterName: expense.requester_name,
        description: expense.description,
        quantity: expense.quantity,
        unitLabel: expense.unit_label,
        usageInfo: expense.usage_info,
        unitPrice: expense.unit_price,
        amount: expense.amount,
        expenseDate: expense.expense_date,
      });
      expectedCounts.set(signature, (expectedCounts.get(signature) ?? 0) + 1);
      const currentRows = expectedRowsBySignature.get(signature) ?? [];
      currentRows.push({
        project_id: projectId,
        category: expense.category,
        specialist_type: expense.specialist_type,
        requester_name: expense.requester_name,
        description: expense.description,
        recipient_name: expense.recipient_name,
        quantity: expense.quantity,
        unit_label: expense.unit_label,
        usage_info: expense.usage_info,
        unit_price: expense.unit_price,
        amount: expense.amount,
        expense_date: expense.expense_date,
      });
      expectedRowsBySignature.set(signature, currentRows);
    }

    const { data, error } = await supabase
      .from("project_expenses")
      .select(
        "id, project_id, category, requester_name, description, quantity, unit_label, usage_info, unit_price, amount, expense_date, created_at",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) {
      throw error;
    }

    const rowsBySignature = new Map();
    for (const row of data ?? []) {
      const signature = buildExpenseSignature({
        projectId: String(row.project_id ?? ""),
        category: String(row.category ?? ""),
        requesterName: row.requester_name,
        description: row.description,
        quantity: Number(row.quantity ?? 0),
        unitLabel: row.unit_label,
        usageInfo: row.usage_info,
        unitPrice: Number(row.unit_price ?? 0),
        amount: Number(row.amount ?? 0),
        expenseDate: String(row.expense_date ?? ""),
      });
      const current = rowsBySignature.get(signature) ?? [];
      current.push(row);
      rowsBySignature.set(signature, current);
    }

    const idsToDelete = [];
    const rowsToInsert = [];
    for (const [signature, rows] of rowsBySignature.entries()) {
      const expectedCount = expectedCounts.get(signature) ?? 0;
      if (rows.length > expectedCount) {
        idsToDelete.push(...rows.slice(expectedCount).map((row) => row.id));
      }
    }
    for (const [signature, expectedRows] of expectedRowsBySignature.entries()) {
      const currentRows = rowsBySignature.get(signature) ?? [];
      if (currentRows.length >= expectedRows.length) {
        continue;
      }
      rowsToInsert.push(...expectedRows.slice(currentRows.length));
    }

    for (const chunk of chunkArray(idsToDelete, CHUNK_SIZE)) {
      const { error: deleteError } = await supabase.from("project_expenses").delete().in("id", chunk);
      if (deleteError) {
        throw deleteError;
      }
    }
    for (const chunk of chunkArray(rowsToInsert, CHUNK_SIZE)) {
      const { error: insertError } = await supabase.from("project_expenses").insert(chunk);
      if (insertError) {
        throw insertError;
      }
    }

    syncStats.push({
      projectName: parsed.project.name,
      inserted: rowsToInsert.length,
      deleted: idsToDelete.length,
    });
  }

  return syncStats;
}

function summarizeParsedFile(parsed) {
  const totalAmount = parsed.expenses.reduce((sum, item) => sum + item.amount, 0);
  const countsByCategory = new Map();
  for (const item of parsed.expenses) {
    countsByCategory.set(item.category, (countsByCategory.get(item.category) ?? 0) + 1);
  }

  console.log(`- ${path.basename(parsed.filePath)}`);
  console.log(
    `  project=${parsed.project.name} | client=${parsed.project.client_name} | sheets=${parsed.sourceSheets.join(", ") || "-"}`,
  );
  console.log(
    `  expense_rows=${parsed.expenses.length} | total_amount=Rp ${formatCurrency(totalAmount)}`,
  );
  console.log(
    `  categories=${Array.from(countsByCategory.entries())
      .map(([category, count]) => `${category}:${count}`)
      .join(", ")}`,
  );
}

async function main() {
  const env = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const parsedFiles = FILE_CONFIGS.map((config) => {
    if (!fs.existsSync(config.filePath)) {
      throw new Error(`File tidak ditemukan: ${config.filePath}`);
    }
    const parsed = parseWorkbookExpenses(config);
    return {
      ...parsed,
      filePath: config.filePath,
    };
  });

  console.log(`Mode: ${DRY_RUN ? "dry-run" : "import"}`);
  console.log(`File diproses: ${parsedFiles.length}`);
  for (const parsed of parsedFiles) {
    summarizeParsedFile(parsed);
  }

  if (DRY_RUN) {
    return;
  }

  const categoryLabels = new Map();
  for (const parsed of parsedFiles) {
    for (const [slug, label] of parsed.categoryLabels.entries()) {
      categoryLabels.set(slug, label);
    }
  }
  await upsertCategories(supabase, categoryLabels);

  const { projectIdByName, createdProjects, updatedProjects } = await ensureProjects(supabase, parsedFiles);
  const syncStats = await synchronizeProjectExpenses(supabase, parsedFiles, projectIdByName);
  const totalInserted = syncStats.reduce((sum, item) => sum + item.inserted, 0);
  const totalDeleted = syncStats.reduce((sum, item) => sum + item.deleted, 0);
  const syncStatByProjectName = new Map(syncStats.map((item) => [item.projectName, item]));

  console.log("");
  console.log(`Project dibuat: ${createdProjects.length}`);
  for (const item of createdProjects) {
    console.log(`- ${item.name} | client=${item.client_name}`);
  }
  console.log(`Project diupdate: ${updatedProjects.length}`);
  for (const item of updatedProjects) {
    console.log(`- ${item.name} | ${item.from_client_name ?? "-"} -> ${item.to_client_name}`);
  }
  console.log(`Perubahan expense: inserted=${totalInserted} | deleted=${totalDeleted}`);
  for (const parsed of parsedFiles) {
    const stat = syncStatByProjectName.get(parsed.project.name) ?? { inserted: 0, deleted: 0 };
    console.log(
      `- ${path.basename(parsed.filePath)} | project=${parsed.project.name} | client=${parsed.project.client_name} | source=${parsed.expenses.length} | inserted=${stat.inserted} | deleted=${stat.deleted}`,
    );
  }
  console.log("Sinkronisasi akhir:");
  for (const stat of syncStats) {
    console.log(
      `- ${stat.projectName} | inserted=${stat.inserted} | deleted=${stat.deleted}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
