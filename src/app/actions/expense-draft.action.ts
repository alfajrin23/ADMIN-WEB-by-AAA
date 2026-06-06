"use server";

import {
  clearExpenseInputDraftForActor,
  EXPENSE_INPUT_DRAFT_KEY,
  getExpenseInputDraftForActor,
  getInputDraftForActor,
  saveExpenseInputDraftForActor,
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

function getDraftScope(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const input = value as Record<string, unknown>;
  return {
    projectId: typeof input.projectId === "string" ? input.projectId : null,
    mode: typeof input.mode === "string" ? input.mode : null,
  };
}

export async function getExpenseInputDraftAction(scope?: unknown): Promise<StoredInputDraft | null> {
  const actor = await requireAuthUser();
  const { projectId, mode } = getDraftScope(scope);
  if (projectId || mode) {
    return getExpenseInputDraftForActor({ actorId: actor.id, projectId, mode });
  }
  return getInputDraftForActor(actor.id, EXPENSE_INPUT_DRAFT_KEY);
}

export async function saveExpenseInputDraftAction(payload: unknown) {
  const actor = await requireAuthUser();
  const draftPayload = toDraftPayload(payload);
  if (!draftPayload) {
    return { ok: false };
  }
  const { serverKnownUpdatedAt, draftProjectId, draftMode, ...persistedPayload } = draftPayload;
  if (typeof draftProjectId === "string" || typeof draftMode === "string") {
    return saveExpenseInputDraftForActor({
      actorId: actor.id,
      projectId: typeof draftProjectId === "string" ? draftProjectId : null,
      mode: typeof draftMode === "string" ? draftMode : null,
      payload: persistedPayload,
      knownUpdatedAt: typeof serverKnownUpdatedAt === "string" ? serverKnownUpdatedAt : null,
    });
  }
  return saveInputDraftForActor({
    actorId: actor.id,
    draftKey: EXPENSE_INPUT_DRAFT_KEY,
    payload: persistedPayload,
    knownUpdatedAt: typeof serverKnownUpdatedAt === "string" ? serverKnownUpdatedAt : null,
  });
}

export async function clearExpenseInputDraftAction(scope?: unknown) {
  const actor = await requireAuthUser();
  const { projectId, mode } = getDraftScope(scope);
  return clearExpenseInputDraftForActor(actor.id, { projectId, mode });
}
