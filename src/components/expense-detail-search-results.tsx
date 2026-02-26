"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EyeIcon } from "@/components/icons";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ProjectExpenseSearchResult } from "@/lib/types";

type ExpenseDetailSearchResultsProps = {
  results: ProjectExpenseSearchResult[];
  projectSearchText?: string;
};

function normalizeFilterQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getDigits(value: string) {
  return value.replace(/\D/g, "");
}

function buildLocalSearchHaystack(item: ProjectExpenseSearchResult) {
  const absoluteAmount = Math.round(Math.abs(item.amount));
  const groupedAmount = absoluteAmount.toLocaleString("id-ID");
  return [
    item.projectName,
    item.requesterName ?? "",
    item.description ?? "",
    item.usageInfo ?? "",
    String(item.amount),
    String(absoluteAmount),
    groupedAmount,
    `rp ${groupedAmount}`,
    `rp${groupedAmount}`,
  ]
    .join(" ")
    .toLowerCase();
}

function createRekapHref(projectId: string, projectSearchText?: string) {
  const query = new URLSearchParams();
  query.set("project", projectId);
  query.set("view", "rekap");
  const trimmedSearchText = projectSearchText?.trim();
  if (trimmedSearchText) {
    query.set("q", trimmedSearchText);
  }
  return `/projects?${query.toString()}`;
}

export function ExpenseDetailSearchResults({
  results,
  projectSearchText,
}: ExpenseDetailSearchResultsProps) {
  const [filterQuery, setFilterQuery] = useState("");

  const filteredResults = useMemo(() => {
    const normalizedFilterQuery = normalizeFilterQuery(filterQuery);
    if (!normalizedFilterQuery) {
      return results;
    }

    const queryDigits = getDigits(normalizedFilterQuery);
    return results.filter((item) => {
      if (buildLocalSearchHaystack(item).includes(normalizedFilterQuery)) {
        return true;
      }
      if (!queryDigits) {
        return false;
      }
      const amountDigits = getDigits(String(Math.round(Math.abs(item.amount))));
      return amountDigits.includes(queryDigits);
    });
  }, [filterQuery, results]);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <label className="mb-1 block text-xs font-semibold text-slate-600">Filter hasil pencarian</label>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.currentTarget.value)}
            placeholder="Contoh: 1.500.000, semen, baut 8 mm"
            autoComplete="off"
          />
          {filterQuery ? (
            <button
              type="button"
              onClick={() => setFilterQuery("")}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Reset Filter
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Menampilkan {filteredResults.length} dari {results.length} data.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-500">
              <th className="w-[120px] border border-slate-200 px-3 py-2 font-medium">Tanggal</th>
              <th className="w-[180px] border border-slate-200 px-3 py-2 font-medium">Project</th>
              <th className="w-[160px] border border-slate-200 px-3 py-2 font-medium">Nama Pengaju</th>
              <th className="border border-slate-200 px-3 py-2 font-medium">Keterangan</th>
              <th className="w-[140px] border border-slate-200 px-3 py-2 text-right font-medium">Nominal</th>
              <th className="w-[120px] border border-slate-200 px-3 py-2 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.map((item) => (
              <tr key={item.expenseId}>
                <td className="border border-slate-200 px-3 py-2 align-top">{formatDate(item.expenseDate)}</td>
                <td className="border border-slate-200 px-3 py-2 align-top font-medium text-slate-900">
                  {item.projectName}
                </td>
                <td className="border border-slate-200 px-3 py-2 align-top">{item.requesterName ?? "-"}</td>
                <td className="border border-slate-200 px-3 py-2 align-top">
                  <p>{item.description ?? "-"}</p>
                  <p className="text-xs text-slate-500">{item.usageInfo ?? "-"}</p>
                </td>
                <td
                  className={`border border-slate-200 px-3 py-2 text-right font-semibold ${
                    item.amount < 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {formatCurrency(item.amount)}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-right align-top">
                  <Link
                    href={createRekapHref(item.projectId, projectSearchText)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                  >
                    <span className="btn-icon bg-blue-100 text-blue-700">
                      <EyeIcon />
                    </span>
                    Lihat Rekap
                  </Link>
                </td>
              </tr>
            ))}
            {filteredResults.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-slate-200 px-3 py-4 text-center text-slate-500">
                  Tidak ada data yang cocok dengan filter hasil.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
