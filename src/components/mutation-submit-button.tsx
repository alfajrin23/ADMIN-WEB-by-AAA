"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

type MutationSubmitButtonProps = {
  children: ReactNode;
  className: string;
  pendingLabel: string;
};

export function MutationSubmitButton({
  children,
  className,
  pendingLabel,
}: MutationSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
