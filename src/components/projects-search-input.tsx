"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { CloseIcon } from "@/components/icons";

type ProjectsSearchInputProps = {
  initialValue: string;
  placeholder?: string;
};

export function ProjectsSearchInput({
  initialValue,
  placeholder = "Cari nama project, kode, klien, atau status",
}: ProjectsSearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<number | null>(null);
  const lastAppliedQuery = useRef(initialValue.trim());

  useEffect(() => {
    lastAppliedQuery.current = initialValue.trim();
  }, [initialValue]);

  const applySearch = (value: string) => {
    const trimmed = value.trim();
    if (trimmed === lastAppliedQuery.current) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }

    const queryText = params.toString();
    router.replace(queryText ? `${pathname}?${queryText}` : pathname, { scroll: false });
    lastAppliedQuery.current = trimmed;
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <div className="w-full max-w-md">
        <input
          key={initialValue}
          defaultValue={initialValue}
          onChange={(event) => {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }
            const nextValue = event.currentTarget.value;
            timeoutRef.current = window.setTimeout(() => applySearch(nextValue), 220);
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
      </div>
      {initialValue ? (
        <button
          type="button"
          onClick={() => applySearch("")}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          <span className="btn-icon bg-slate-100 text-slate-600">
            <CloseIcon />
          </span>
          Reset
        </button>
      ) : null}
    </div>
  );
}
