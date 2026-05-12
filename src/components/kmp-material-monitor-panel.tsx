"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { CheckIcon, EyeIcon, SearchIcon } from "@/components/icons";

type KmpMaterialMonitorProject = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  detectedMaterials: string[];
  missingMaterials: string[];
  detectedCount: number;
  missingCount: number;
  recapHref: string;
};

type KmpMaterialMonitorPanelProps = {
  checklistLabels: string[];
  totalProjects: number;
  completeProjectCount: number;
  incompleteProjectCount: number;
  projects: KmpMaterialMonitorProject[];
};

type StatusFilter = "all" | "incomplete" | "complete" | "most-detected";

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export function KmpMaterialMonitorPanel({
  checklistLabels,
  totalProjects,
  completeProjectCount,
  incompleteProjectCount,
  projects,
}: KmpMaterialMonitorPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("incomplete");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = normalizeText(deferredSearchQuery);

    return projects
      .filter((project) => {
        if (statusFilter === "complete" && project.missingCount > 0) {
          return false;
        }
        if (statusFilter === "incomplete" && project.missingCount === 0) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }

        const haystack = normalizeText(
          [
            project.projectName,
            project.clientName,
            project.missingMaterials.join(" "),
            project.detectedMaterials.join(" "),
          ].join(" "),
        );
        return haystack.includes(normalizedQuery);
      })
      .slice()
      .sort((a, b) => {
        if (statusFilter === "most-detected") {
          if (b.detectedCount !== a.detectedCount) {
            return b.detectedCount - a.detectedCount;
          }
          if (a.missingCount !== b.missingCount) {
            return a.missingCount - b.missingCount;
          }
          return a.projectName.localeCompare(b.projectName, "id-ID");
        }
        if (b.missingCount !== a.missingCount) {
          return b.missingCount - a.missingCount;
        }
        if (a.missingCount === 0 && b.missingCount === 0 && b.detectedCount !== a.detectedCount) {
          return b.detectedCount - a.detectedCount;
        }
        return a.projectName.localeCompare(b.projectName, "id-ID");
      });
  }, [deferredSearchQuery, projects, statusFilter]);

  return (
    <div className="mt-4 space-y-4">
      <div className="overflow-hidden rounded-[1.6rem] border border-amber-200 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_30%),linear-gradient(135deg,rgba(255,251,235,0.98)_0%,rgba(255,247,237,0.96)_52%,rgba(255,255,255,0.98)_100%)] p-4 shadow-[0_24px_60px_rgba(180,83,9,0.09)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              Monitoring Seluruh Project KMP
            </span>
            <h3 className="mt-3 text-xl font-black tracking-[-0.04em] text-slate-950">
              Prioritaskan project yang masih belum punya input material besar
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Gunakan panel ini untuk menyaring project yang belum lengkap, mencari nama material,
              lalu lompat langsung ke rekap biaya project terkait.
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Checklist Aktif
            </p>
            <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">
              {checklistLabels.length}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">item material prioritas</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white/82 px-4 py-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Total Project
            </p>
            <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">{totalProjects}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
              Perlu Dicek
            </p>
            <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-amber-950">
              {incompleteProjectCount}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/92 px-4 py-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Sudah Lengkap
            </p>
            <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-emerald-950">
              {completeProjectCount}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Cari project / material</span>
            <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <span className="inline-flex items-center px-3 text-slate-400">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Cari nama project, material belum ada, atau material yang sudah terdeteksi"
                autoComplete="off"
                className="!border-0 !shadow-none focus:!border-0 focus:!shadow-none"
              />
            </div>
          </label>

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Filter status</span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "incomplete", label: "Perlu Dicek" },
                { key: "most-detected", label: "Terdeteksi Terbanyak" },
                { key: "all", label: "Semua" },
                { key: "complete", label: "Lengkap" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  data-ui-button="true"
                  onClick={() => setStatusFilter(item.key as StatusFilter)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                    statusFilter === item.key
                      ? item.key === "complete"
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : item.key === "most-detected"
                          ? "border-blue-700 bg-blue-700 text-white"
                        : item.key === "all"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-amber-700 bg-amber-700 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <p>
            Menampilkan {filteredProjects.length} dari {projects.length} project KMP Cianjur.
          </p>
          <div className="flex flex-wrap gap-2">
            {checklistLabels.slice(0, 5).map((label) => (
              <span
                key={label}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600"
              >
                {label}
              </span>
            ))}
            {checklistLabels.length > 5 ? (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-500">
                +{checklistLabels.length - 5} lainnya
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          Tidak ada project yang cocok dengan filter monitoring saat ini.
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filteredProjects.map((project, index) => {
            const checklistProgress = checklistLabels.length > 0
              ? Math.round((project.detectedCount / checklistLabels.length) * 100)
              : 0;

            return (
              <article
                key={project.projectId}
                className={`group relative overflow-hidden rounded-[1.45rem] border p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                  project.missingCount === 0
                    ? "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.92)_0%,rgba(255,255,255,0.98)_100%)]"
                    : "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,rgba(255,255,255,0.98)_100%)]"
                }`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.48)_42%,transparent_68%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>

                <div className="relative flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-[11px] font-bold text-white">
                        {index + 1}
                      </span>
                      <p className="text-sm font-black tracking-[-0.02em] text-slate-950">
                        {project.projectName}
                      </p>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {project.clientName ?? "Tanpa klien"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        project.missingCount === 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {project.missingCount === 0 ? "Lengkap" : `${project.missingCount} belum ada`}
                    </span>
                    <Link
                      href={project.recapHref}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-100"
                    >
                      <span className="btn-icon bg-slate-100 text-slate-700">
                        <EyeIcon />
                      </span>
                      Buka Rekap
                    </Link>
                  </div>
                </div>

                <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/80 bg-white/75 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Terdeteksi
                    </p>
                    <p className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-950">
                      {project.detectedCount}/{checklistLabels.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/75 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Progress
                    </p>
                    <p className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-950">
                      {checklistProgress}%
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/75 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Perlu Cek
                    </p>
                    <p className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-950">
                      {project.missingCount}
                    </p>
                  </div>
                </div>

                <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-white/70">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      project.missingCount === 0
                        ? "bg-[linear-gradient(90deg,#10b981_0%,#059669_100%)]"
                        : "bg-[linear-gradient(90deg,#f59e0b_0%,#f97316_100%)]"
                    }`}
                    style={{ width: `${Math.max(checklistProgress, project.detectedCount > 0 ? 12 : 4)}%` }}
                  />
                </div>

                {project.missingMaterials.length === 0 ? (
                  <div className="relative mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">
                    <span className="inline-flex items-center gap-2">
                      <span className="btn-icon bg-emerald-100 text-emerald-700">
                        <CheckIcon />
                      </span>
                      Semua material checklist sudah pernah terdeteksi di project ini.
                    </span>
                  </div>
                ) : (
                  <div className="relative mt-4 grid gap-3 lg:grid-cols-[1.25fr_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
                      <p className="text-xs font-semibold text-amber-900">
                        Material yang belum terdeteksi
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {project.missingMaterials.map((label) => (
                          <span
                            key={`${project.projectId}-missing-${label}`}
                            className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-800"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white/78 p-3">
                      <p className="text-xs font-semibold text-slate-700">Sudah terdeteksi</p>
                      {project.detectedMaterials.length === 0 ? (
                        <p className="mt-2 text-[11px] text-slate-500">
                          Belum ada material checklist yang cocok pada histori biaya project ini.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {project.detectedMaterials.slice(0, 6).map((label) => (
                            <span
                              key={`${project.projectId}-detected-${label}`}
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700"
                            >
                              {label}
                            </span>
                          ))}
                          {project.detectedMaterials.length > 6 ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                              +{project.detectedMaterials.length - 6} lainnya
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
