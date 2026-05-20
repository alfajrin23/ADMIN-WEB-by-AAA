"use server";

import {
  clearExpenseInputDraftForActor,
  EXPENSE_INPUT_DRAFT_KEY,
  getInputDraftForActor,
  saveInputDraftForActor,
  type StoredInputDraft,
} from "@/lib/input-drafts";
import { requireAuthUser } from "@/lib/auth";

function toDraftPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export async function getExpenseInputDraftAction(): Promise<StoredInputDraft | null> {
  const actor = await requireAuthUser();
  return getInputDraftForActor(actor.id, EXPENSE_INPUT_DRAFT_KEY);
}

export async function saveExpenseInputDraftAction(payload: unknown) {
  const actor = await requireAuthUser();
  const draftPayload = toDraftPayload(payload);
  if (!draftPayload) {
    return { ok: false };
  }
  const { serverKnownUpdatedAt, ...persistedPayload } = draftPayload;
  return saveInputDraftForActor({
    actorId: actor.id,
    draftKey: EXPENSE_INPUT_DRAFT_KEY,
    payload: persistedPayload,
    knownUpdatedAt: typeof serverKnownUpdatedAt === "string" ? serverKnownUpdatedAt : null,
  });
}

export async function clearExpenseInputDraftAction() {
  const actor = await requireAuthUser();
  return clearExpenseInputDraftForActor(actor.id);
}
