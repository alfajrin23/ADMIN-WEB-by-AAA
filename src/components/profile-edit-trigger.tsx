"use client";

import { useState } from "react";
import { ProfileEditModal } from "@/components/profile-edit-modal";

export function ProfileEditTrigger({ defaultFullName }: { defaultFullName: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200/60 text-slate-600 hover:bg-slate-900 hover:text-white transition-colors ml-auto"
        title="Edit Profil"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
        </svg>
      </button>

      <ProfileEditModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        defaultFullName={defaultFullName}
      />
    </>
  );
}
