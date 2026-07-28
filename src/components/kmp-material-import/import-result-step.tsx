"use client";

import { formatCurrency } from "@/lib/format";
import type { KmpMaterialImportCommitResult } from "@/lib/kmp-material-import/types";

export function ImportResultStep({
  result,
  onClose,
  onRestart,
}: {
  result: KmpMaterialImportCommitResult;
  onClose: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border p-5 ${
          result.failed_count > 0
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
          Hasil Import
        </p>
        <h4 className="mt-2 text-xl font-black text-slate-950">{result.message}</h4>
        <p className="mt-2 text-sm text-slate-600">
          Total berhasil: {formatCurrency(result.total_nominal_success)}. Total gagal:{" "}
          {formatCurrency(result.total_nominal_failed)}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Insert", result.inserted_count, "emerald"],
          ["Update", result.updated_count, "blue"],
          ["Skip", result.skipped_count, "slate"],
          ["Gagal", result.failed_count, "red"],
          ["Master baru", result.created_master_count, "violet"],
        ].map(([label, value, tone]) => (
          <article
            key={String(label)}
            className={`rounded-xl border p-3 ${
              tone === "red"
                ? "border-red-200 bg-red-50"
                : tone === "emerald"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
          </article>
        ))}
      </div>

      {result.failed_projects.length > 0 ? (
        <div className="max-h-60 overflow-auto rounded-xl border border-red-200">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="sticky top-0 bg-red-50 text-red-800">
              <tr>
                <th className="px-3 py-2">Proyek</th>
                <th className="px-3 py-2">Alasan</th>
                <th className="px-3 py-2 text-right">Nominal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100 bg-white">
              {result.failed_projects.map((item, index) => (
                <tr key={`${item.termId ?? item.projectId}-${index}`}>
                  <td className="px-3 py-2 font-semibold text-slate-800">
                    {item.projectName}
                  </td>
                  <td className="px-3 py-2 text-red-700">{item.reason}</td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Import File Lain
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
        >
          Tutup dan Muat Ulang
        </button>
      </div>
    </div>
  );
}
