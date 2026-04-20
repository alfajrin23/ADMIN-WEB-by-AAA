"use client";

import Link from "next/link";
import { useRef } from "react";
import { CloseIcon, SearchIcon } from "@/components/icons";

type ExpenseDetailSearchFormProps = {
  currentProjectId?: string;
  projectSearchText?: string;
  activeView: "list" | "rekap";
  initialQuery: string;
  initialFrom: string;
  initialTo: string;
  initialYear: number | null;
  hasCriteria: boolean;
  resetHref: string;
};

export function ExpenseDetailSearchForm({
  currentProjectId,
  projectSearchText,
  activeView,
  initialQuery,
  initialFrom,
  initialTo,
  initialYear,
  hasCriteria,
  resetHref,
}: ExpenseDetailSearchFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const handleInputChange = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => formRef.current?.requestSubmit(), 500);
  };

  return (
    <form ref={formRef} action="/projects" method="get" className="space-y-2">
      <input type="hidden" name="modal" value="detail-search" />
      <input type="hidden" name="view" value={activeView} />
      {currentProjectId ? <input type="hidden" name="project" value={currentProjectId} /> : null}
      {projectSearchText?.trim() ? <input type="hidden" name="q" value={projectSearchText.trim()} /> : null}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          name="detail_q"
          defaultValue={initialQuery}
          onChange={handleInputChange}
          placeholder="Contoh: hebel, proyek gudang, 1.500.000, 13/04/2026"
          autoFocus
          autoComplete="off"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <span className="btn-icon bg-white/15 text-white">
            <SearchIcon />
          </span>
          Search
        </button>
        {hasCriteria ? (
          <Link
            href={resetHref}
            prefetch
            scroll={false}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <span className="btn-icon bg-slate-100 text-slate-600">
              <CloseIcon />
            </span>
            Reset Filter
          </Link>
        ) : null}
      </div>
      <p className="text-[11px] text-slate-500">
        Pencarian dijalankan saat tombol Search ditekan. Kata kunci bisa mencari nama project,
        nama pengaju, keterangan, kategori, vendor, dan nominal.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Dari tanggal</label>
          <input type="date" name="detail_from" defaultValue={initialFrom} onChange={handleInputChange} autoComplete="off" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Sampai tanggal</label>
          <input type="date" name="detail_to" defaultValue={initialTo} onChange={handleInputChange} autoComplete="off" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Tahun</label>
          <input
            type="number"
            inputMode="numeric"
            name="detail_year"
            min={1900}
            max={9999}
            step={1}
            defaultValue={initialYear ? String(initialYear) : ""}
            onChange={handleInputChange}
            placeholder="Contoh: 2026"
            autoComplete="off"
          />
        </div>
      </div>
    </form>
  );
}
