import { createHash } from "node:crypto";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx/xlsx.mjs";

XLSX.set_fs(fs);

const ATTENDANCE_DRAFT_NOTE_PREFIX = "ADMINWEBDRAFTATTENDANCE:";
const ATTENDANCE_DRAFT_PROJECT_CODE = "SYS-ATTENDANCE-DRAFT";
const ATTENDANCE_DRAFT_PROJECT_NAME = "DRAFT ABSENSI (SISTEM)";
const ATTENDANCE_WORKER_PRESET_NOTE_PREFIX = "ADMINWEBWORKERPRESET:";
const ATTENDANCE_WORKER_PRESET_PROJECT_CODE = "SYS-WORKER-PRESET";

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value) {
  return normalizeText(value).toUpperCase();
}

function parseNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.round(value), 0);
  }

  const normalized = normalizeText(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(Math.round(parsed), 0) : 0;
}

function createDeterministicUuid(seed) {
  const hash = createHash("sha256").update(seed).digest("hex");
  const version = `5${hash.slice(13, 16)}`;
  const variant = `${(8 + (parseInt(hash.slice(16, 17), 16) % 4)).toString(16)}${hash.slice(17, 20)}`;
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${version}-${variant}-${hash.slice(20, 32)}`;
}

function getCurrentJakartaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
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

function isMissingColumnError(error, columnName) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const normalizedColumnName = columnName.toLowerCase();

  if (code === "42703" && message.includes(normalizedColumnName)) {
    return true;
  }

  if (code === "PGRST204" && message.includes(normalizedColumnName) && message.includes("schema cache")) {
    return true;
  }

  return false;
}

async function withSpecialistTeamFallback(run) {
  const primary = await run({ omitSpecialistTeamName: false });
  if (!isMissingColumnError(primary.error, "specialist_team_name")) {
    return primary;
  }
  return run({ omitSpecialistTeamName: true });
}

function formatSourceGroup(value) {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized.includes("JAKARTA")) {
    return "Jakarta";
  }
  if (normalized.includes("CIANJUR")) {
    return "Cianjur";
  }
  return normalizeText(value) || "Spesialis";
}

function findSourceGroup(headerRow, startColumn) {
  for (let column = startColumn; column >= 0; column -= 1) {
    const rawHeader = normalizeText(headerRow[column]);
    if (rawHeader) {
      return formatSourceGroup(rawHeader);
    }
  }
  return "Spesialis";
}

function buildDraftNote(payload) {
  return `${ATTENDANCE_DRAFT_NOTE_PREFIX}${JSON.stringify({
    isDraft: true,
    source: "excel-import",
    originSpecialistGroup: payload.originSpecialistGroup,
    specialistTeamName: payload.originSpecialistGroup,
    importedAt: payload.importedAt,
    sourceWorkbook: payload.sourceWorkbook,
  })}`;
}

function parseDraftNote(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith(ATTENDANCE_DRAFT_NOTE_PREFIX)) {
    return null;
  }
  try {
    return JSON.parse(raw.slice(ATTENDANCE_DRAFT_NOTE_PREFIX.length));
  } catch {
    return null;
  }
}

function parseWorkbookEntries(sourcePath) {
  const workbook = XLSX.readFile(sourcePath, { cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
  if (!worksheet || !firstSheetName) {
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
        originSpecialistGroup: findSourceGroup(topHeaderRow, column),
      });
    }
  }

  const workbookBaseName = path.basename(sourcePath);
  const today = getCurrentJakartaDate();

  const entries = [];
  for (let rowIndex = 5; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    for (const workerColumn of workerColumns) {
      const workerName = normalizeText(row[workerColumn.nameColumn]);
      if (!workerName) {
        continue;
      }

      entries.push({
        id: createDeterministicUuid(
          [
            "attendance-draft-import",
            workbookBaseName.toLowerCase(),
            firstSheetName.toLowerCase(),
            rowIndex,
            workerColumn.nameColumn,
          ].join("|"),
        ),
        workerName,
        dailyWage: parseNumeric(row[workerColumn.wageColumn]),
        originSpecialistGroup: workerColumn.originSpecialistGroup,
        attendanceDate: today,
      });
    }
  }

  return entries;
}

async function ensureDraftProjectId(supabase) {
  const existing = await supabase
    .from("projects")
    .select("id")
    .eq("code", ATTENDANCE_DRAFT_PROJECT_CODE)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Gagal membaca project draft absensi: ${existing.error.message}`);
  }
  if (existing.data?.id) {
    return String(existing.data.id);
  }

  const inserted = await supabase
    .from("projects")
    .insert({
      name: ATTENDANCE_DRAFT_PROJECT_NAME,
      code: ATTENDANCE_DRAFT_PROJECT_CODE,
      client_name: "SYSTEM",
      start_date: getCurrentJakartaDate(),
      status: "aktif",
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data?.id) {
    throw new Error(`Gagal membuat project draft absensi: ${inserted.error?.message ?? "ID project kosong."}`);
  }
  return String(inserted.data.id);
}

