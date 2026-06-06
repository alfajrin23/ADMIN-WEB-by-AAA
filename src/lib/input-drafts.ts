import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase";

export const EXPENSE_INPUT_DRAFT_KEY = "expense-input";
export const EXPENSE_INPUT_DRAFT_GLOBAL_PROJECT_ID = "__global__";
const CLEARED_DRAFT_STATE = "cleared";
const ACTIVE_DRAFT_STATUS = "active";
const CLEARED_DRAFT_STATUS = "cleared";
const INPUT_BIAYA_DRAFT_TABLE = "input_biaya_drafts";
const LEGACY_DRAFT_TABLE = "user_input_drafts";

const EXPENSE_INPUT_MODES = [
  "standard",
  "hok_kmp_cianjur",
  "scraper",
  "continue",
] as const;

export type ExpenseInputDraftMode = (typeof EXPENSE_INPUT_MODES)[number];

export type StoredInputDraft = {
  payload: Record<string, unknown> | null;
  updatedAt: string;
  isCleared?: boolean;
  clearedAt?: string | null;
};

export type SaveInputDraftResult = {
  ok: boolean;
  updatedAt?: string;
  isCleared?: boolean;
  clearedAt?: string | null;
};

function isMissingDraftTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
  const message =
    typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : "";
  const normalizedMessage = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    normalizedMessage.includes(LEGACY_DRAFT_TABLE) ||
    normalizedMessage.includes(INPUT_BIAYA_DRAFT_TABLE) ||
    normalizedMessage.includes("schema cache")
  );
}

function getRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isClearedDraftPayload(payload: unknown): payload is Record<string, unknown> {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    getRecordString(payload as Record<string, unknown>, "__state") === CLEARED_DRAFT_STATE
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeExpenseDraftProjectId(value: string | null | undefined) {
  const normalizedValue = (value ?? "").trim();
  return normalizedValue || EXPENSE_INPUT_DRAFT_GLOBAL_PROJECT_ID;
}

export function normalizeExpenseDraftMode(value: string | null | undefined): ExpenseInputDraftMode {
  return EXPENSE_INPUT_MODES.includes(value as ExpenseInputDraftMode)
    ? (value as ExpenseInputDraftMode)
    : "standard";
}

function getExpenseModePayloadKey(mode: ExpenseInputDraftMode) {
  if (mode === "hok_kmp_cianjur") {
    return "hok";
  }
  if (mode === "continue") {
    return "continueMode";
  }
  return mode;
}

function mergeExpenseDraftPayloadRows(
  rows: Array<{
    mode?: unknown;
    draft_data?: unknown;
    updated_at?: unknown;
    status?: unknown;
  }>,
): StoredInputDraft | null {
  const activeRows = rows
    .filter((row) => String(row.status ?? ACTIVE_DRAFT_STATUS) === ACTIVE_DRAFT_STATUS)
    .filter((row) => isRecord(row.draft_data))
    .sort((a, b) => toTimestamp(String(a.updated_at ?? "")) - toTimestamp(String(b.updated_at ?? "")));

  if (activeRows.length === 0) {
    return null;
  }

  const mergedPayload: Record<string, unknown> = {
    version: 2,
    mode: "standard",
  };
  let latestUpdatedAt = "";
  let latestMode: ExpenseInputDraftMode = "standard";

  for (const row of activeRows) {
    const rowMode = normalizeExpenseDraftMode(typeof row.mode === "string" ? row.mode : null);
    const payload = row.draft_data as Record<string, unknown>;
    const modePayloadKey = getExpenseModePayloadKey(rowMode);
    const modePayload = payload[modePayloadKey];

    if (isRecord(modePayload)) {
      mergedPayload[modePayloadKey] = modePayload;
    }

    for (const key of ["standard", "scraper", "continueMode", "hok"]) {
      if (mergedPayload[key] === undefined && isRecord(payload[key])) {
        mergedPayload[key] = payload[key];
      }
    }

    const updatedAt = String(row.updated_at ?? "");
    if (toTimestamp(updatedAt) >= toTimestamp(latestUpdatedAt)) {
      latestUpdatedAt = updatedAt;
      latestMode = rowMode;
    }
  }

  mergedPayload.mode = latestMode;
  mergedPayload.savedAt = latestUpdatedAt || new Date().toISOString();

  return {
    payload: mergedPayload,
    updatedAt: latestUpdatedAt || new Date().toISOString(),
    isCleared: false,
    clearedAt: null,
  };
}

async function getExpenseInputDraftRows(input: {
  actorId: string;
  projectId?: string | null;
  mode?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase || !input.actorId) {
    return { rows: null, error: null };
  }

  const projectId = normalizeExpenseDraftProjectId(input.projectId);
  const mode = input.mode ? normalizeExpenseDraftMode(input.mode) : null;
  let query = supabase
    .from(INPUT_BIAYA_DRAFT_TABLE)
    .select("mode, draft_data, status, updated_at")
    .eq("user_id", input.actorId)
    .eq("project_id", projectId)
    .eq("status", ACTIVE_DRAFT_STATUS)
    .order("updated_at", { ascending: true });

  if (mode) {
    query = query.eq("mode", mode);
  }

  const { data, error } = await query;
  return { rows: data ?? null, error };
}

export async function getExpenseInputDraftForActor(input: {
  actorId: string;
  projectId?: string | null;
  mode?: string | null;
}): Promise<StoredInputDraft | null> {
  const { rows, error } = await getExpenseInputDraftRows(input);
  if (!error && rows) {
    return mergeExpenseDraftPayloadRows(rows);
  }

  if (error && !isMissingDraftTableError(error)) {
    console.warn("[input-drafts] gagal membaca draft input biaya.", error.message);
    return null;
  }

  return getInputDraftForActor(input.actorId, EXPENSE_INPUT_DRAFT_KEY);
}

export async function getInputDraftForActor(
  actorId: string,
  draftKey: string,
): Promise<StoredInputDraft | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !actorId || !draftKey) {
    return null;
  }

  const { data, error } = await supabase
    .from(LEGACY_DRAFT_TABLE)
    .select("payload, updated_at")
    .eq("actor_id", actorId)
    .eq("draft_key", draftKey)
    .maybeSingle();

  if (error) {
    if (!isMissingDraftTableError(error)) {
      console.warn("[input-drafts] gagal membaca draft.", error.message);
    }
    return null;
  }

  if (!data || !data.payload || typeof data.payload !== "object" || Array.isArray(data.payload)) {
    return null;
  }

  const payload = data.payload as Record<string, unknown>;
  const updatedAt = String(data.updated_at ?? new Date().toISOString());
  if (isClearedDraftPayload(payload)) {
    return {
      payload: null,
      updatedAt,
      isCleared: true,
      clearedAt: getRecordString(payload, "clearedAt") || updatedAt,
    };
  }

  return {
    payload,
    updatedAt,
    isCleared: false,
    clearedAt: null,
  };
}

