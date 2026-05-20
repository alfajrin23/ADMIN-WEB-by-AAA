import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase";

export const EXPENSE_INPUT_DRAFT_KEY = "expense-input";
const CLEARED_DRAFT_STATE = "cleared";

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
  return code === "42P01" || message.toLowerCase().includes("user_input_drafts");
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

export async function getInputDraftForActor(
  actorId: string,
  draftKey: string,
): Promise<StoredInputDraft | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !actorId || !draftKey) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_input_drafts")
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
    .from("user_input_drafts")
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
  if (
    isClearedDraftPayload(existingPayload) &&
    toTimestamp(existingUpdatedAt) > toTimestamp(input.knownUpdatedAt)
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
  const { error } = await supabase.from("user_input_drafts").upsert(
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
  const { error } = await supabase.from("user_input_drafts").upsert(
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

export async function clearExpenseInputDraftForActor(actorId: string) {
  return clearInputDraftForActor(actorId, EXPENSE_INPUT_DRAFT_KEY);
}