async function cleanupLegacyPresetRows(supabase) {
  const presetRowsResult = await supabase
    .from("attendance_records")
    .select("id")
    .like("notes", `${ATTENDANCE_WORKER_PRESET_NOTE_PREFIX}%`);
  if (presetRowsResult.error) {
    throw new Error(`Gagal membaca preset lama: ${presetRowsResult.error.message}`);
  }

  const presetIds = (presetRowsResult.data ?? [])
    .map((row) => String(row.id ?? ""))
    .filter((id) => id.length > 0);
  for (const chunk of chunkArray(presetIds, 100)) {
    const { error } = await supabase.from("attendance_records").delete().in("id", chunk);
    if (error) {
      throw new Error(`Gagal menghapus preset lama: ${error.message}`);
    }
  }

  await supabase.from("projects").delete().eq("code", ATTENDANCE_WORKER_PRESET_PROJECT_CODE);
  return presetIds.length;
}

async function removeStaleExcelImportRows(supabase, expectedIds) {
  const existing = await supabase
    .from("attendance_records")
    .select("id, notes")
    .like("notes", `${ATTENDANCE_DRAFT_NOTE_PREFIX}%`);
  if (existing.error) {
    throw new Error(`Gagal membaca draft import lama: ${existing.error.message}`);
  }

  const staleIds = (existing.data ?? [])
    .filter((row) => {
      const notePayload = typeof row.notes === "string" ? parseDraftNote(row.notes) : null;
      return notePayload?.source === "excel-import" && !expectedIds.has(String(row.id ?? ""));
    })
    .map((row) => String(row.id ?? ""))
    .filter((id) => id.length > 0);

  for (const chunk of chunkArray(staleIds, 100)) {
    const { error } = await supabase.from("attendance_records").delete().in("id", chunk);
    if (error) {
      throw new Error(`Gagal menghapus draft import lama: ${error.message}`);
    }
  }

  return staleIds.length;
}

async function upsertAttendanceRows(supabase, rows) {
  for (const chunk of chunkArray(rows, 100)) {
    const result = await withSpecialistTeamFallback(({ omitSpecialistTeamName }) =>
      supabase.from("attendance_records").upsert(
        chunk.map((row) => {
          if (!omitSpecialistTeamName) {
            return row;
          }
          const nextRow = { ...row };
          delete nextRow.specialist_team_name;
          return nextRow;
        }),
        { onConflict: "id" },
      ),
    );

    if (result.error) {
      throw new Error(`Gagal menyimpan draft absensi: ${result.error.message}`);
    }
  }
}

async function main() {
  const sourcePath = resolveSourcePath();
  if (!sourcePath) {
    throw new Error("File sumber worker tidak ditemukan.");
  }

  const parsedEntries = parseWorkbookEntries(sourcePath);
  if (parsedEntries.length === 0) {
    throw new Error("Tidak ada data pekerja yang berhasil dibaca dari workbook.");
  }

  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const draftProjectId = await ensureDraftProjectId(supabase);
  const cleanedPresetRows = await cleanupLegacyPresetRows(supabase);
  const importedAt = new Date().toISOString();

  const attendanceRows = parsedEntries.map((entry) => ({
    id: entry.id,
    project_id: draftProjectId,
    worker_name: entry.workerName,
    team_type: "spesialis",
    specialist_team_name: entry.originSpecialistGroup,
    status: "hadir",
    work_days: 1,
    daily_wage: entry.dailyWage,
    overtime_hours: 0,
    overtime_wage: 0,
    kasbon_amount: 0,
    reimburse_type: null,
    reimburse_amount: 0,
    attendance_date: entry.attendanceDate,
    notes: buildDraftNote({
      originSpecialistGroup: entry.originSpecialistGroup,
      importedAt,
      sourceWorkbook: path.basename(sourcePath),
    }),
  }));

  const expectedIds = new Set(attendanceRows.map((row) => row.id));
  const deletedStaleRows = await removeStaleExcelImportRows(supabase, expectedIds);
  await upsertAttendanceRows(supabase, attendanceRows);

  const countByGroup = {};
  for (const row of attendanceRows) {
    countByGroup[row.specialist_team_name] = (countByGroup[row.specialist_team_name] ?? 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        importedRows: attendanceRows.length,
        cleanedPresetRows,
        deletedStaleRows,
        draftProjectId,
        attendanceDate: attendanceRows[0]?.attendance_date ?? getCurrentJakartaDate(),
        byGroup: countByGroup,
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
