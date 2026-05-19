import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase";

export const EXPENSE_INPUT_DRAFT_KEY = "expense-input";

export type StoredInputDraft = {
  payload: Record<string, unknown>;
  updatedAt: string;
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

  return {
    payload: data.payload as Record<string, unknown>,
    updatedAt: String(data.updated_at ?? new Date().toISOString()),
  };
}

export async function saveInputDraftForActor(input: {
  actorId: string;
  draftKey: string;
  payload: Record<string, unknown>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase || !input.actorId || !input.draftKey) {
    return;
  }

  const { error } = await supabase.from("user_input_drafts").upsert(
    {
      actor_id: input.actorId,
      draft_key: input.draftKey,
      payload: input.payload,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "actor_id,draft_key",
    },
  );

  if (error && !isMissingDraftTableError(error)) {
    console.warn("[input-drafts] gagal menyimpan draft.", error.message);
  }
}

export async function clearInputDraftForActor(actorId: string, draftKey: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase || !actorId || !draftKey) {
    return;
  }

  const { error } = await supabase
    .from("user_input_drafts")
    .delete()
    .eq("actor_id", actorId)
    .eq("draft_key", draftKey);

  if (error && !isMissingDraftTableError(error)) {
    console.warn("[input-drafts] gagal menghapus draft.", error.message);
  }
}

export async function clearExpenseInputDraftForActor(actorId: string) {
  await clearInputDraftForActor(actorId, EXPENSE_INPUT_DRAFT_KEY);
}
