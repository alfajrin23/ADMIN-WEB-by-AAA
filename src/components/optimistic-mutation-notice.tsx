"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  OPTIMISTIC_UI_FIELD,
  type OptimisticActionResult,
} from "@/lib/optimistic-ui";

type OptimisticMutationNoticeProps = {
  message: string;
  tone: "pending" | "error" | "success";
};

type RunOptimisticMutationInput = {
  action: (formData: FormData) => Promise<OptimisticActionResult | void>;
  formData: FormData;
  pendingMessage: string;
  optimisticUpdate: () => void;
  rollback: () => void;
  onSuccess?: (result: Extract<OptimisticActionResult, { ok: true }>) => void;
};

export function useOptimisticMutation() {
  const router = useRouter();
  const [notice, setNotice] = useState<OptimisticMutationNoticeProps | null>(null);
  const isMutationPendingRef = useRef(false);
  const noticeTimeoutRef = useRef<number | null>(null);

  const showNotice = useCallback((nextNotice: OptimisticMutationNoticeProps) => {
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    setNotice(nextNotice);
    if (nextNotice.tone !== "pending") {
      noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), 3600);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current);
      }
    };
  }, []);

  const runOptimisticMutation = useCallback(
    async ({
      action,
      formData,
      pendingMessage,
      optimisticUpdate,
      rollback,
      onSuccess,
    }: RunOptimisticMutationInput) => {
      if (isMutationPendingRef.current) {
        return;
      }
      isMutationPendingRef.current = true;
      formData.set(OPTIMISTIC_UI_FIELD, "1");
      optimisticUpdate();
      showNotice({ tone: "pending", message: pendingMessage });

      try {
        const result = await action(formData);
        if (!result?.ok) {
          rollback();
          showNotice({
            tone: "error",
            message: result?.message || "Perubahan gagal disimpan. Tampilan sudah dikembalikan.",
          });
          router.refresh();
          return;
        }

        onSuccess?.(result);
        showNotice({ tone: "success", message: result.message });
        router.refresh();
      } catch {
        rollback();
        showNotice({
          tone: "error",
          message: "Koneksi ke server gagal. Tampilan sudah dikembalikan.",
        });
        router.refresh();
      } finally {
        isMutationPendingRef.current = false;
      }
    },
    [router, showNotice],
  );

  return {
    notice,
    runOptimisticMutation,
  };
}

export function OptimisticMutationNotice({
  notice,
}: {
  notice: OptimisticMutationNoticeProps | null;
}) {
  if (!notice || typeof document === "undefined") {
    return null;
  }

  const toneClass =
    notice.tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : notice.tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-blue-200 bg-blue-50 text-blue-700";

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-4 top-4 z-[120] max-w-sm rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${toneClass}`}
    >
      {notice.message}
    </div>,
    document.body,
  );
}

type OptimisticDomMutationFormProps = {
  action: (formData: FormData) => Promise<OptimisticActionResult | void>;
  children: ReactNode;
  className?: string;
  id?: string;
  pendingMessage: string;
  targetAttribute?: string;
  targetField?: string;
};

export function OptimisticDomMutationForm({
  action,
  children,
  className,
  id,
  pendingMessage,
  targetAttribute,
  targetField,
}: OptimisticDomMutationFormProps) {
  const { notice, runOptimisticMutation } = useOptimisticMutation();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLElement && submitter.dataset.bypassOptimistic === "true") {
      return;
    }
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const targetValues = targetField
      ? formData
          .getAll(targetField)
          .filter((value): value is string => typeof value === "string")
      : [];
    const targets = targetAttribute
      ? Array.from(document.querySelectorAll<HTMLElement>(`[${targetAttribute}]`)).filter((item) =>
          targetValues.includes(item.getAttribute(targetAttribute) ?? ""),
        )
      : [];
    const hiddenStates = targets.map((item) => ({ item, hidden: item.hidden }));

    void runOptimisticMutation({
      action,
      formData,
      pendingMessage,
      optimisticUpdate: () => {
        for (const target of targets) {
          target.hidden = true;
        }
      },
      rollback: () => {
        for (const { item, hidden } of hiddenStates) {
          item.hidden = hidden;
        }
      },
    });
  };

  return (
    <>
      <OptimisticMutationNotice notice={notice} />
      <form id={id} className={className} onSubmit={handleSubmit}>
        {children}
      </form>
    </>
  );
}
