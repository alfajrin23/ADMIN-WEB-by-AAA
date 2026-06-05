"use client";

import Link, { type LinkProps } from "next/link";
import { type MouseEvent, type ReactNode } from "react";

type InstantModalLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  "data-ui-button"?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function InstantModalLink({
  children,
  onClick,
  ...props
}: InstantModalLinkProps) {
  const targetHref = typeof props.href === "string" ? props.href : String(props.href);

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

    event.preventDefault();
    window.dispatchEvent(
      new CustomEvent("admin-web:open-project-modal", {
        detail: {
          href: targetHref,
        },
      }),
    );
    window.history.pushState({}, "", targetHref);
  };

  return (
    <Link {...props} onClick={handleClick}>
      {children}
    </Link>
  );
}
