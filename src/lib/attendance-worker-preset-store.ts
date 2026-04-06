export const ATTENDANCE_WORKER_PRESET_NOTE_PREFIX = "ADMINWEBWORKERPRESET:";
export const ATTENDANCE_WORKER_PRESET_PROJECT_CODE = "SYS-WORKER-PRESET";
export const ATTENDANCE_WORKER_PRESET_PROJECT_NAME = "MASTER PEKERJA (SISTEM)";
export const ATTENDANCE_DRAFT_NOTE_PREFIX = "ADMINWEBDRAFTATTENDANCE:";
export const ATTENDANCE_DRAFT_PROJECT_CODE = "SYS-ATTENDANCE-DRAFT";
export const ATTENDANCE_DRAFT_PROJECT_NAME = "DRAFT ABSENSI (SISTEM)";

export type AttendanceWorkerPresetNotePayload = {
  wageMin: number;
  wageMax: number;
  sourceLabels: string[];
  referenceCount: number;
  importedAt?: string;
  sourceWorkbook?: string | null;
};

export type AttendanceDraftNotePayload = {
  isDraft?: boolean;
  source?: string | null;
  originSpecialistGroup?: string | null;
  specialistTeamName?: string | null;
  importedAt?: string;
  sourceWorkbook?: string | null;
};

function normalizeSourceLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim().replace(/\s+/g, " ") : ""))
        .filter((item) => item.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right, "id-ID"));
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed);
}

function normalizeReferenceCount(value: unknown) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : null;
}

export function buildAttendanceWorkerPresetNote(
  payload: AttendanceWorkerPresetNotePayload,
) {
  return `${ATTENDANCE_WORKER_PRESET_NOTE_PREFIX}${JSON.stringify({
    wageMin: normalizeNumber(payload.wageMin),
    wageMax: Math.max(normalizeNumber(payload.wageMax), normalizeNumber(payload.wageMin)),
    sourceLabels: normalizeSourceLabels(payload.sourceLabels),
    referenceCount: normalizeReferenceCount(payload.referenceCount),
    importedAt:
      typeof payload.importedAt === "string" && payload.importedAt.trim()
        ? payload.importedAt.trim()
        : undefined,
    sourceWorkbook:
      typeof payload.sourceWorkbook === "string" && payload.sourceWorkbook.trim()
        ? payload.sourceWorkbook.trim()
        : null,
  })}`;
}

export function parseAttendanceWorkerPresetNote(
  value: string | null | undefined,
): AttendanceWorkerPresetNotePayload | null {
  const raw = value?.trim();
  if (!raw || !raw.startsWith(ATTENDANCE_WORKER_PRESET_NOTE_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.slice(ATTENDANCE_WORKER_PRESET_NOTE_PREFIX.length));
    const wageMin = normalizeNumber(parsed?.wageMin);
    const wageMax = Math.max(normalizeNumber(parsed?.wageMax), wageMin);
    return {
      wageMin,
      wageMax,
      sourceLabels: normalizeSourceLabels(parsed?.sourceLabels),
      referenceCount: normalizeReferenceCount(parsed?.referenceCount),
      importedAt:
        typeof parsed?.importedAt === "string" && parsed.importedAt.trim()
          ? parsed.importedAt.trim()
          : undefined,
      sourceWorkbook:
        typeof parsed?.sourceWorkbook === "string" && parsed.sourceWorkbook.trim()
          ? parsed.sourceWorkbook.trim()
          : null,
    };
  } catch {
    return null;
  }
}

export function isAttendanceWorkerPresetNote(
  value: string | null | undefined,
) {
  return Boolean(parseAttendanceWorkerPresetNote(value));
}

export function isAttendanceWorkerPresetProjectCode(
  value: string | null | undefined,
) {
  return (value ?? "").trim().toUpperCase() === ATTENDANCE_WORKER_PRESET_PROJECT_CODE;
}

export function buildAttendanceDraftNote(payload?: AttendanceDraftNotePayload) {
  return `${ATTENDANCE_DRAFT_NOTE_PREFIX}${JSON.stringify({
    isDraft: payload?.isDraft !== false,
    source: normalizeOptionalText(payload?.source),
    originSpecialistGroup: normalizeOptionalText(payload?.originSpecialistGroup),
    specialistTeamName: normalizeOptionalText(payload?.specialistTeamName),
    importedAt:
      typeof payload?.importedAt === "string" && payload.importedAt.trim()
        ? payload.importedAt.trim()
        : undefined,
    sourceWorkbook: normalizeOptionalText(payload?.sourceWorkbook),
  })}`;
}

export function parseAttendanceDraftNote(
  value: string | null | undefined,
): AttendanceDraftNotePayload | null {
  const raw = value?.trim();
  if (!raw || !raw.startsWith(ATTENDANCE_DRAFT_NOTE_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.slice(ATTENDANCE_DRAFT_NOTE_PREFIX.length));
    return {
      isDraft: parsed?.isDraft !== false,
      source: normalizeOptionalText(parsed?.source),
      originSpecialistGroup: normalizeOptionalText(parsed?.originSpecialistGroup),
      specialistTeamName: normalizeOptionalText(parsed?.specialistTeamName),
      importedAt:
        typeof parsed?.importedAt === "string" && parsed.importedAt.trim()
          ? parsed.importedAt.trim()
          : undefined,
      sourceWorkbook: normalizeOptionalText(parsed?.sourceWorkbook),
    };
  } catch {
    return null;
  }
}

export function isAttendanceDraftNote(
  value: string | null | undefined,
) {
  return parseAttendanceDraftNote(value)?.isDraft ?? false;
}

export function isAttendanceDraftProjectCode(
  value: string | null | undefined,
) {
  return (value ?? "").trim().toUpperCase() === ATTENDANCE_DRAFT_PROJECT_CODE;
}

export function isSystemProjectCode(
  value: string | null | undefined,
) {
  return isAttendanceWorkerPresetProjectCode(value) || isAttendanceDraftProjectCode(value);
}
