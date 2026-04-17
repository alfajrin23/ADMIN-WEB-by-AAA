"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateProfileAction } from "@/app/auth-actions";
import { CloseIcon, SaveIcon } from "@/components/icons";
import { PasswordRevealInput } from "@/components/password-reveal-input";

export type ProfileEditModalProps = {
  isOpen: boolean;
  onClose: () => void;
  defaultFullName: string;
};

type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export function ProfileEditModal({ isOpen, onClose, defaultFullName }: ProfileEditModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [successMsg, setSuccessMsg] = useState("");

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (prevState, formData) => {
      setSuccessMsg("");
      const result = await updateProfileAction(formData);
      if (result.ok) {
        setSuccessMsg(result.message || "Tersimpan");
        setTimeout(() => {
          onClose();
        }, 1500);
      }
      return result;
    },
    {},
  );

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm p-0 m-auto mt-20 md:mt-32 w-full max-w-sm rounded-2xl bg-white shadow-2xl open:animate-in open:fade-in open:zoom-in-95"
      onClose={onClose}
    >
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <h2 className="text-base font-semibold text-slate-900">Edit Profil Anda</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <form action={formAction} className="p-4 space-y-4">
        {state.error && (
          <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600 border border-rose-100">
            {state.error}
          </div>
        )}
        {successMsg && (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-600 border border-emerald-100">
            {successMsg}
          </div>
        )}

        <div className="space-y-1.5 mt-2">
          <label htmlFor="full_name" className="text-sm font-medium text-slate-700">
            Nama Lengkap
          </label>
          <input
            type="text"
            id="full_name"
            name="full_name"
            defaultValue={defaultFullName}
            required
            className="input"
            autoComplete="name"
          />
        </div>

        <div className="space-y-1.5">
          <PasswordRevealInput
            name="password"
            label="Password Baru (Opsional)"
            placeholder="Kosongkan jika tidak ganti"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="button-primary w-full justify-center disabled:opacity-50"
          >
            {isPending ? "Menyimpan..." : (
              <>
                <SaveIcon className="h-4 w-4" />
                Simpan Perubahan
              </>
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