export async function saveInputDraftForActor(input: {
  actorId: string;
  draftKey: string;
  payload: Record<string, unknown>;
  knownUpdatedAt?: string | null;
}): Promise<SaveInputDraftResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !input.actorId || !input.draftKey) {
    return { ok: false };
  }

  const existing = await supabase
    .from(LEGACY_DRAFT_TABLE)
    .select("payload, updated_at")
    .eq("actor_id", input.actorId)
    .eq("draft_key", input.draftKey)
    .maybeSingle();

  if (existing.error) {
    if (!isMissingDraftTableError(existing.error)) {
      console.warn("[input-drafts] gagal membaca status draft.", existing.error.message);
    }
    if (isMissingDraftTableError(existing.error)) {
      return { ok: false };
    }
  }

  const existingPayload = existing.data?.payload;
  const existingUpdatedAt = existing.data?.updated_at
    ? String(existing.data.updated_at)
    : null;
  const payloadSavedAt = getRecordString(input.payload, "savedAt") || null;
  const latestKnownClientTimestamp = Math.max(
    toTimestamp(input.knownUpdatedAt),
    toTimestamp(payloadSavedAt),
  );
  if (
    isClearedDraftPayload(existingPayload) &&
    toTimestamp(existingUpdatedAt) > latestKnownClientTimestamp
  ) {
    return {
      ok: false,
      updatedAt: existingUpdatedAt ?? undefined,
      isCleared: true,
      clearedAt:
        getRecordString(existingPayload as Record<string, unknown>, "clearedAt") ||
        existingUpdatedAt,
    };
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from(LEGACY_DRAFT_TABLE).upsert(
    {
      actor_id: input.actorId,
      draft_key: input.draftKey,
      payload: input.payload,
      updated_at: updatedAt,
    },
    {
      onConflict: "actor_id,draft_key",
    },
  );

  if (error && !isMissingDraftTableError(error)) {
    console.warn("[input-drafts] gagal menyimpan draft.", error.message);
  }
  if (error) {
    return { ok: false };
  }

  return { ok: true, updatedAt, isCleared: false, clearedAt: null };
}

export async function clearInputDraftForActor(
  actorId: string,
  draftKey: string,
): Promise<SaveInputDraftResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !actorId || !draftKey) {
    return { ok: false };
  }

  const clearedAt = new Date().toISOString();
  const { error } = await supabase.from(LEGACY_DRAFT_TABLE).upsert(
    {
      actor_id: actorId,
      draft_key: draftKey,
      payload: {
        __state: CLEARED_DRAFT_STATE,
        clearedAt,
      },
      updated_at: clearedAt,
    },
    {
      onConflict: "actor_id,draft_key",
    },
  );

  if (error && !isMissingDraftTableError(error)) {
    console.warn("[input-drafts] gagal menghapus draft.", error.message);
  }
  if (error) {
    return { ok: false };
  }

  return { ok: true, updatedAt: clearedAt, isCleared: true, clearedAt };
}

