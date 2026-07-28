"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  analyzeKmpMaterialExcelAction,
  commitKmpMaterialExcelImportAction,
} from "@/app/actions/kmp-material-import.action";
import { ImportResultStep } from "@/components/kmp-material-import/import-result-step";
import { ImportReviewStep } from "@/components/kmp-material-import/import-review-step";
import { ImportSummaryStep } from "@/components/kmp-material-import/import-summary-step";
import { ImportUploadStep } from "@/components/kmp-material-import/import-upload-step";
import { ProjectMatchingStep } from "@/components/kmp-material-import/project-matching-step";
import { formatCurrency } from "@/lib/format";
import type {
  KmpMaterialImportCommitResult,
  KmpMaterialImportDecision,
  KmpMaterialImportNewMaster,
  KmpMaterialImportPreview,
  KmpMaterialImportSplitPart,
  KmpMaterialImportTerm,
} from "@/lib/kmp-material-import/types";
import {
  KMP_MATERIAL_IMPORT_MAX_FILE_SIZE,
  validateExpenseDate,
} from "@/lib/kmp-material-import/validators";

const STEPS = [
  "Upload File",
  "Analisis",
  "Pencocokan",
  "Review",
  "Konfirmasi Simpan",
  "Hasil Import",
] as const;

function updatePreviewTerms(
  preview: KmpMaterialImportPreview,
  termIds: Set<string>,
  patch: Partial<KmpMaterialImportTerm>,
) {
  return {
    ...preview,
    projects: preview.projects.map((project) => ({
      ...project,
      terms: project.terms.map((term) =>
        termIds.has(term.id) ? { ...term, ...patch } : term,
      ),
    })),
  };
}

