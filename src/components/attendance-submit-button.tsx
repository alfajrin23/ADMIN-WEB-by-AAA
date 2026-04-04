"use client";

import { useFormStatus } from "react-dom";
import { SaveIcon } from "@/components/icons";

type AttendanceSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
};

export function AttendanceSubmitButton({
  idleLabel,
  pendingLabel,
  className,
  disabled = false,
}: AttendanceSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      className={className}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={pending}
    >
      <span className="btn-icon icon-float-soft bg-white/20 text-white">
        <SaveIcon />
      </span>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