export async function saveExpenseInputDraftForActor(input: {
  actorId: string;
  projectId?: string | null;
  mode?: string | null;
  payload: Record<string, unknown>;
  knownUpdatedAt?: string | null;
}): Promise<SaveInputDraftResult> {
  const supabase = getSupabaseServerClient();
  const projectId = normalizeExpenseDraftProjectId(input.projectId);
  const mode = normalizeExpenseDraftMode(input.mode ?? getRecordString(input.payload, "mode"));
  if (!supabase || !input.actorId) {
    return { ok: false };
  }

  const existing = await supabase
    .from(INPUT_BIAYA_DRAFT_TABLE)
    .select("status, draft_data, updated_at")
    .eq("user_id", input.actorId)
    .eq("project_id", projectId)
    .eq("mode", mode)
    .maybeSingle();

  if (existing.error) {
    if (isMissingDraftTableError(existing.error)) {
      return saveInputDraftForActor({
        actorId: input.actorId,
        draftKey: EXPENSE_INPUT_DRAFT_KEY,
        payload: input.payload,
        knownUpdatedAt: input.knownUpdatedAt,
      });
    }
    console.warn("[input-drafts] gagal membaca status draft input biaya.", existing.error.message);
    return { ok: false };
  }

  const payloadSavedAt = getRecordString(input.payload, "savedAt") || null;
  const latestKnownClientTimestamp = Math.max(
    toTimestamp(input.knownUpdatedAt),
    toTimestamp(payloadSavedAt),
  );
  const existingUpdatedAt = existing.data?.updated_at ? String(existing.data.updated_at) : null;
  if (
    String(existing.data?.status ?? "") === CLEARED_DRAFT_STATUS &&
    toTimestamp(existingUpdatedAt) > latestKnownClientTimestamp
  ) {
    return {
      ok: false,
      updatedAt: existingUpdatedAt ?? undefined,
      isCleared: true,
      clearedAt: existingUpdatedAt,
    };
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from(INPUT_BIAYA_DRAFT_TABLE).upsert(
    {
      user_id: input.actorId,
      project_id: projectId,
      mode,
      draft_data: input.payload,
      status: ACTIVE_DRAFT_STATUS,
      updated_at: updatedAt,
    },
    {
      onConflict: "user_id,project_id,mode",
    },
  );

  if (error) {
    if (isMissingDraftTableError(error)) {
      return saveInputDraftForActor({
        actorId: input.actorId,
        draftKey: EXPENSE_INPUT_DRAFT_KEY,
        payload: input.payload,
        knownUpdatedAt: input.knownUpdatedAt,
      });
    }
    console.warn("[input-drafts] gagal menyimpan draft input biaya.", error.message);
    return { ok: false };
  }

  return { ok: true, updatedAt, isCleared: false, clearedAt: null };
}

export async function clearExpenseInputDraftForActor(
  actorId: string,
  options?: {
    projectId?: string | null;
    mode?: string | null;
  },
): Promise<SaveInputDraftResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !actorId) {
    return { ok: false };
  }

  const projectId = normalizeExpenseDraftProjectId(options?.projectId);
  const clearedAt = new Date().toISOString();
  const clearMode = async (mode: ExpenseInputDraftMode) =>
    supabase.from(INPUT_BIAYA_DRAFT_TABLE).upsert(
      {
        user_id: actorId,
        project_id: projectId,
        mode,
        draft_data: null,
        status: CLEARED_DRAFT_STATUS,
        updated_at: clearedAt,
      },
      {
        onConflict: "user_id,project_id,mode",
      },
    );

  const modes = options?.mode
    ? [normalizeExpenseDraftMode(options.mode)]
    : [...EXPENSE_INPUT_MODES];

  const results = await Promise.all(modes.map((mode) => clearMode(mode)));
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    if (isMissingDraftTableError(firstError)) {
      return clearInputDraftForActor(actorId, EXPENSE_INPUT_DRAFT_KEY);
    }
    console.warn("[input-drafts] gagal menghapus draft input biaya.", firstError.message);
    return { ok: false };
  }

  return { ok: true, updatedAt: clearedAt, isCleared: true, clearedAt };
}

export async function clearExpenseInputDraftForActorWithinTimeout(
  actorId: string,
  options?: {
    projectId?: string | null;
    mode?: string | null;
  },
  timeoutMs = 1500,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      clearExpenseInputDraftForActor(actorId, options),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
