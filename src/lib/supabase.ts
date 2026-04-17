import { createClient } from "@supabase/supabase-js";

function normalizeSupabaseKey(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (trimmed.startsWith(".sb_publishable_")) {
    return trimmed.slice(1);
  }
  return trimmed;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = normalizeSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey));

type SupabaseCompatResult<T> = {
  data: T | null;
  error: unknown;
};

let _warnedNoServiceRole = false;

/**
 * Server client untuk operasi WRITE (insert/update/delete).
 * Menggunakan service_role key yang bypass RLS.
 * Jika service_role belum diset, fallback ke anon key dengan warning.
 */
export function getSupabaseServerClient() {
  if (!supabaseUrl) {
    return null;
  }

  const key = supabaseServiceRoleKey || supabaseAnonKey;
  if (!key) {
    return null;
  }

  if (!supabaseServiceRoleKey && !_warnedNoServiceRole) {
    _warnedNoServiceRole = true;
    console.warn(
      "[supabase] SUPABASE_SERVICE_ROLE_KEY belum diset. " +
      "Menggunakan anon key sebagai fallback. " +
      "Dengan RLS yang ketat, operasi write AKAN GAGAL. " +
      "Segera set SUPABASE_SERVICE_ROLE_KEY di environment variables."
    );
  }

  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Read-only client menggunakan anon key.
 * Cocok untuk operasi SELECT pada tabel dengan RLS select policy terbuka.
 */
export function getSupabaseReadClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function isSupabaseMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "";
  const message = typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : "";

  const normalizedMessage = message.toLowerCase();
  const normalizedColumnName = columnName.toLowerCase();

  if (code === "42703" && normalizedMessage.includes(normalizedColumnName)) {
    return true;
  }

  if (
    code === "PGRST204" &&
    normalizedMessage.includes(normalizedColumnName) &&
    normalizedMessage.includes("schema cache")
  ) {
    return true;
  }

  return false;
}

export async function withSupabaseSpecialistTeamNameFallback<T>(
  run: (options: { omitSpecialistTeamName: boolean }) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>,
): Promise<SupabaseCompatResult<T> & { omitSpecialistTeamName: boolean }> {
  const primaryResponse = await run({ omitSpecialistTeamName: false });
  const primaryResult: SupabaseCompatResult<T> = {
    data: (primaryResponse.data ?? null) as T | null,
    error: primaryResponse.error,
  };
  if (!isSupabaseMissingColumnError(primaryResult.error, "specialist_team_name")) {
    return {
      ...primaryResult,
      omitSpecialistTeamName: false,
    };
  }

  const fallbackResponse = await run({ omitSpecialistTeamName: true });
  const fallbackResult: SupabaseCompatResult<T> = {
    data: (fallbackResponse.data ?? null) as T | null,
    error: fallbackResponse.error,
  };
  return {
    ...fallbackResult,
    omitSpecialistTeamName: true,
  };
}

export function omitSpecialistTeamNameField(
  payload: Record<string, unknown>,
  omitSpecialistTeamName: boolean,
) {
  if (!omitSpecialistTeamName) {
    return payload;
  }

  const nextPayload = { ...payload };
  delete nextPayload.specialist_team_name;
  return nextPayload;
}

export function getSupabaseAttendanceSelect(options?: {
  includeProjectName?: boolean;
  identityOnly?: boolean;
  omitSpecialistTeamName?: boolean;
}) {
  const columns = ["id", "project_id", "worker_name", "team_type"];
  if (!options?.omitSpecialistTeamName) {
    columns.push("specialist_team_name");
  }

  if (options?.identityOnly) {
    columns.push("attendance_date", "notes");
    return columns.join(", ");
  }

  columns.push(
    "status",
    "work_days",
    "daily_wage",
    "overtime_hours",
    "overtime_wage",
    "kasbon_amount",
    "reimburse_type",
    "reimburse_amount",
    "attendance_date",
    "notes",
    "created_at",
  );
  if (options?.includeProjectName) {
    columns.push("projects(name)");
  }
  return columns.join(", ");
}

export function getSupabasePayrollResetSelect(options?: {
  omitSpecialistTeamName?: boolean;
}) {
  const columns = ["project_id", "team_type"];
  if (!options?.omitSpecialistTeamName) {
    columns.push("specialist_team_name");
  }
  columns.push("worker_name", "paid_until_date");
  return columns.join(", ");
}
