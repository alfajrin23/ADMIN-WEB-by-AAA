"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/icons";

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

type ExpenseDetailSearchFormInnerProps = Omit<ExpenseDetailSearchFormProps, "initialYear"> & {
  initialSignature: string;
  initialYearValue: string;
};

function buildSearchSignature(params: {
  query: string;
  from: string;
  to: string;
  year: string;
}) {
  return JSON.stringify({
    query: params.query.trim(),
    from: params.from,
    to: params.to,
    year: params.year.replace(/\D/g, "").slice(0, 4),
  });
}

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
  const initialYearValue = initialYear ? String(initialYear) : "";
  const initialSignature = buildSearchSignature({
    query: initialQuery,
    from: initialFrom,
    to: initialTo,
    year: initialYearValue,
  });

  return (
    <ExpenseDetailSearchFormInner
      key={initialSignature}
      currentProjectId={currentProjectId}
      projectSearchText={projectSearchText}
      activeView={activeView}
      initialQuery={initialQuery}
      initialFrom={initialFrom}
      initialTo={initialTo}
      hasCriteria={hasCriteria}
      resetHref={resetHref}
      initialSignature={initialSignature}
      initialYearValue={initialYearValue}
    />
  );
}

function ExpenseDetailSearchFormInner({
  currentProjectId,
  projectSearchText,
  activeView,
  initialQuery,
  initialFrom,
  initialTo,
  hasCriteria,
  resetHref,
  initialSignature,
  initialYearValue,
}: ExpenseDetailSearchFormInnerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<number | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [year, setYear] = useState(initialYearValue);
  const lastAppliedSignatureRef = useRef(initialSignature);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const normalizedYear = year.replace(/\D/g, "").slice(0, 4);
    const nextSignature = buildSearchSignature({
      query,
      from,
      to,
      year: normalizedYear,
    });
    if (nextSignature === lastAppliedSignatureRef.current) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("modal", "detail-search");
      params.set("view", activeView);

      if (currentProjectId) {
        params.set("project", currentProjectId);
      } else {
        params.delete("project");
      }

      const trimmedProjectSearch = projectSearchText?.trim() ?? "";
      if (trimmedProjectSearch) {
        params.set("q", trimmedProjectSearch);
      } else {
        params.delete("q");
      }

      const trimmedQuery = query.trim();
      if (trimmedQuery) {
        params.set("detail_q", trimmedQuery);
      } else {
        params.delete("detail_q");
      }

      if (from) {
        params.set("detail_from", from);
      } else {
        params.delete("detail_from");
      }

      if (to) {
        params.set("detail_to", to);
      } else {
        params.delete("detail_to");
      }

      if (normalizedYear.length === 4) {
        params.set("detail_year", normalizedYear);
      } else {
        params.delete("detail_year");
      }

      const queryText = params.toString();
      router.replace(queryText ? `${pathname}?${queryText}` : pathname, {
        scroll: false,
      });
      lastAppliedSignatureRef.current = nextSignature;
    }, 220);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [activeView, currentProjectId, from, pathname, projectSearchText, query, router, searchParams, to, year]);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Contoh: hebel, proyek gudang, 1.500.000, 13/04/2026"
          autoFocus
          autoComplete="off"
        />
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
        Hasil muncul otomatis saat Anda mengetik atau mengubah filter. Kata kunci juga bisa
        mencari tanggal, nama pengaju, project, keterangan, vendor, dan nominal.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Dari tanggal</label>
          <input
            type="date"
            name="detail_from"
            value={from}
            onChange={(event) => setFrom(event.currentTarget.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Sampai tanggal</label>
          <input
            type="date"
            name="detail_to"
            value={to}
            onChange={(event) => setTo(event.currentTarget.value)}
            autoComplete="off"
          />
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
            value={year}
            onChange={(event) => setYear(event.currentTarget.value)}
            placeholder="Contoh: 2026"
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
}
