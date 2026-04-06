import "server-only";

import { createHash } from "node:crypto";
import {
  ATTENDANCE_DRAFT_PROJECT_CODE,
  ATTENDANCE_DRAFT_PROJECT_NAME,
  buildAttendanceDraftNote,
  isAttendanceWorkerPresetNote,
  parseAttendanceDraftNote,
} from "@/lib/attendance-worker-preset-store";
import { type WorkerTeam, WORKER_TEAMS } from "@/lib/constants";
import { readExcelDatabase, upsertManyExcelAttendance } from "@/lib/excel-db";
import { getFirestoreServerClient } from "@/lib/firebase";
import { activeDataSource } from "@/lib/storage";
import {
  getSupabaseAttendanceSelect,
  getSupabaseServerClient,
  omitSpecialistTeamNameField,
  withSupabaseSpecialistTeamNameFallback,
} from "@/lib/supabase";

type RawAttendanceRow = Record<string, unknown>;

type AttendanceRosterSeed = {
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  dailyWage: number;
  attendanceDate: string;
  createdAt: string;
};

function normalizeIdentityText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function createDeterministicUuid(seed: string) {
  const hash = createHash("sha256").update(seed).digest("hex");
  const version = `5${hash.slice(13, 16)}`;
  const variant = `${(8 + (parseInt(hash.slice(16, 17), 16) % 4)).toString(16)}${hash.slice(17, 20)}`;
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${version}-${variant}-${hash.slice(20, 32)}`;
}

function createAttendanceDraftId(input: {
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
  attendanceDate: string;
}) {
  return createDeterministicUuid(
    [
      "attendance",
      "",
      input.attendanceDate.trim(),
      normalizeIdentityText(input.workerName),
      input.teamType,
      normalizeIdentityText(input.specialistTeamName),
    ].join("|"),
  );
}

function createAttendanceRosterKey(input: {
  workerName: string;
  teamType: WorkerTeam;
  specialistTeamName: string | null;
}) {
  return [
    normalizeIdentityText(input.workerName),
    input.teamType,
    normalizeIdentityText(input.specialistTeamName),
  ].join("|");
}

function parseWorkerTeamValue(value: unknown): WorkerTeam | null {
  const rawValue = String(value ?? "");
  if (!WORKER_TEAMS.some((item) => item.value === rawValue)) {
    return null;
  }
  return rawValue as WorkerTeam;
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toDateOnly(value: unknown) {
  return String(value ?? "").slice(0, 10);
}

function compareAttendanceSeed(left: AttendanceRosterSeed, right: AttendanceRosterSeed) {
  if (left.attendanceDate !== right.attendanceDate) {
    return left.attendanceDate.localeCompare(right.attendanceDate);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

function mapRosterSeed(row: RawAttendanceRow): AttendanceRosterSeed | null {
  if (isAttendanceWorkerPresetNote(typeof row.notes === "string" ? row.notes : null)) {
    return null;
  }

  const workerName = String(row.worker_name ?? "").trim();
  if (!workerName) {
    return null;
  }

  const teamType = parseWorkerTeamValue(row.team_type);
  if (!teamType) {
    return null;
  }

  const notePayload =
    typeof row.notes === "string" ? parseAttendanceDraftNote(row.notes) : null;
  const specialistTeamName =
    teamType === "spesialis"
      ? normalizeOptionalText(row.specialist_team_name) ??
        notePayload?.specialistTeamName ??
        notePayload?.originSpecialistGroup ??
        null
      : null;
  const rawDailyWage = Number(row.daily_wage ?? 0);
  const dailyWage = Number.isFinite(rawDailyWage) ? Math.max(rawDailyWage, 0) : 0;
  const attendanceDate = toDateOnly(row.attendance_date);
  if (!attendanceDate) {
    return null;
  }

  return {
    workerName,
    teamType,
    specialistTeamName,
    dailyWage,
    attendanceDate,
    createdAt: String(row.created_at ?? ""),
  };
}

function buildRosterSeeds(rows: RawAttendanceRow[], targetDate: string) {
  const rosterByKey = new Map<string, AttendanceRosterSeed>();
  const currentDateKeys = new Set<string>();

  for (const row of rows) {
    const candidate = mapRosterSeed(row);
    if (!candidate) {
      continue;
    }

    const key = createAttendanceRosterKey(candidate);
    if (candidate.attendanceDate === targetDate) {
      currentDateKeys.add(key);
      continue;
    }
    if (candidate.attendanceDate > targetDate) {
      continue;
    }

    const current = rosterByKey.get(key);
    if (!current || compareAttendanceSeed(current, candidate) < 0) {
      rosterByKey.set(key, candidate);
    }
  }

  return Array.from(rosterByKey.values())
    .filter((item) => !currentDateKeys.has(createAttendanceRosterKey(item)))
    .map((item) => ({
      id: createAttendanceDraftId({
        workerName: item.workerName,
        teamType: item.teamType,
        specialistTeamName: item.specialistTeamName,
        attendanceDate: targetDate,
      }),
      workerName: item.workerName,
      teamType: item.teamType,
      specialistTeamName: item.specialistTeamName,
      dailyWage: item.dailyWage,
    }))
    .sort((left, right) => left.workerName.localeCompare(right.workerName, "id-ID"));
}

async function ensureSupabaseAttendanceDraftProjectId(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  targetDate: string,
) {
  const existing = await supabase
    .from("projects")
    .select("id")
    .eq("code", ATTENDANCE_DRAFT_PROJECT_CODE)
    .maybeSingle();
  if (existing.error) {
    return null;
  }
  if (existing.data?.id) {
    return String(existing.data.id);
  }

  const created = await supabase
    .from("projects")
    .insert({
      name: ATTENDANCE_DRAFT_PROJECT_NAME,
      code: ATTENDANCE_DRAFT_PROJECT_CODE,
      client_name: "SYSTEM",
      start_date: targetDate,
      status: "aktif",
    })
    .select("id")
    .single();
  if (created.error || !created.data?.id) {
    return null;
  }
  return String(created.data.id);
}

export async function ensureDailyAttendanceDrafts(targetDate: string) {
  if (!targetDate) {
    return false;
  }

  if (activeDataSource === "excel") {
    const rows = readExcelDatabase().attendance_records;
    const rosterSeeds = buildRosterSeeds(rows, targetDate);
    if (rosterSeeds.length === 0) {
      return false;
    }

    upsertManyExcelAttendance(
      rosterSeeds.map((item) => ({
        id: item.id,
        project_id: "",
        worker_name: item.workerName,
        team_type: item.teamType,
        specialist_team_name: item.specialistTeamName,
        status: "hadir",
        work_days: 1,
        daily_wage: item.dailyWage,
        overtime_hours: 0,
        overtime_wage: 0,
        kasbon_amount: 0,
        reimburse_type: null,
        reimburse_amount: 0,
        attendance_date: targetDate,
        notes: buildAttendanceDraftNote({
          isDraft: true,
          source: "daily-reset",
          originSpecialistGroup: item.specialistTeamName,
          specialistTeamName: item.specialistTeamName,
          importedAt: new Date().toISOString(),
        }),
      })),
    );
    return true;
  }

  if (activeDataSource === "supabase") {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return false;
    }

    const existingRowsResult = await withSupabaseSpecialistTeamNameFallback<RawAttendanceRow[]>(
      ({ omitSpecialistTeamName }) =>
        supabase
          .from("attendance_records")
          .select(getSupabaseAttendanceSelect({ omitSpecialistTeamName }))
          .order("attendance_date", { ascending: false })
          .order("created_at", { ascending: false }),
    );
    const existingRows = existingRowsResult.data ?? [];
    const rosterSeeds = buildRosterSeeds(existingRows, targetDate);
    if (rosterSeeds.length === 0) {
      return false;
    }

    const draftProjectId = await ensureSupabaseAttendanceDraftProjectId(supabase, targetDate);
    if (!draftProjectId) {
      return false;
    }

    const upsertResult = await withSupabaseSpecialistTeamNameFallback(({ omitSpecialistTeamName }) =>
      supabase.from("attendance_records").upsert(
        rosterSeeds.map((item) =>
          omitSpecialistTeamNameField(
            {
              id: item.id,
              project_id: draftProjectId,
              worker_name: item.workerName,
              team_type: item.teamType,
              specialist_team_name: item.specialistTeamName,
              status: "hadir",
              work_days: 1,
              daily_wage: item.dailyWage,
              overtime_hours: 0,
              overtime_wage: 0,
              kasbon_amount: 0,
              reimburse_type: null,
              reimburse_amount: 0,
              attendance_date: targetDate,
              notes: buildAttendanceDraftNote({
                isDraft: true,
                source: "daily-reset",
                originSpecialistGroup: item.specialistTeamName,
                specialistTeamName: item.specialistTeamName,
                importedAt: new Date().toISOString(),
              }),
            },
            omitSpecialistTeamName,
          ),
        ),
        {
          onConflict: "id",
        },
      ),
    );

    return !upsertResult.error;
  }

  if (activeDataSource === "firebase") {
    const firestore = getFirestoreServerClient();
    if (!firestore) {
      return false;
    }

    const snapshot = await firestore.collection("attendance_records").get();
    const existingRows = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as RawAttendanceRow,
    );
    const rosterSeeds = buildRosterSeeds(existingRows, targetDate);
    if (rosterSeeds.length === 0) {
      return false;
    }

    const batch = firestore.batch();
    for (const item of rosterSeeds) {
      batch.set(
        firestore.collection("attendance_records").doc(item.id),
        {
          id: item.id,
          project_id: "",
          worker_name: item.workerName,
          team_type: item.teamType,
          specialist_team_name: item.specialistTeamName,
          status: "hadir",
          work_days: 1,
          daily_wage: item.dailyWage,
          overtime_hours: 0,
          overtime_wage: 0,
          kasbon_amount: 0,
          reimburse_type: null,
          reimburse_amount: 0,
          attendance_date: targetDate,
          notes: buildAttendanceDraftNote({
            isDraft: true,
            source: "daily-reset",
            originSpecialistGroup: item.specialistTeamName,
            specialistTeamName: item.specialistTeamName,
            importedAt: new Date().toISOString(),
          }),
          created_at: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    await batch.commit();
    return true;
  }

  return false;
}
