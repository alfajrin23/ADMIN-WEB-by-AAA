import { createHash } from "node:crypto";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx/xlsx.mjs";

XLSX.set_fs(fs);

const ATTENDANCE_WORKER_PRESET_NOTE_PREFIX = "ADMINWEBWORKERPRESET:";
const ATTENDANCE_WORKER_PRESET_DATE = "1900-01-01";
const ATTENDANCE_WORKER_PRESET_PROJECT_CODE = "SYS-WORKER-PRESET";
const ATTENDANCE_WORKER_PRESET_PROJECT_NAME = "MASTER PEKERJA (SISTEM)";

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value) {
  return normalizeText(value).toUpperCase();
}

function toTitleCase(value) {
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function formatSourceLabel(value) {
  const cleaned = normalizeText(value);
  if (!cleaned) {
    return "Spesialis";
  }

  const withoutPrefix = cleaned.replace(/^TIM\s+SPESIALIS\s+/i, "");
  if (withoutPrefix !== cleaned) {
    return `Spesialis ${toTitleCase(withoutPrefix)}`;
  }

  return toTitleCase(cleaned);
}

function parseNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.round(value), 0);
  }

  const normalized = normalizeText(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(Math.round(parsed), 0) : 0;
}

function findSectionLabel(headerRow, startColumn) {
  for (let column = startColumn; column >= 0; column -= 1) {
    const rawHeader = normalizeText(headerRow[column]);
    if (rawHeader) {
      return formatSourceLabel(rawHeader);
    }
  }
  return "Spesialis";
}

