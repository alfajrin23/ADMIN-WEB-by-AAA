"use client";

import type { KmpMaterialImportPreview } from "@/lib/kmp-material-import/types";

type ImportSummaryStepProps = {
  preview: KmpMaterialImportPreview;
  onBack: () => void;
  onNext: () => void;
};

export function ImportSummaryStep({
  preview,
  onBack,
  onNext,
}: ImportSummaryStepProps) {
  const summaryCards = [
    ["Jumlah sheet", preview.summary.sheetCount],
    ["Sheet proyek", preview.summary.projectSheetCount],
    ["Jumlah proyek", preview.summary.projectCount],
    ["Rumus REAL COST", preview.summary.formulaCount],
    ["Tanpa rumus", preview.summary.noFormulaProjectCount],
    ["Komponen material", preview.summary.componentCount],
    ["Material dikenali", preview.summary.recognizedMaterialCount],
    ["Perlu review", preview.summary.needsReviewCount],
    ["Proyek tidak cocok", preview.summary.unmatchedProjectCount],
    ["Calon duplikat", preview.summary.duplicateCount],
    ["Error formula", preview.summary.formulaErrorCount],
    ["Material tanpa nama", preview.summary.unnamedComponentCount],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
          Analisis selesai tanpa write database
        </p>
        <h4 className="mt-2 text-lg font-black text-blue-950">{preview.fileName}</h4>
        <p className="mt-1 break-all text-xs text-blue-700">
          SHA-256: {preview.fileHash}
        </p>
        <p className="mt-2 text-xs text-blue-700">
          Sheet proyek: {preview.summary.projectSheets.join(", ") || "-"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(([label, value]) => (
          <article
            key={label}
            className={`rounded-xl border p-3 ${
              label.includes("Error") || label.includes("tidak cocok")
                ? "border-red-200 bg-red-50"
                : label.includes("review") || label.includes("Tanpa")
                  ? "border-amber-200 bg-amber-50"
                  : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">Referensi tabel material</p>
          <p className="mt-1 text-xl font-black text-slate-900">
            {preview.summary.sheetReferenceCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">Referensi lokal</p>
          <p className="mt-1 text-xl font-black text-slate-900">
            {preview.summary.localReferenceCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">Literal langsung</p>
          <p className="mt-1 text-xl font-black text-slate-900">
            {preview.summary.literalCount}
          </p>
        </div>
      </div>

      {preview.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">Peringatan file</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Kembali
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
        >
          Lanjut Pencocokan
        </button>
      </div>
    </div>
  );
}
