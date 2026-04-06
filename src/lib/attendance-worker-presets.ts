import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx/xlsx.mjs";
import {
  ATTENDANCE_WORKER_PRESET_NOTE_PREFIX,
  parseAttendanceWorkerPresetNote,
} from "@/lib/attendance-worker-preset-store";
import { activeDataSource } from "@/lib/storage";
import { getSupabaseServerClient } from "@/lib/supabase";

XLSX.set_fs(fs);

export type AttendanceWorkerPreset = {
  name: string;
  wageMin: number;
  wageMax: number;
  sourceLabels: string[];
  referenceCount: number;
};

type CachedWorkerPresetState = {
  mtimeMs: number;
  sourcePath: string;
  rows: AttendanceWorkerPreset[];
};

let cachedState: CachedWorkerPresetState | null = null;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value: unknown) {
  return normalizeText(value).toUpperCase();
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function formatSourceLabel(value: string) {
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

function parseNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.round(value), 0);
  }

  const normalized = normalizeText(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(Math.round(parsed), 0) : 0;
}

function resolveWorkerWorkbookPath() {
  const explicitPath = process.env.ATTENDANCE_WORKER_SOURCE_PATH?.trim();
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const localCandidates = [
    path.join(process.cwd(), "data", "RINCIAN NAMA PEKERJA.xlsx"),
    path.join(process.cwd(), "data", "attendance-workers.xlsx"),
  ];
  for (const candidate of localCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const downloadsDir = path.join(os.homedir(), "Downloads");
  if (fs.existsSync(downloadsDir)) {
    const downloadCandidate = path.join(downloadsDir, "RINCIAN NAMA PEKERJA.xlsx");
    if (fs.existsSync(downloadCandidate)) {
      return downloadCandidate;
    }
  }

  return null;
}

function findSectionLabel(headerRow: unknown[], startColumn: number) {
  for (let column = startColumn; column >= 0; column -= 1) {
    const rawHeader = normalizeText(headerRow[column]);
    if (rawHeader) {
      return formatSourceLabel(rawHeader);
    }
  }
  return "Spesialis";
}

function parseWorkerPresetRows(sourcePath: string): AttendanceWorkerPreset[] {
  const workbook = XLSX.readFile(sourcePath, { cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
  if (!worksheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<Array<unknown>>(worksheet, {
    header: 1,
    defval: null,
  });
  const topHeaderRow = rows[0] ?? [];
  const columnHeaderRow = rows[4] ?? [];
  const workerColumns: Array<{
    nameColumn: number;
    wageColumn: number;
    sourceLabel: string;
  }> = [];

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

  const presetsByName = new Map<
    string,
    {
      name: string;
      wages: number[];
      sourceLabels: Set<string>;
      referenceCount: number;
    }
  >();

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
          sourceLabels: new Set<string>(),
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
        sourceLabels: Array.from(item.sourceLabels).sort((left, right) => left.localeCompare(right)),
        referenceCount: item.referenceCount,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function getSupabaseAttendanceWorkerPresets() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("attendance_records")
    .select("worker_name, daily_wage, notes")
    .like("notes", `${ATTENDANCE_WORKER_PRESET_NOTE_PREFIX}%`)
    .order("worker_name", { ascending: true });
  if (error || !Array.isArray(data)) {
    return [];
  }

  return data
    .map((row) => {
      const name = normalizeText(row.worker_name);
      if (!name) {
        return null;
      }

      const notePayload =
        typeof row.notes === "string" ? parseAttendanceWorkerPresetNote(row.notes) : null;
      const rawDailyWage = Number(row.daily_wage ?? 0);
      const fallbackWage = Number.isFinite(rawDailyWage) ? Math.max(Math.round(rawDailyWage), 0) : 0;

      return {
        name,
        wageMin: notePayload?.wageMin ?? fallbackWage,
        wageMax: notePayload?.wageMax ?? fallbackWage,
        sourceLabels:
          notePayload && notePayload.sourceLabels.length > 0 ? notePayload.sourceLabels : ["Supabase"],
        referenceCount: notePayload?.referenceCount ?? 1,
      } satisfies AttendanceWorkerPreset;
    })
    .filter((row): row is AttendanceWorkerPreset => Boolean(row))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getAttendanceWorkerPresets() {
  if (activeDataSource === "supabase") {
    const supabaseRows = await getSupabaseAttendanceWorkerPresets();
    if (supabaseRows.length > 0) {
      return supabaseRows;
    }
  }

  const sourcePath = resolveWorkerWorkbookPath();
  if (!sourcePath) {
    return [];
  }

  const stat = fs.statSync(sourcePath);
  if (
    cachedState &&
    cachedState.sourcePath === sourcePath &&
    cachedState.mtimeMs === stat.mtimeMs
  ) {
    return cachedState.rows;
  }

  const rows = parseWorkerPresetRows(sourcePath);
  cachedState = {
    sourcePath,
    mtimeMs: stat.mtimeMs,
    rows,
  };
  return rows;
}
