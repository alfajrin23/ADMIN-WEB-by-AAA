"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type InstantModalLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  "data-ui-button"?: string;
  loadingLabel?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function InstantModalLink({
  children,
  loadingLabel = "Membuka modal...",
  onClick,
  ...props
}: InstantModalLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingHref, setPendingHref] = useState("");
  const currentQuery = searchParams.toString();
  const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname;
  const targetHref = typeof props.href === "string" ? props.href : String(props.href);
  const isLoading = Boolean(pendingHref && pendingHref !== currentHref);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    setPendingHref(targetHref);
  };

  return (
    <>
      <Link {...props} onClick={handleClick}>
        {children}
      </Link>
      {isLoading && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4">
              <div
                role="status"
                aria-live="polite"
                className="modal-card w-full max-w-sm rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 shadow-xl"
              >
                {loadingLabel}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