function parseWorkbook(sourcePath) {
  const workbook = XLSX.readFile(sourcePath, { cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
  if (!worksheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
  });
  const topHeaderRow = rows[0] ?? [];
  const columnHeaderRow = rows[4] ?? [];
  const workerColumns = [];

  for (let column = 0; column < columnHeaderRow.length - 1; column += 1) {
    if (
      normalizeHeader(columnHeaderRow[column]) === "NAMA" &&
      normalizeHeader(columnHeaderRow[column + 1]) === "UPAH PER HARI"
    ) {
      workerColumns.push({
        nameColumn: column,
        wageColumn: column + 1,
        sourceLabel: findSectionLabel(topHeaderRow, column),
      });
    }
  }

  const presetsByName = new Map();

  for (let rowIndex = 5; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    for (const column of workerColumns) {
      const workerName = normalizeText(row[column.nameColumn]);
      if (!workerName) {
        continue;
      }

      const workerKey = workerName.toUpperCase();
      const current =
        presetsByName.get(workerKey) ??
        {
          name: workerName,
          wages: [],
          sourceLabels: new Set(),
          referenceCount: 0,
        };

      current.referenceCount += 1;
      current.sourceLabels.add(column.sourceLabel);

      const wage = parseNumeric(row[column.wageColumn]);
      if (wage > 0) {
        current.wages.push(wage);
      }

      presetsByName.set(workerKey, current);
    }
  }

  return Array.from(presetsByName.values())
    .map((item) => {
      const wages = item.wages.length > 0 ? item.wages : [0];
      return {
        name: item.name,
        wageMin: Math.min(...wages),
        wageMax: Math.max(...wages),
        sourceLabels: Array.from(item.sourceLabels).sort((left, right) => left.localeCompare(right, "id-ID")),
        referenceCount: item.referenceCount,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "id-ID"));
}

function createDeterministicUuid(seed) {
  const hash = createHash("sha256").update(seed).digest("hex");
  const version = `5${hash.slice(13, 16)}`;
  const variant = `${(8 + (parseInt(hash.slice(16, 17), 16) % 4)).toString(16)}${hash.slice(17, 20)}`;
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${version}-${variant}-${hash.slice(20, 32)}`;
}

function buildPresetNote(payload) {
  return `${ATTENDANCE_WORKER_PRESET_NOTE_PREFIX}${JSON.stringify(payload)}`;
}

function resolveSourcePath() {
  const argvSource = process.argv
    .slice(2)
    .find((item) => item.startsWith("--source="))
    ?.slice("--source=".length)
    ?.trim();
  if (argvSource && fs.existsSync(argvSource)) {
    return argvSource;
  }

  const envSource = process.env.ATTENDANCE_WORKER_SOURCE_PATH?.trim();
  if (envSource && fs.existsSync(envSource)) {
    return envSource;
  }

  const candidates = [
    path.join(process.cwd(), "data", "RINCIAN NAMA PEKERJA.xlsx"),
    path.join(process.cwd(), "data", "attendance-workers.xlsx"),
    path.join(os.homedir(), "Downloads", "RINCIAN NAMA PEKERJA.xlsx"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function parseEnvFile() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const content = fs.readFileSync(envPath, "utf8");
  const values = {};

  for (const rawLine of content.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }

  return values;
}

function getSupabaseConfig() {
  const envFile = parseEnvFile();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || envFile.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    envFile.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("Supabase URL atau anon key tidak ditemukan di environment / .env.local.");
  }

  return { url, key };
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function main() {
  const sourcePath = resolveSourcePath();
  if (!sourcePath) {
    throw new Error("File sumber worker preset tidak ditemukan.");
  }

  const workerPresets = parseWorkbook(sourcePath);
  if (workerPresets.length === 0) {
    throw new Error("Tidak ada data worker preset yang berhasil dibaca dari workbook.");
  }

  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let presetProjectId = "";
  const existingProjectResult = await supabase
    .from("projects")
    .select("id, code")
    .eq("code", ATTENDANCE_WORKER_PRESET_PROJECT_CODE)
    .maybeSingle();
  if (existingProjectResult.error) {
    throw new Error(`Gagal membaca project preset: ${existingProjectResult.error.message}`);
  }

  if (existingProjectResult.data?.id) {
    presetProjectId = String(existingProjectResult.data.id);
  } else {
    const insertProjectResult = await supabase
      .from("projects")
      .insert({
        name: ATTENDANCE_WORKER_PRESET_PROJECT_NAME,
        code: ATTENDANCE_WORKER_PRESET_PROJECT_CODE,
        client_name: "SYSTEM",
        start_date: ATTENDANCE_WORKER_PRESET_DATE,
        status: "aktif",
      })
      .select("id")
      .single();
    if (insertProjectResult.error || !insertProjectResult.data?.id) {
      throw new Error(`Gagal membuat project preset: ${insertProjectResult.error?.message ?? "ID project kosong."}`);
    }
    presetProjectId = String(insertProjectResult.data.id);
  }

  const importedAt = new Date().toISOString();
  const rows = workerPresets.map((preset) => ({
    id: createDeterministicUuid(`attendance-worker-preset|${preset.name.trim().toLowerCase()}`),
    project_id: presetProjectId,
    worker_name: preset.name,
    team_type: "spesialis",
    status: "izin",
    work_days: 1,
    daily_wage: preset.wageMin,
    overtime_hours: 0,
    overtime_wage: 0,
    kasbon_amount: 0,
    reimburse_type: null,
    reimburse_amount: 0,
    attendance_date: ATTENDANCE_WORKER_PRESET_DATE,
    notes: buildPresetNote({
      wageMin: preset.wageMin,
      wageMax: preset.wageMax,
      sourceLabels: preset.sourceLabels,
      referenceCount: preset.referenceCount,
      importedAt,
      sourceWorkbook: path.basename(sourcePath),
    }),
  }));

  const existingResult = await supabase
    .from("attendance_records")
    .select("id")
    .like("notes", `${ATTENDANCE_WORKER_PRESET_NOTE_PREFIX}%`);
  if (existingResult.error) {
    throw new Error(`Gagal membaca preset lama: ${existingResult.error.message}`);
  }

  const expectedIds = new Set(rows.map((row) => row.id));
  const staleIds = (existingResult.data ?? [])
    .map((row) => String(row.id ?? ""))
    .filter((id) => id && !expectedIds.has(id));

  for (const chunk of chunkArray(staleIds, 100)) {
    const { error } = await supabase.from("attendance_records").delete().in("id", chunk);
    if (error) {
      throw new Error(`Gagal menghapus preset lama: ${error.message}`);
    }
  }

  for (const chunk of chunkArray(rows, 100)) {
    const { error } = await supabase
      .from("attendance_records")
      .upsert(chunk, { onConflict: "id" });
    if (error) {
      throw new Error(`Gagal menyimpan preset: ${error.message}`);
    }
  }

  const multiWageCount = workerPresets.filter((item) => item.wageMin !== item.wageMax).length;
  console.log(
    JSON.stringify(
      {
        imported: workerPresets.length,
        multiWageNames: multiWageCount,
        sentinelDate: ATTENDANCE_WORKER_PRESET_DATE,
        presetProjectId,
        sourcePath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
