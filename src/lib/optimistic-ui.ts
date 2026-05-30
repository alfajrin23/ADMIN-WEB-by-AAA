export const OPTIMISTIC_UI_FIELD = "__optimistic_ui";

export type OptimisticActionResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export function isOptimisticUiRequest(formData: FormData) {
  return formData.get(OPTIMISTIC_UI_FIELD) === "1";
}

export function optimisticActionSuccess(message: string): OptimisticActionResult {
  return { ok: true, message };
}

export function optimisticActionError(message: string): OptimisticActionResult {
  return { ok: false, message };
}
