"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EnterToNextField } from "@/components/enter-to-next-field";
import { ProjectAutocomplete } from "@/components/project-autocomplete";
import { ProjectChecklistSearch } from "@/components/project-checklist-search";
import { ProjectScopedAutocompleteInput } from "@/components/project-scoped-autocomplete-input";
import { RequesterProjectAutocompleteInput } from "@/components/requester-project-autocomplete-input";
import { RupiahInput } from "@/components/rupiah-input";
import { SaveIcon } from "@/components/icons";
import { SPECIALIST_COST_PRESETS } from "@/lib/constants";

type ProjectOption = {
  id: string;
  name: string;
  code?: string | null;
  clientName?: string | null;
};

type ExpenseCategoryOption = {
  value: string;
  label: string;
};

type RequesterProjectSuggestion = {
  requesterName: string;
  projectId: string;
  projectName: string;
  projectCode?: string | null;
  clientName?: string | null;
};

type HokProjectPreset = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  requesterName: string;
  requesterSource: "project_hok" | "project_upah" | "client_hok" | "client_upah" | "fallback";
  defaultSelected: boolean;
};

type HokProjectRow = HokProjectPreset & {
  amountRaw: string;
  selected: boolean;
};

type ExpenseInputModeFieldsProps = {
  projects: ProjectOption[];
  initialProjectId?: string;
  today: string;
  defaultExpenseCategory: string;
  expenseCategories: ExpenseCategoryOption[];
  requesterHistorySuggestions: RequesterProjectSuggestion[];
  projectClientNameById: Record<string, string | null>;
  descriptionSuggestionsForProjects: Record<string, string[]>;
  hokProjectPresets: HokProjectPreset[];
  formId?: string;
};

const STANDARD_MODE = "standard";
const HOK_MODE = "hok_kmp_cianjur";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeDigits(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  return digits.replace(/^0+(?=\d)/, "") || "0";
}