export function KmpMaterialImportDialog({
  open,
  today,
  onClose,
  onImported,
}: {
  open: boolean;
  today: string;
  onClose: () => void;
  onImported?: () => void | Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<KmpMaterialImportPreview | null>(null);
  const [result, setResult] = useState<KmpMaterialImportCommitResult | null>(null);
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [expenseDate, setExpenseDate] = useState(today);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [ignoredReasons, setIgnoredReasons] = useState<Record<string, string>>({});
  const [splitByTermId, setSplitByTermId] = useState<
    Record<string, KmpMaterialImportSplitPart[]>
  >({});
  const [rememberedProjectIds, setRememberedProjectIds] = useState<Set<string>>(
    new Set(),
  );
  const [rememberedMaterialTermIds, setRememberedMaterialTermIds] = useState<
    Set<string>
  >(new Set());
  const [confirmedWarningProjectIds, setConfirmedWarningProjectIds] = useState<
    Set<string>
  >(new Set());
  const [newMasters, setNewMasters] = useState<KmpMaterialImportNewMaster[]>([]);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const reset = () => {
    setStep(0);
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
    setIsAnalyzing(false);
    setIsCommitting(false);
    setExpenseDate(today);
    setBulkSelectedIds(new Set());
    setIgnoredReasons({});
    setSplitByTermId({});
    setRememberedProjectIds(new Set());
    setRememberedMaterialTermIds(new Set());
    setConfirmedWarningProjectIds(new Set());
    setNewMasters([]);
  };

  const close = () => {
    if (isAnalyzing || isCommitting) {
      return;
    }
    reset();
    onClose();
  };

  const handleFileChange = (nextFile: File | null) => {
    setError("");
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!nextFile.name.toLowerCase().endsWith(".xlsx")) {
      setError("File harus menggunakan format .xlsx.");
      setFile(null);
      return;
    }
    if (nextFile.size > KMP_MATERIAL_IMPORT_MAX_FILE_SIZE) {
      setError("Ukuran file melebihi batas 10 MB.");
      setFile(null);
      return;
    }
    setFile(nextFile);
  };

  const analyzeFile = async () => {
    if (!file) {
      setError("Pilih file Excel terlebih dahulu.");
      return;
    }
    setError("");
    setStep(1);
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await analyzeKmpMaterialExcelAction(formData);
      if (!response.success) {
        setError(response.error);
        setStep(0);
        return;
      }
      setPreview(response.preview);
      const readyIds = response.preview.projects
        .flatMap((project) => project.terms)
        .filter((term) => term.status === "ready")
        .map((term) => term.id);
      setBulkSelectedIds(new Set(readyIds));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analisis file gagal.");
      setStep(0);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateProjectMatch = (sourceProjectId: string, projectId: string) => {
    if (!preview) {
      return;
    }
    const option = preview.projectOptions.find((project) => project.id === projectId);
    setPreview({
      ...preview,
      projects: preview.projects.map((project) => {
        if (project.id !== sourceProjectId) {
          return project;
        }
        const databaseMaterialTotal = option?.databaseMaterialTotal ?? 0;
        const databaseDifference =
          project.baselineAmount === null
            ? null
            : databaseMaterialTotal - project.baselineAmount;
        const warnings = project.warnings.filter(
          (warning) =>
            warning !== "Total material database tidak sama dengan baseline pada Excel.",
        );
        if (option && databaseDifference !== null && databaseDifference !== 0) {
          warnings.push(
            "Total material database tidak sama dengan baseline pada Excel.",
          );
        }
        return {
          ...project,
          projectId: option?.id ?? null,
          projectName: option?.name ?? null,
          projectMatchStatus: option ? "exact" : "unmatched_project",
          databaseMaterialTotal,
          databaseDifference,
          warnings,
          status:
            project.status === "formula_mismatch" ||
            project.status === "unsupported_formula" ||
            project.status === "error" ||
            project.status === "no_formula_to_analyze" ||
            project.status === "needs_review_partial_material"
              ? project.status
              : option && databaseDifference !== null && databaseDifference !== 0
              ? "baseline_mismatch"
              : option
                ? "ready"
                : "unmatched_project",
          terms: project.terms.map((term) => {
            let status = term.status;
            if (!option) {
              status = "needs_project_match";
            } else if (term.status !== "error" && term.status !== "unsupported_formula") {
              if (!term.sourceLabel) {
                status = "needs_material_name";
              } else if (!term.materialKey) {
                status = term.suggestedSplit
                  ? "needs_split_review"
                  : "needs_material_mapping";
              } else if (
                term.status !== "formula_mismatch" &&
                term.status !== "needs_review_partial_material"
              ) {
                status = term.action === "update_existing" ? "will_update" : "ready";
              }
            }
            return {
              ...term,
              projectId: option?.id ?? null,
              projectName: option?.name ?? null,
              status,
              approved: option ? term.approved : false,
            };
          }),
        };
      }),
    });
  };

  const updateTerm = (termId: string, patch: Partial<KmpMaterialImportTerm>) => {
    setPreview((current) =>
      current ? updatePreviewTerms(current, new Set([termId]), patch) : current,
    );
  };

  const bulkUpdateTerms = (
    termIds: string[],
    patch: Partial<KmpMaterialImportTerm>,
  ) => {
    setPreview((current) =>
      current ? updatePreviewTerms(current, new Set(termIds), patch) : current,
    );
  };

  const updateIgnoredReason = (termId: string, reason: string | null) => {
    setIgnoredReasons((current) => {
      const next = { ...current };
      if (reason === null) {
        delete next[termId];
      } else {
        next[termId] = reason;
      }
      return next;
    });
    if (reason !== null) {
      updateTerm(termId, { approved: false });
    }
  };

  const updateSplit = (
    termId: string,
    split: KmpMaterialImportSplitPart[] | null,
  ) => {
    setSplitByTermId((current) => {
      const next = { ...current };
      if (split) {
        next[termId] = split;
      } else {
        delete next[termId];
      }
      return next;
    });
    if (split) {
      updateTerm(termId, {
        materialKey: null,
        confidence: "Manual",
        status: "ready",
        approved: true,
      });
    }
  };

  const addNewMaster = (master: KmpMaterialImportNewMaster) => {
    setNewMasters((current) => [...current, master]);
    setPreview((current) =>
      current
        ? {
            ...current,
            materials: [
              ...current.materials,
              {
                id: null,
                materialKey: master.materialKey,
                materialName: master.materialName,
                submissionName: master.submissionName,
                standardAmount: master.standardAmount,
                minimumAmount: master.minimumAmount,
                checklistType: master.checklistType,
                checklistStatus: master.checklistStatus,
                aliases: master.aliases,
                isStatic: false,
              },
            ].sort((left, right) =>
              left.materialName.localeCompare(right.materialName, "id-ID"),
            ),
          }
        : current,
    );
  };

  const confirmation = useMemo(() => {
    if (!preview) {
      return {
        rows: [] as Array<{
          key: string;
          projectId: string;
          projectName: string;
          materialKey: string;
          amount: number;
          action: KmpMaterialImportTerm["action"];
        }>,
        unresolved: [] as Array<{ projectName: string; label: string }>,
        warningProjects: [] as KmpMaterialImportPreview["projects"],
      };
    }
    const grouped = new Map<
      string,
      {
        key: string;
        projectId: string;
        projectName: string;
        materialKey: string;
        amount: number;
        action: KmpMaterialImportTerm["action"];
      }
    >();
    const selectedSourceProjectIds = new Set<string>();
    for (const project of preview.projects) {
      for (const term of project.terms) {
        if (!term.approved || ignoredReasons[term.id]?.trim() || !term.projectId) {
          continue;
        }
        selectedSourceProjectIds.add(project.id);
        const split = splitByTermId[term.id];
        const parts = split?.length
          ? split.map((part) => ({
              materialKey: part.materialKey,
              amount: part.amount,
            }))
          : term.materialKey
            ? [{ materialKey: term.materialKey, amount: term.amount }]
            : [];
        for (const part of parts) {
          const key = `${term.projectId}:${part.materialKey}`;
          const current = grouped.get(key);
          if (current) {
            current.amount += part.amount;
            if (term.action === "update_existing") {
              current.action = "update_existing";
            } else if (term.action === "skip_existing" && current.action !== "update_existing") {
              current.action = "skip_existing";
            }
          } else {
            grouped.set(key, {
              key,
              projectId: term.projectId,
              projectName: term.projectName ?? project.excelProjectName,
              materialKey: part.materialKey,
              amount: part.amount,
              action: term.action,
            });
          }
        }
      }
    }
    const unresolved: Array<{ projectName: string; label: string }> = [];
    for (const project of preview.projects) {
      if (!selectedSourceProjectIds.has(project.id)) {
        continue;
      }
      for (const term of project.terms) {
        const needsResolution =
          term.status === "needs_material_name" ||
          term.status === "needs_material_mapping" ||
          term.status === "needs_split_review" ||
          term.status === "needs_project_match" ||
          term.status === "ambiguous_project" ||
          term.status === "unmatched_project";
        const resolved =
          Boolean(term.approved && term.projectId && (term.materialKey || splitByTermId[term.id])) ||
          Boolean(ignoredReasons[term.id]?.trim());
        if (needsResolution && !resolved) {
          unresolved.push({
            projectName: project.excelProjectName,
            label: term.sourceLabel ?? formatCurrency(term.amount),
          });
        }
      }
    }
    const warningProjects = preview.projects.filter(
      (project) =>
        selectedSourceProjectIds.has(project.id) &&
        (project.status === "baseline_mismatch" ||
          project.status === "formula_mismatch" ||
          project.status === "needs_review_partial_material" ||
          project.warnings.some((warning) =>
            warning.includes("baseline pada Excel") || warning.includes("(KURANG)"),
          )),
    );
    return { rows: Array.from(grouped.values()), unresolved, warningProjects };
  }, [ignoredReasons, preview, splitByTermId]);

  const commitImport = async () => {
    if (!preview || !file || !validateExpenseDate(expenseDate)) {
      setError("File atau tanggal biaya tidak valid.");
      return;
    }
    setError("");
    setIsCommitting(true);
    const decisions: KmpMaterialImportDecision[] = preview.projects.flatMap((project) =>
      project.terms.map((term) => ({
        termId: term.id,
        approved: term.approved && !ignoredReasons[term.id]?.trim(),
        ignored: Boolean(ignoredReasons[term.id]?.trim()),
        ignoreReason: ignoredReasons[term.id]?.trim() || null,
        projectId: term.projectId,
        materialKey: term.materialKey,
        materialName: term.materialName,
        submissionName: term.submissionName,
        action: term.action,
        rememberProjectMapping: rememberedProjectIds.has(project.id),
        rememberMaterialMapping: rememberedMaterialTermIds.has(term.id),
        split: splitByTermId[term.id] ?? null,
      })),
    );
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set(
        "request_json",
        JSON.stringify({
          fileHash: preview.fileHash,
          expenseDate,
          confirmedWarningProjectIds: Array.from(confirmedWarningProjectIds),
          decisions,
          newMasters,
        }),
      );
      const response = await commitKmpMaterialExcelImportAction(formData);
      setResult(response);
      setStep(5);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Commit import gagal.");
    } finally {
      setIsCommitting(false);
    }
  };

  if (!open || !mounted) {
    return null;
  }

  const selectedProjectCount = new Set(
    confirmation.rows.map((row) => row.projectId),
  ).size;
  const totalAmount = confirmation.rows.reduce((sum, row) => sum + row.amount, 0);
  const insertCount = confirmation.rows.filter((row) => row.action === "insert_new").length;
  const updateCount = confirmation.rows.filter((row) => row.action === "update_existing").length;
  const skipCount = confirmation.rows.filter((row) => row.action === "skip_existing").length;
  const warningConfirmationMissing = confirmation.warningProjects.some(
    (project) => !confirmedWarningProjectIds.has(project.id),
  );
  const commitDisabled =
    isCommitting ||
    confirmation.rows.length === 0 ||
    confirmation.unresolved.length > 0 ||
    warningConfirmationMissing;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-4">
      <section className="flex max-h-[96vh] w-full max-w-[96rem] flex-col overflow-hidden rounded-2xl border border-white/50 bg-white shadow-2xl">
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                Import Material KMP dari Excel
              </p>
              <h3 className="mt-1 text-xl font-black text-slate-950">
                Analisis, review, dan simpan terkontrol
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Tidak ada write database sebelum langkah konfirmasi simpan.
              </p>
            </div>
            <button
              type="button"
              aria-label="Tutup import material"
              disabled={isAnalyzing || isCommitting}
              onClick={close}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              ×
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-1 sm:grid-cols-6">
            {STEPS.map((label, index) => (
              <div key={label} className="min-w-0">
                <div
                  className={`h-1.5 rounded-full ${
                    index <= step ? "bg-blue-700" : "bg-slate-200"
                  }`}
                />
                <p
                  className={`mt-1 truncate text-[9px] font-semibold sm:text-[10px] ${
                    index === step ? "text-blue-700" : "text-slate-400"
                  }`}
                  title={label}
                >
                  {index + 1}. {label}
                </p>
              </div>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {step === 0 ? (
            <ImportUploadStep
              file={file}
              error={error}
              isAnalyzing={isAnalyzing}
              onFileChange={handleFileChange}
              onAnalyze={analyzeFile}
              onCancel={close}
            />
          ) : null}

          {step === 1 && isAnalyzing ? (
            <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 p-8 text-center">
              <span className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
              <h4 className="mt-5 text-lg font-black text-blue-950">Menganalisis formula REAL COST</h4>
              <p className="mt-2 max-w-xl text-sm text-blue-700">
                Membaca formula asli, menyelesaikan referensi sel, menghitung baseline,
                mencocokkan proyek/material, dan mengecek duplikat. Belum ada data yang disimpan.
              </p>
            </div>
          ) : null}

          {step === 1 && preview && !isAnalyzing ? (
            <ImportSummaryStep
              preview={preview}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          ) : null}

          {step === 2 && preview ? (
            <ProjectMatchingStep
              preview={preview}
              rememberedProjectIds={rememberedProjectIds}
              onProjectChange={updateProjectMatch}
              onRememberChange={(projectId, checked) =>
                setRememberedProjectIds((current) => {
                  const next = new Set(current);
                  if (checked) {
                    next.add(projectId);
                  } else {
                    next.delete(projectId);
                  }
                  return next;
                })
              }
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          ) : null}

          {step === 3 && preview ? (
            <ImportReviewStep
              preview={preview}
              expenseDate={expenseDate}
              bulkSelectedIds={bulkSelectedIds}
              ignoredReasons={ignoredReasons}
              splitByTermId={splitByTermId}
              rememberedMaterialTermIds={rememberedMaterialTermIds}
              onExpenseDateChange={setExpenseDate}
              onBulkSelectionChange={setBulkSelectedIds}
              onUpdateTerm={updateTerm}
              onBulkUpdate={bulkUpdateTerms}
              onIgnore={updateIgnoredReason}
              onSplitChange={updateSplit}
              onRememberMaterialChange={(termId, checked) =>
                setRememberedMaterialTermIds((current) => {
                  const next = new Set(current);
                  if (checked) {
                    next.add(termId);
                  } else {
                    next.delete(termId);
                  }
                  return next;
                })
              }
              onAddNewMaster={addNewMaster}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          ) : null}

          {step === 4 && preview ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                {[
                  ["Proyek", selectedProjectCount],
                  ["Material", confirmation.rows.length],
                  ["Insert", insertCount],
                  ["Update", updateCount],
                  ["Skip", skipCount],
                  ["Master baru", newMasters.length],
                ].map(([label, value]) => (
                  <article key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
                  </article>
                ))}
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Total nominal
                </p>
                <p className="mt-1 text-3xl font-black text-blue-950">
                  {formatCurrency(totalAmount)}
                </p>
              </div>

              {confirmation.unresolved.length > 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-black text-red-800">
                    {confirmation.unresolved.length} komponen belum diberi nama atau diabaikan dengan alasan.
                  </p>
                  <p className="mt-1 text-xs text-red-700">
                    Proyek terkait belum dapat disimpan. Contoh:{" "}
                    {confirmation.unresolved
                      .slice(0, 8)
                      .map((item) => `${item.projectName} — ${item.label}`)
                      .join(", ")}
                  </p>
                </div>
              ) : null}

              {confirmation.warningProjects.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-black text-amber-900">
                    Konfirmasi warning proyek
                  </p>
                  <div className="mt-3 space-y-2">
                    {confirmation.warningProjects.map((project) => (
                      <label
                        key={project.id}
                        className="flex items-start gap-3 rounded-lg border border-amber-200 bg-white p-3 text-xs text-amber-900"
                      >
                        <input
                          type="checkbox"
                          checked={confirmedWarningProjectIds.has(project.id)}
                          onChange={(event) =>
                            setConfirmedWarningProjectIds((current) => {
                              const next = new Set(current);
                              if (event.currentTarget.checked) {
                                next.add(project.id);
                              } else {
                                next.delete(project.id);
                              }
                              return next;
                            })
                          }
                        />
                        <span>
                          <strong>{project.excelProjectName}</strong>:{" "}
                          {project.warnings.join(" ")}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {error}
                </p>
              ) : null}

              <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Proyek</th>
                      <th className="px-3 py-2">Material key</th>
                      <th className="px-3 py-2">Aksi</th>
                      <th className="px-3 py-2 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {confirmation.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-3 py-2 font-semibold text-slate-800">{row.projectName}</td>
                        <td className="px-3 py-2 text-slate-600">{row.materialKey}</td>
                        <td className="px-3 py-2 text-slate-600">{row.action}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">
                          {formatCurrency(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap justify-between gap-2">
                <button
                  type="button"
                  disabled={isCommitting}
                  onClick={() => setStep(3)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50"
                >
                  Kembali ke Review
                </button>
                <button
                  type="button"
                  disabled={commitDisabled}
                  onClick={commitImport}
                  className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCommitting
                    ? "Memvalidasi ulang dan menyimpan..."
                    : `Simpan ${confirmation.rows.length} Material yang Disetujui`}
                </button>
              </div>
            </div>
          ) : null}

          {step === 5 && result ? (
            <ImportResultStep
              result={result}
              onRestart={reset}
              onClose={async () => {
                await onImported?.();
                reset();
                onClose();
              }}
            />
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
