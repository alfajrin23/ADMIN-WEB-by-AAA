"use client";

import { useCallback, useEffect, useId, useState, type MouseEvent, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";

type ConfirmActionButtonProps = {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  modalTitle?: string;
  modalDescription?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export function ConfirmActionButton({
  children,
  className,
  disabled = false,
  modalTitle = "Konfirmasi Hapus Data",
  modalDescription = "Yakin ingin menghapus data ini?",
  confirmLabel = "Ya, Hapus",
  cancelLabel = "Tidak",
}: ConfirmActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [targetForm, setTargetForm] = useState<HTMLFormElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTargetForm(null);
  }, []);

  const handleConfirm = useCallback(() => {
    const form = targetForm;
    handleClose();
    if (!form) {
      return;
    }
    form.requestSubmit();
  }, [handleClose, targetForm]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      event.preventDefault();
      handleConfirm();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, handleConfirm, isOpen]);

  const handleOpen = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    setTargetForm(event.currentTarget.form);
    setIsOpen(true);
  };

  return (
    <>
      <button type="button" disabled={disabled} className={className} onClick={handleOpen}>
        {children}
      </button>
      {isOpen ? (
        <div className="modal-overlay fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Tutup konfirmasi"
            className="absolute inset-0 bg-slate-950/45"
            onClick={handleClose}
          />
          <section
            aria-modal="true"
            role="dialog"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="modal-card panel relative z-10 w-full max-w-md p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 id={titleId} className="text-base font-semibold text-slate-900">
                {modalTitle}
              </h3>
              <button
                type="button"
                data-ui-button="true"
                aria-label="Tutup dialog"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                onClick={handleClose}
              >
                <span className="btn-icon bg-slate-100 text-slate-600">
                  <CloseIcon />
                </span>
                Tutup
              </button>
            </div>
            <p id={descId} className="mt-3 text-sm text-slate-600">
              {modalDescription}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                data-ui-button="true"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={handleClose}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                data-ui-button="true"
                className="inline-flex items-center justify-center rounded-xl bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-600"
                onClick={handleConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
