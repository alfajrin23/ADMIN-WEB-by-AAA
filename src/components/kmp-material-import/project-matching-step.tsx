"use client";

import { formatCurrency } from "@/lib/format";
import type {
  KmpMaterialImportPreview,
  KmpMaterialImportProjectAnalysis,
} from "@/lib/kmp-material-import/types";

function statusTone(status: KmpMaterialImportProjectAnalysis["projectMatchStatus"]) {
  if (status === "exact" || status === "alias") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "suggested" || status === "ambiguous_project") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

export function ProjectMatchingStep({
  preview,
  rememberedProjectIds,
  onProjectChange,
  onRememberChange,
  onBack,
  onNext,
}: {
  preview: KmpMaterialImportPreview;
  rememberedProjectIds: Set<string>;
  onProjectChange: (sourceProjectId: string, projectId: string) => void;
  onRememberChange: (sourceProjectId: string, checked: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const unresolvedCount = preview.projects.filter(
    (project) => project.formula && !project.projectId,
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <h4 className="text-sm font-black text-slate-900">Pencocokan proyek KMP Cianjur</h4>
          <p className="mt-1 text-xs text-slate-500">
            Nama sama pada kecamatan berbeda tidak dipilih hanya berdasarkan nama desa.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold ${
            unresolvedCount > 0
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {unresolvedCount} belum cocok
        </span>
      </div>

      <div className="max-h-[58vh] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1500px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Sheet</th>
              <th className="px-3 py-2.5">Kecamatan</th>
              <th className="px-3 py-2.5">Proyek Excel</th>
              <th className="min-w-72 px-3 py-2.5">Proyek database</th>
              <th className="px-3 py-2.5 text-right">Baseline</th>
              <th className="px-3 py-2.5 text-right">Material DB</th>
              <th className="px-3 py-2.5 text-right">Material baru</th>
              <th className="px-3 py-2.5 text-right">Projected</th>
              <th className="px-3 py-2.5 text-right">REAL COST</th>
              <th className="px-3 py-2.5 text-right">Selisih</th>
              <th className="px-3 py-2.5">Ingat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {preview.projects.map((project) => (
              <tr key={project.id} className="align-top hover:bg-slate-50">
                <td className="px-3 py-3">
                  <span className={`rounded-full border px-2 py-1 font-semibold ${statusTone(project.projectMatchStatus)}`}>
                    {project.projectMatchStatus}
                  </span>
                  {project.status === "no_formula_to_analyze" ? (
                    <p className="mt-2 text-[10px] font-semibold text-slate-500">
                      tanpa formula
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-semibold text-slate-700">
                  {project.sourceSheet}
                </td>
                <td className="px-3 py-3 text-slate-700">{project.district}</td>
                <td className="px-3 py-3">
                  <p className="font-bold text-slate-900">{project.excelProjectName}</p>
                  <p className="mt-1 text-[10px] text-slate-500">{project.realCostCell}</p>
                </td>
                <td className="px-3 py-3">
                  <select
                    value={project.projectId ?? ""}
                    onChange={(event) =>
                      onProjectChange(project.id, event.currentTarget.value)
                    }
                    className="w-full min-w-64 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
                  >
                    <option value="">Pilih proyek KMP...</option>
                    {preview.projectOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                        {option.code ? ` — ${option.code}` : ""}
                      </option>
                    ))}
                  </select>
                  {project.projectCandidates.length > 0 && !project.projectId ? (
                    <p className="mt-1 text-[10px] text-amber-700">
                      Saran:{" "}
                      {project.projectCandidates
                        .slice(0, 3)
                        .map((candidate) => candidate.name)
                        .join(", ")}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right font-semibold text-slate-700">
                  {project.baselineAmount === null ? "-" : formatCurrency(project.baselineAmount)}
                </td>
                <td className="px-3 py-3 text-right font-semibold text-slate-700">
                  {formatCurrency(project.databaseMaterialTotal)}
                </td>
                <td className="px-3 py-3 text-right font-semibold text-blue-700">
                  {formatCurrency(project.candidateMaterialTotal)}
                </td>
                <td className="px-3 py-3 text-right text-slate-700">
                  {project.projectedTotal === null ? "-" : formatCurrency(project.projectedTotal)}
                </td>
                <td className="px-3 py-3 text-right text-slate-700">
                  {project.excelRealCost === null ? "-" : formatCurrency(project.excelRealCost)}
                </td>
                <td
                  className={`px-3 py-3 text-right font-bold ${
                    project.difference === 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {project.difference === null ? "-" : formatCurrency(project.difference)}
                </td>
                <td className="px-3 py-3">
                  <label className="inline-flex items-center gap-2 text-[10px] font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      disabled={!project.projectId}
                      checked={rememberedProjectIds.has(project.id)}
                      onChange={(event) =>
                        onRememberChange(project.id, event.currentTarget.checked)
                      }
                    />
                    Ingat mapping
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
          Lanjut Review Material
        </button>
      </div>
    </div>
  );
}