function formatThousands(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function createInitialHokRows(rows: HokProjectPreset[]): HokProjectRow[] {
  return rows.map((row) => ({
    ...row,
    amountRaw: "",
    selected: row.defaultSelected,
  }));
}

function getRequesterSourceLabel(value: HokProjectPreset["requesterSource"]) {
  if (value === "project_hok") {
    return "Histori HOK";
  }
  if (value === "project_upah") {
    return "Histori Upah";
  }
  if (value === "client_hok") {
    return "Fallback Klien HOK";
  }
  if (value === "client_upah") {
    return "Fallback Klien Upah";
  }
  return "Fallback";
}

export function ExpenseInputModeFields({
  projects,
  initialProjectId,
  today,
  defaultExpenseCategory,
  expenseCategories,
  requesterHistorySuggestions,
  projectClientNameById,
  descriptionSuggestionsForProjects,
  hokProjectPresets,
  formId = "expense-modal-form",
}: ExpenseInputModeFieldsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<typeof STANDARD_MODE | typeof HOK_MODE>(STANDARD_MODE);
  const [hokQuery, setHokQuery] = useState("");
  const [hokRows, setHokRows] = useState<HokProjectRow[]>(() => createInitialHokRows(hokProjectPresets));
  const [hokError, setHokError] = useState("");

  useEffect(() => {
    setHokRows(createInitialHokRows(hokProjectPresets));
  }, [hokProjectPresets]);

  const validateHokRows = useCallback(() => {
    const selectedRows = hokRows.filter((row) => row.selected);
    if (selectedRows.length === 0) {
      return "Pilih minimal satu project HOK yang ingin disimpan.";
    }

    const incompleteRows = selectedRows.filter((row) => {
      const amount = Number(normalizeDigits(row.amountRaw));
      return !Number.isFinite(amount) || amount <= 0;
    });
    if (incompleteRows.length > 0) {
      return `Nominal HOK wajib diisi untuk ${incompleteRows.length} project terpilih.`;
    }

    return "";
  }, [hokRows]);

  useEffect(() => {
    if (!hokError || mode !== HOK_MODE) {
      return;
    }

    const nextError = validateHokRows();
    if (!nextError) {
      setHokError("");
    }
  }, [hokError, mode, validateHokRows]);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const handleSubmit = (event: Event) => {
      if (mode !== HOK_MODE) {
        setHokError("");
        return;
      }

      const validationMessage = validateHokRows();
      if (!validationMessage) {
        setHokError("");
        return;
      }

      event.preventDefault();
      setHokError(validationMessage);
    };

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [mode, validateHokRows]);

  const normalizedHokQuery = normalizeText(hokQuery);
  const visibleHokRows = useMemo(() => {
    if (!normalizedHokQuery) {
      return hokRows;
    }

    return hokRows.filter((row) =>
      normalizeText([row.projectName, row.requesterName, row.clientName].join(" ")).includes(
        normalizedHokQuery,
      ),
    );
  }, [hokRows, normalizedHokQuery]);

  const selectedHokRows = useMemo(() => hokRows.filter((row) => row.selected), [hokRows]);
  const hokRowsMissingAmount = useMemo(
    () =>
      selectedHokRows.filter((row) => {
        const amount = Number(normalizeDigits(row.amountRaw));
        return !Number.isFinite(amount) || amount <= 0;
      }),
    [selectedHokRows],
  );
  const hokPayload = useMemo(
    () =>
      JSON.stringify(
        selectedHokRows.map((row) => ({
          projectId: row.projectId,
          amount: normalizeDigits(row.amountRaw),
        })),
      ),
    [selectedHokRows],
  );
  const isHokSubmitDisabled =
    mode === HOK_MODE &&
    (selectedHokRows.length === 0 || hokRowsMissingAmount.length > 0 || hokProjectPresets.length === 0);

  const updateHokRow = (projectId: string, patch: Partial<Pick<HokProjectRow, "selected" | "amountRaw">>) => {
    setHokRows((prev) =>
      prev.map((row) => (row.projectId === projectId ? { ...row, ...patch } : row)),
    );
  };

  const toggleAllVisibleHokRows = (selected: boolean) => {
    const visibleIds = new Set(visibleHokRows.map((row) => row.projectId));
    setHokRows((prev) =>
      prev.map((row) =>
        visibleIds.has(row.projectId)
          ? {
              ...row,
              selected,
            }
          : row,
      ),
    );
  };

  return (
    <div ref={rootRef} className="space-y-3">
      <EnterToNextField formId={formId} />
      <input type="hidden" name="expense_input_mode" value={mode} />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-700">Mode input biaya</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            data-ui-button="true"
            onClick={() => setMode(STANDARD_MODE)}
            className={`inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold ${
              mode === STANDARD_MODE
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            Form Biasa
          </button>
          <button
            type="button"
            data-ui-button="true"
            onClick={() => setMode(HOK_MODE)}
            disabled={hokProjectPresets.length === 0}
            className={`inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold ${
              mode === HOK_MODE
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Mode HOK KMP Cianjur
          </button>
        </div>
        {hokProjectPresets.length > 0 ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Mode HOK menyiapkan project klien KMP Cianjur dengan kategori <strong>Upah / Kasbon
            Tukang</strong> dan keterangan <strong>HOK</strong>.
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-amber-700">
            Belum ada project KMP Cianjur yang siap dipakai untuk mode HOK.
          </p>
        )}
      </div>

      {mode === STANDARD_MODE ? (
        <>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            Field wajib
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
            <ProjectAutocomplete
              projects={projects}
              initialProjectId={initialProjectId}
              autoFocus
            />
            <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                Masukkan data yang sama ke project lain (opsional)
              </summary>
              <p className="mt-2 text-[11px] text-slate-500">
                Data akan disimpan ke project utama di atas, plus project tambahan yang Anda centang.
              </p>
              <ProjectChecklistSearch projects={projects} inputName="project_ids" />
            </details>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Kategori</label>
              <select name="category" defaultValue={defaultExpenseCategory} required>
                {expenseCategories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal</label>
              <input type="date" name="expense_date" defaultValue={today} required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Nama pengajuan
              </label>
              <RequesterProjectAutocompleteInput
                name="requester_name"
                placeholder="Contoh: Mandor Lapangan"
                required
                suggestions={requesterHistorySuggestions}
                projectClientNameById={projectClientNameById}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
            <ProjectScopedAutocompleteInput
              name="description"
              placeholder="Contoh: KAS / MATERIAL / OPERASIONAL"
              required
              suggestionsByProject={descriptionSuggestionsForProjects}
              projectClientNameById={projectClientNameById}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <input type="hidden" name="amount_mode" value="tambah" />
              <label className="mb-1 block text-xs font-medium text-slate-500">Mode transaksi</label>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Otomatis <strong>Tambah</strong>.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Nominal biaya total
              </label>
              <RupiahInput
                name="amount"
                required
                placeholder="Contoh: 1.000.000"
                submitOnEnter
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            Field opsional
          </div>
          <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
              Rincian Baru (opsional)
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Kategori baru (opsional)
                </label>
                <input
                  name="category_custom"
                  placeholder="Isi jika ingin menambah kategori baru"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Penerima / vendor
                </label>
                <input name="recipient_name" placeholder="Opsional" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Informasi penggunaan
                </label>
                <input name="usage_info" placeholder="Contoh: OPS bensin lapangan" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Spesialis (preset)
                  </label>
                  <select name="specialist_type" defaultValue="">
                    <option value="">Pilih jika kategori Upah Tim Spesialis</option>
                    {SPECIALIST_COST_PRESETS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Spesialis (custom)
                  </label>
                  <input
                    name="specialist_type_custom"
                    placeholder="Contoh: Plumbing, Finishing, Mekanikal"
                  />
                </div>
              </div>
            </div>
          </details>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Qty</label>
              <input type="number" min={0} step={1} name="quantity" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Satuan</label>
              <input name="unit_label" placeholder="PCS / LTR / BH" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Harga satuan
              </label>
              <RupiahInput name="unit_price" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Catatan mode
            </label>
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Mode transaksi untuk form ini otomatis <strong>Tambah</strong>.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            Mode HOK aktif. Tanggal sama untuk semua project, kategori otomatis Upah / Kasbon Tukang,
            dan keterangan otomatis HOK.
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal HOK</label>
              <input type="date" name="expense_date" defaultValue={today} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Kategori</label>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Upah / Kasbon Tukang
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                HOK
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-700">Daftar project HOK KMP Cianjur</p>
                <p className="text-[11px] text-slate-500">
                  Centang project yang ikut HOK, lalu isi nominal total masing-masing project.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-ui-button="true"
                  className="button-soft button-xs"
                  onClick={() => toggleAllVisibleHokRows(true)}
                >
                  Pilih Semua Tampil
                </button>
                <button
                  type="button"
                  data-ui-button="true"
                  className="button-soft button-xs"
                  onClick={() => toggleAllVisibleHokRows(false)}
                >
                  Lepas Semua Tampil
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
              <input
                type="text"
                value={hokQuery}
                onChange={(event) => setHokQuery(event.currentTarget.value)}
                placeholder="Cari project / nama pengajuan HOK..."
                autoComplete="off"
              />
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {selectedHokRows.length} project terpilih
              </p>
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {hokRowsMissingAmount.length} nominal belum diisi
              </p>
            </div>

            <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <div className="grid min-w-[760px] grid-cols-[auto_minmax(220px,1.3fr)_minmax(220px,1fr)_180px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <span>Pilih</span>
                <span>Project</span>
                <span>Nama Pengajuan</span>
                <span>Nominal HOK</span>
              </div>
              <div className="divide-y divide-slate-100">
                {visibleHokRows.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-slate-500">Project tidak ditemukan.</div>
                ) : (
                  visibleHokRows.map((row) => {
                    const amountDisplay = row.amountRaw ? formatThousands(row.amountRaw) : "";
                    return (
                      <div
                        key={row.projectId}
                        className={`grid min-w-[760px] grid-cols-[auto_minmax(220px,1.3fr)_minmax(220px,1fr)_180px] items-start gap-3 px-3 py-3 ${
                          row.selected ? "bg-white" : "bg-slate-50/70"
                        }`}
                      >
                        <label className="mt-1 inline-flex items-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(event) =>
                              updateHokRow(row.projectId, { selected: event.currentTarget.checked })
                            }
                          />
                        </label>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{row.projectName}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {row.clientName ?? "Tanpa klien"}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{row.requesterName}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {getRequesterSourceLabel(row.requesterSource)}
                          </p>
                        </div>
                        <div>
                          <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-emerald-700 focus-within:shadow-[0_0_0_3px_rgba(5,150,105,0.14)]">
                            <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                              Rp
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={amountDisplay}
                              disabled={!row.selected}
                              onChange={(event) =>
                                updateHokRow(row.projectId, {
                                  amountRaw: normalizeDigits(event.currentTarget.value),
                                })
                              }
                              placeholder={row.selected ? "Masukkan nominal" : "Project tidak dipilih"}
                              className="w-full !rounded-none !border-0 !shadow-none focus:!border-0 focus:!shadow-none disabled:cursor-not-allowed disabled:bg-slate-100"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <input type="hidden" name="hok_rows_json" value={hokPayload} />
          {hokError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {hokError}
            </p>
          ) : null}
        </>
      )}

      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isHokSubmitDisabled}
      >
        <span className="btn-icon icon-float-soft bg-white/20 text-white">
          <SaveIcon />
        </span>
        {mode === HOK_MODE
          ? `Simpan HOK ${selectedHokRows.length > 0 ? `(${selectedHokRows.length} project)` : ""}`
          : "Simpan Biaya"}
      </button>
    </div>
  );
}
