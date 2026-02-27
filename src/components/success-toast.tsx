"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon } from "@/components/icons";

type SuccessToastProps = {
  message: string;
  durationMs?: number;
};

export function SuccessToast({ message, durationMs = 2800 }: SuccessToastProps) {
  const [isOpen, setIsOpen] = useState(Boolean(message));
  const hasMessage = useMemo(() => message.trim().length > 0, [message]);

  useEffect(() => {
    if (!hasMessage) {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.has("success")) {
      url.searchParams.delete("success");
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, "", nextUrl);
    }

    const timer = window.setTimeout(() => {
      setIsOpen(false);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, hasMessage]);

  if (!hasMessage || !isOpen) {
    return null;
  }

  return (
    <div className="success-toast fixed right-4 top-4 z-[95] flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 shadow-lg">
      <span className="success-toast__check inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
        <CheckIcon />
      </span>
      <p className="text-sm font-semibold">{message}</p>
    </div>
  );
}
