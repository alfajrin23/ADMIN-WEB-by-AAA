import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createAttendanceAction,
  prepareAttendanceExportAction,
} from "@/app/actions";
import { AttendanceExportWorkerEditor } from "@/components/attendance-export-worker-editor";
import { AttendanceGroupedListShell } from "@/components/attendance-grouped-list-shell";
import { AttendanceSearchInput } from "@/components/attendance-search-input";
import { AttendanceSubmitButton } from "@/components/attendance-submit-button";
import { AttendanceWorkerNameInput } from "@/components/attendance-worker-name-input";
import {
  CloseIcon,
  DownloadIcon,
  ExcelIcon,
  PdfIcon,
  PlusIcon,
} from "@/components/icons";
import { ReimburseLinesInput } from "@/components/reimburse-lines-input";
import { RupiahInput } from "@/components/rupiah-input";
import { SuccessToast } from "@/components/success-toast";
import { getAttendanceWorkerPresets } from "@/lib/attendance-worker-presets";
import { SPECIALIST_TEAM_PRESETS, WORKER_TEAM_LABEL, WORKER_TEAMS } from "@/lib/constants";
import {
  canAccessAttendance,
  canExportReports,
  canManageAttendance,
  requireAuthUser,
} from "@/lib/auth";
import { getProjects, getWageRecap } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

type ModalType = "rekap-export" | "attendance-new" | "preview-export";

type AttendancePageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    project?: string;
    selected?: string | string[];
    modal?: string;
    q?: string;
    specialist_team?: string;
    success?: string;
    error?: string;
    preview_kind?: string;
    reimburse_amount?: string | string[];
    reimburse_note?: string | string[];
    specialist_team_name_global?: string;
  }>;
};

type WageRecapRow = Awaited<ReturnType<typeof getWageRecap>>["rows"][number];

const EMPTY_SPECIALIST_TEAM_FILTER = "__empty_specialist_team__";

function isDateString(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getMonthStartDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function parseSelectedIds(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.map((item) => item.trim()).filter((item) => item.length > 0)));
}

function normalizeSearchText(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeSearchText(a ?? "");
  const right = normalizeSearchText(b ?? "");
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  const rawLeft = a ?? "";
  const rawRight = b ?? "";
  if (rawLeft < rawRight) {
    return -1;
  }
  if (rawLeft > rawRight) {
    return 1;
  }
  return 0;
}

function parseQueryValueList(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).map((item) => item.trim());
}

function normalizeSpecialistTeamName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function createAttendanceReportQuery(params: {
  from: string;
  to: string;
  selectedIds: string[];
  reimburseAmounts: number[];
  reimburseNotes: string[];
  specialistTeamNameGlobal?: string;
}) {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
  });
  for (const selectedId of params.selectedIds) {
    query.append("selected", selectedId);
  }
  if (params.specialistTeamNameGlobal?.trim()) {
    query.set("specialist_team_name_global", params.specialistTeamNameGlobal.trim());
  }
  const rowCount = Math.max(params.reimburseAmounts.length, params.reimburseNotes.length);
  for (let index = 0; index < rowCount; index += 1) {
    const amount = params.reimburseAmounts[index] ?? 0;
    const note = params.reimburseNotes[index] ?? "";
    if (amount > 0) {
      query.append("reimburse_amount", String(amount));
    } else if (note.trim()) {
      query.append("reimburse_amount", "0");
    }
    if (amount > 0 || note.trim()) {
      query.append("reimburse_note", note.trim());
    }
  }
  return query.toString();
}

function createAttendanceHref(params: {
  from: string;
  to: string;
  project?: string;
  selectedIds?: string[];
  modal?: ModalType;
  searchText?: string;
  specialistTeamFilter?: string;
  success?: string;
  error?: string;
}) {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
  });
  if (params.project) {
    query.set("project", params.project);
  }
  if (params.modal) {
    query.set("modal", params.modal);
  }
  if (params.searchText?.trim()) {
    query.set("q", params.searchText.trim());
  }
  if (params.specialistTeamFilter?.trim()) {
    query.set("specialist_team", params.specialistTeamFilter.trim());
  }
  if (params.success?.trim()) {
    query.set("success", params.success.trim());
  }
  if (params.error?.trim()) {
    query.set("error", params.error.trim());
  }
  for (const selectedId of params.selectedIds ?? []) {
    query.append("selected", selectedId);
  }
  return `/attendance?${query.toString()}`;
}

function getTeamGroupMeta(row: WageRecapRow) {
  if (row.teamType === "spesialis") {
    const teamLabel = row.specialistTeamName?.trim() || "Tim Spesialis";
    return {
      key: `spesialis:${teamLabel.toLowerCase()}`,
      label: `Tim Spesialis - ${teamLabel}`,
      accent: "cyan",
    };
  }
  return {
    key: row.teamType,
    label: WORKER_TEAM_LABEL[row.teamType],
    accent: row.teamType === "laden" ? "amber" : "slate",
  };
}

function matchesSpecialistTeamFilter(row: WageRecapRow, specialistTeamFilter: string) {
  if (!specialistTeamFilter || row.teamType !== "spesialis") {
    return true;
  }
  if (specialistTeamFilter === EMPTY_SPECIALIST_TEAM_FILTER) {
    return normalizeSpecialistTeamName(row.specialistTeamName).length === 0;
  }
  return normalizeSpecialistTeamName(row.specialistTeamName) === specialistTeamFilter.toLowerCase();
}

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const user = await requireAuthUser();
  const canEdit = canManageAttendance(user);
  const canExport = canExportReports(user);
  if (!canAccessAttendance(user)) {
    redirect("/");
  }

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = isDateString(params.from) ? String(params.from) : getMonthStartDate();
  const to = isDateString(params.to) ? String(params.to) : today;
  const projectFilter = typeof params.project === "string" ? params.project : "";
  const selectedIds = parseSelectedIds(params.selected);
  const searchText = typeof params.q === "string" ? params.q : "";
  const normalizedSearchText = normalizeSearchText(searchText);
  const specialistTeamFilterRaw =
    typeof params.specialist_team === "string" ? params.specialist_team.trim() : "";
  const specialistTeamFilter =
    specialistTeamFilterRaw === EMPTY_SPECIALIST_TEAM_FILTER
      ? specialistTeamFilterRaw
      : specialistTeamFilterRaw.toLowerCase();
  const success = typeof params.success === "string" ? params.success : "";
  const error = typeof params.error === "string" ? params.error : "";
  const previewKind =
    params.preview_kind === "excel" || params.preview_kind === "pdf" ? params.preview_kind : null;
  const effectivePreviewKind = previewKind ?? "pdf";
  const reimburseAmounts = parseQueryValueList(params.reimburse_amount).map((item) => {
    const parsed = Number(item.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const reimburseNotes = parseQueryValueList(params.reimburse_note);
  const specialistTeamNameGlobal =
    typeof params.specialist_team_name_global === "string"
      ? params.specialist_team_name_global.trim()
      : "";

  const modalParam = typeof params.modal === "string" ? params.modal : "";
  let activeModal: ModalType | null =
    modalParam === "rekap-export" ||
    modalParam === "attendance-new" ||
    modalParam === "preview-export"
      ? modalParam
      : null;
  if ((activeModal === "rekap-export" || activeModal === "preview-export") && !canExport) {
    activeModal = null;
  }
  if (activeModal === "attendance-new" && !canEdit) {
    activeModal = null;
  }

  const [projects, wageRecap, selectedRecap] = await Promise.all([
    getProjects(),
    getWageRecap({
      from,
      to,
      projectId: projectFilter || undefined,
      includePaid: true,
      recapMode: "gabung",
    }),
    selectedIds.length > 0
      ? getWageRecap({
          from,
          to,
          includePaid: true,
          recapMode: "gabung",
          attendanceIds: selectedIds,
        })
      : Promise.resolve(null),
  ]);

  const workerPresets = await getAttendanceWorkerPresets();

  const specialistTeamOptions = Array.from(
    new Map(
      wageRecap.rows
        .filter((row) => row.teamType === "spesialis")
        .map((row) => {
          const teamName = row.specialistTeamName?.trim() ?? "";
          return [
            teamName ? teamName.toLowerCase() : EMPTY_SPECIALIST_TEAM_FILTER,
            teamName || "Tanpa nama tim spesialis",
          ] as const;
        }),
    ).entries(),
  )
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => compareText(a.label, b.label));

  const visibleRows = wageRecap.rows
    .filter((row) => matchesSpecialistTeamFilter(row, specialistTeamFilter))
    .filter((row) =>
      normalizedSearchText ? normalizeSearchText(row.workerName).includes(normalizedSearchText) : true,
    )
    .slice()
    .sort((a, b) => {
      const teamA = getTeamGroupMeta(a).label;
      const teamB = getTeamGroupMeta(b).label;
      if (teamA !== teamB) {
        return compareText(teamA, teamB);
      }
      if (a.workerName !== b.workerName) {
        return compareText(a.workerName, b.workerName);
      }
      if ((a.projectName ?? "") !== (b.projectName ?? "")) {
        return compareText(a.projectName ?? "", b.projectName ?? "");
      }
      return compareText(b.attendanceDate, a.attendanceDate);
    });

  const groupedRows = new Map<
    string,
    {
      key: string;
      label: string;
      accent: string;
      rows: typeof wageRecap.rows;
    }
  >();
  for (const row of visibleRows) {
    const meta = getTeamGroupMeta(row);
    if (!groupedRows.has(meta.key)) {
      groupedRows.set(meta.key, {
        key: meta.key,
        label: meta.label,
        accent: meta.accent,
        rows: [],
      });
    }
    groupedRows.get(meta.key)?.rows.push(row);
  }

  const teamOrder = ["tukang", "laden"];
  const groupedAttendance = Array.from(groupedRows.values()).sort((a, b) => {
    const indexA = teamOrder.indexOf(a.key);
    const indexB = teamOrder.indexOf(b.key);
    if (indexA >= 0 || indexB >= 0) {
      const safeA = indexA >= 0 ? indexA : teamOrder.length + 1;
      const safeB = indexB >= 0 ? indexB : teamOrder.length + 1;
      if (safeA !== safeB) {
        return safeA - safeB;
      }
    }
    return compareText(a.label, b.label);
  });

  const selectedRows = (selectedRecap?.rows ?? [])
    .filter((row) => selectedIds.includes(row.id))
    .slice()
    .sort((a, b) => {
      if (a.workerName !== b.workerName) {
        return compareText(a.workerName, b.workerName);
      }
      if ((a.projectName ?? "") !== (b.projectName ?? "")) {
        return compareText(a.projectName ?? "", b.projectName ?? "");
      }
      return compareText(a.attendanceDate, b.attendanceDate);
    });

  const hasProjects = projects.length > 0;
  const draftCount = wageRecap.rows.filter((row) => row.projectId.trim().length === 0).length;
  const specialistCount = wageRecap.rows.filter((row) => row.teamType === "spesialis").length;
  const storedDailyWageTotal = wageRecap.rows.reduce((sum, row) => sum + row.dailyWage, 0);
  const selectedPreview = selectedRows.slice(0, 5);
  const selectedProjectIds = Array.from(
    new Set(selectedRows.map((row) => row.projectId).filter((item) => item.trim().length > 0)),
  );
  const selectedSpecialistTeamNames = Array.from(
    new Set(
      selectedRows
        .filter((row) => row.teamType === "spesialis")
        .map((row) => row.specialistTeamName?.trim() ?? "")
        .filter((item) => item.length > 0),
    ),
  ).sort((a, b) => compareText(a, b));
  const exportProjectId = selectedProjectIds.length === 1 ? selectedProjectIds[0] : "";
  const exportSpecialistTeamName =
    specialistTeamNameGlobal ||
    (selectedSpecialistTeamNames.length === 1 ? selectedSpecialistTeamNames[0] : "");
  const initialReimburseRows =
    Math.max(reimburseAmounts.length, reimburseNotes.length) > 0
      ? Array.from({ length: Math.max(reimburseAmounts.length, reimburseNotes.length) }, (_, index) => ({
          amount: reimburseAmounts[index] ?? 0,
          note: reimburseNotes[index] ?? "",
        }))
      : [{ amount: 0, note: "" }];

  const reportQuery = createAttendanceReportQuery({
    from,
    to,
    selectedIds,
    reimburseAmounts,
    reimburseNotes,
    specialistTeamNameGlobal,
  });
  const pdfPreviewHref = reportQuery ? `/api/reports/wages?${reportQuery}&preview=1` : "";
  const pdfDownloadHref = reportQuery ? `/api/reports/wages?${reportQuery}` : "";
  const excelDownloadHref = reportQuery ? `/api/reports/wages/excel?${reportQuery}` : "";
  const activeDownloadHref =
    effectivePreviewKind === "excel" ? excelDownloadHref : pdfDownloadHref;
  const activeDownloadLabel =
    effectivePreviewKind === "excel" ? "Download Excel" : "Download PDF";

  const clearSpecialistFilterHref = createAttendanceHref({
    from,
    to,
    project: projectFilter || undefined,
    searchText,
  });
  const shouldShowSpecialistFilter = specialistTeamOptions.length > 0 || Boolean(specialistTeamFilter);
  const emptyAttendanceMessage = searchText
    ? specialistTeamFilter
      ? "Nama karyawan tidak ditemukan pada tim spesialis ini."
      : "Nama karyawan tidak ditemukan pada data absensi ini."
    : specialistTeamFilter
      ? "Belum ada data absensi untuk tim spesialis ini pada periode tersebut."
      : "Belum ada data absensi pada periode ini.";

  const closeModalHref = createAttendanceHref({
    from,
    to,
    project: projectFilter || undefined,
    selectedIds,
    searchText,
    specialistTeamFilter: specialistTeamFilter || undefined,
  });
  const openAttendanceModalHref = createAttendanceHref({
    from,
    to,
    project: projectFilter || undefined,
    selectedIds,
    searchText,
    specialistTeamFilter: specialistTeamFilter || undefined,
    modal: "attendance-new",
  });
  const openRecapModalHref = createAttendanceHref({
    from,
    to,
    project: projectFilter || undefined,
    selectedIds,
    searchText,
    specialistTeamFilter: specialistTeamFilter || undefined,
    modal: "rekap-export",
  });
  const returnToAttendance = closeModalHref;

  return (
    <div className="space-y-4">
      <SuccessToast message={success} />
      {error ? (
        <section className="panel border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700">{error}</p>
        </section>
      ) : null}
      {activeDataSource === "demo" ? (
        <section className="panel border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-700">
            Mode demo aktif. Data absensi dan rekap tidak disimpan permanen.
          </p>
        </section>
      ) : null}
      {activeDataSource === "excel" ? (
        <section className="panel border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">Sumber data aktif: {getStorageLabel()}</p>
        </section>
      ) : null}

      <section className="soft-card p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-3">
            <div>
              <h2 className="section-title">Daftar Data Absensi</h2>
              <p className="section-description">
                Input awal hanya menyimpan nama pekerja, tim, dan upah harian. Project, hari kerja,
                lembur, kasbon, dan tim kerja final diisi saat rekap / export.
              </p>
            </div>
            <div className="space-y-3">
              <AttendanceSearchInput initialValue={searchText} />
              {shouldShowSpecialistFilter ? (
                <form
                  action="/attendance"
                  method="get"
                  className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2.5"
                >
                  <input type="hidden" name="from" value={from} />
                  <input type="hidden" name="to" value={to} />
                  <input type="hidden" name="project" value={projectFilter} />
                  <input type="hidden" name="q" value={searchText} />
                  <div className="min-w-[220px] flex-1">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Filter tim spesialis
                    </label>
                    <select name="specialist_team" defaultValue={specialistTeamFilter}>
                      <option value="">Semua tim spesialis</option>
                      {specialistTeamOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="button-secondary button-sm sm:w-auto">Tampilkan</button>
                  {specialistTeamFilter ? (
                    <Link href={clearSpecialistFilterHref} className="button-soft button-sm sm:w-auto">
                      Reset
                    </Link>
                  ) : null}
                </form>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <Link
                href={openAttendanceModalHref}
                prefetch
                scroll={false}
                data-ui-button="true"
                className="button-primary button-sm sm:w-auto"
              >
                <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                  <PlusIcon />
                </span>
                Input Absensi
              </Link>
            ) : null}
            <form
              id="attendance-recap-selection-form"
              action="/attendance"
              method="get"
              className="hidden"
            >
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <input type="hidden" name="project" value={projectFilter} />
              <input type="hidden" name="q" value={searchText} />
              <input type="hidden" name="specialist_team" value={specialistTeamFilter} />
              <input type="hidden" name="modal" value="rekap-export" />
            </form>
            {canExport ? (
              <button
                form="attendance-recap-selection-form"
                className="button-secondary button-sm sm:w-auto"
              >
                Rekap / Export
              </button>
            ) : null}
          </div>
        </div>

        <div className="summary-strip summary-strip--compact mt-4">
          <article className="soft-card-muted summary-card">
            <span className="summary-label">Total Data</span>
            <span className="summary-note mt-1 block text-sm font-semibold text-slate-900">
              {wageRecap.rows.length} data
            </span>
          </article>
          <article className="soft-card-muted summary-card">
            <span className="summary-label">Belum Direkap</span>
            <span className="summary-note mt-1 block text-sm font-semibold text-slate-900">
              {draftCount} data
            </span>
          </article>
          <article className="soft-card-muted summary-card">
            <span className="summary-label">Tim Spesialis</span>
            <span className="summary-note mt-1 block text-sm font-semibold text-slate-900">
              {specialistCount} data
            </span>
          </article>
          <article className="soft-card-muted summary-card">
            <span className="summary-label">Upah Tersimpan</span>
            <span className="summary-note mt-1 block text-sm font-semibold text-slate-900">
              {formatCurrency(storedDailyWageTotal)}
            </span>
          </article>
        </div>

        <div className="mt-4 space-y-4">
          <AttendanceGroupedListShell
            groups={groupedAttendance}
            selectedIds={selectedIds}
            canEdit={canEdit}
            returnToAttendance={returnToAttendance}
            emptyAttendanceMessage={emptyAttendanceMessage}
          />
        </div>
      </section>

      {activeModal ? (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <Link
            href={closeModalHref}
            prefetch
            scroll={false}
            aria-label="Tutup modal"
            className="absolute inset-0 bg-slate-950/45"
          />
          <section className="modal-card panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                {activeModal === "attendance-new"
                  ? "Input Absensi"
                  : activeModal === "preview-export"
                    ? "Preview Rekap / Export"
                    : "Rekap & Export"}
              </h2>
              <div className="flex flex-wrap gap-2">
                {activeModal === "preview-export" ? (
                  <Link
                    href={openRecapModalHref}
                    prefetch
                    scroll={false}
                    data-ui-button="true"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Kembali ke Rekap
                  </Link>
                ) : null}
                <Link
                  href={closeModalHref}
                  prefetch
                  scroll={false}
                  data-ui-button="true"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  <span className="btn-icon bg-slate-100 text-slate-600">
                    <CloseIcon />
                  </span>
                  Tutup
                </Link>
              </div>
            </div>

            {activeModal === "attendance-new" ? (
              <form action={createAttendanceAction} className="mt-4 space-y-3">
                <input type="hidden" name="return_to" value={closeModalHref} />
                <input type="hidden" name="project_id" value="" />
                <input type="hidden" name="status" value="hadir" />
                <input type="hidden" name="work_days" value="1" />
                <input type="hidden" name="overtime_hours" value="0" />
                <input type="hidden" name="kasbon_amount" value="0" />
                <input type="hidden" name="notes" value="" />

                {!hasProjects ? (
                  <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Data pekerja tetap bisa diinput sekarang, tetapi project harus tersedia
                    terlebih dahulu sebelum finalisasi export.
                  </p>
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Tahap ini hanya menyimpan data mentah pekerja. Project, hari kerja, lembur,
                    kasbon, dan tim kerja final baru diisi saat rekap / export.
                  </p>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Nama pekerja</label>
                  <AttendanceWorkerNameInput
                    name="worker_name"
                    required
                    autoFocus
                    placeholder="Contoh: Andi"
                    workerOptions={workerPresets}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Tim</label>
                    <select name="team_type" defaultValue="tukang">
                      {WORKER_TEAMS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Kelompok spesialis / asal (opsional)
                    </label>
                    <input
                      name="specialist_team_name"
                      list="attendance-specialist-team-presets"
                      placeholder="Contoh: Jakarta / Cianjur - Baja"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Gunakan untuk membedakan spesialis Jakarta atau Cianjur. Tim final tetap bisa
                      diubah lagi saat rekap.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Upah harian</label>
                  <RupiahInput name="daily_wage" />
                </div>

                <datalist id="attendance-specialist-team-presets">
                  {SPECIALIST_TEAM_PRESETS.map((item) => (
                    <option key={`create-specialist-${item.value}`} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </datalist>

                <AttendanceSubmitButton
                  idleLabel="Simpan Absensi"
                  pendingLabel="Menyimpan Absensi..."
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                />
              </form>
            ) : activeModal === "rekap-export" ? (
              selectedRows.length === 0 ? (
                <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  Checklist data absensi dulu sebelum membuka finalisasi rekap.
                </p>
              ) : (
                <form id="attendance-export-form" action={prepareAttendanceExportAction} className="mt-4 space-y-4">
                  <input type="hidden" name="return_to" value={openRecapModalHref} />
                  <input type="hidden" name="from" value={from} />
                  <input type="hidden" name="to" value={to} />
                  <input type="hidden" name="project" value={projectFilter} />
                  <input type="hidden" name="q" value={searchText} />
                  {selectedIds.map((selectedId) => (
                    <input key={selectedId} type="hidden" name="selected" value={selectedId} />
                  ))}

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-700">
                      Pekerja terpilih: {selectedRows.length} data
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Setiap pekerja bisa dibagi ke beberapa project atau beberapa tim kerja final
                      pada tahap ini. Ini dipakai untuk kasus 3 hari di Ciguha dan 3 hari di
                      Cisujen, atau spesialis baja yang sementara dipindah ke sipil.
                    </p>
                    <p className="mt-2 text-xs text-slate-600">
                      Contoh pilihan: {selectedPreview.map((row) => row.workerName).join(", ")}
                      {selectedRows.length > selectedPreview.length
                        ? ` +${selectedRows.length - selectedPreview.length} lainnya`
                        : ""}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Project global (opsional)
                    </label>
                    <select name="project_id_global" defaultValue={exportProjectId}>
                      <option value="">Isi jika semua pembagian pekerja masuk project yang sama</option>
                      {projects.map((project) => (
                        <option key={`global-${project.id}`} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Setiap pembagian pekerja di bawah tetap bisa memakai project yang berbeda.
                    </p>
                    <div className="mt-3">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Tim spesialis global (opsional)
                      </label>
                      <input
                        name="specialist_team_name_global"
                        list="attendance-rekap-specialist-team-presets"
                        defaultValue={exportSpecialistTeamName}
                        placeholder="Isi jika semua pekerja spesialis masuk tim kerja yang sama"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Hanya diterapkan ke pekerja tim <strong>spesialis</strong>, dan masih bisa
                        dioverride di setiap pembagian.
                      </p>
                    </div>
                  </div>

                  <datalist id="attendance-rekap-specialist-team-presets">
                    {SPECIALIST_TEAM_PRESETS.map((item) => (
                      <option key={`export-specialist-${item.value}`} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </datalist>

                  <AttendanceExportWorkerEditor
                    rows={selectedRows}
                    projects={projects.map((project) => ({ id: project.id, name: project.name }))}
                    specialistTeamPresets={SPECIALIST_TEAM_PRESETS.map((item) => ({
                      value: item.value,
                      label: item.label,
                    }))}
                  />

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-slate-600">
                      Reimburse (bisa tambah atau hapus baris)
                    </p>
                    <ReimburseLinesInput initialRows={initialReimburseRows} />
                  </div>

                  {!hasProjects ? (
                    <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      Tambahkan data project dulu di menu Proyek & Biaya sebelum export PDF atau
                      Excel.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      name="export_kind"
                      value="pdf"
                      disabled={!hasProjects}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                        <PdfIcon />
                      </span>
                      Export PDF
                    </button>
                    <button
                      type="submit"
                      name="export_kind"
                      value="excel"
                      disabled={!hasProjects}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                        <ExcelIcon />
                      </span>
                      Export Excel
                    </button>
                  </div>
                </form>
              )
            ) : selectedRows.length === 0 ? (
              <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                Preview belum tersedia karena belum ada data rekap yang dipilih.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-medium text-blue-800">
                    Preview dokumen siap. Tanggal dokumen dibuat mengikuti hari ini, dan tombol
                    download di bawah akan menyesuaikan pilihan {effectivePreviewKind.toUpperCase()}.
                  </p>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <iframe
                    title="Preview laporan upah"
                    src={pdfPreviewHref}
                    className="h-[70vh] w-full"
                  />
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Link
                    href={openRecapModalHref}
                    prefetch
                    scroll={false}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Periksa Lagi Rekap
                  </Link>
                  <a
                    href={activeDownloadHref}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white ${
                      effectivePreviewKind === "excel"
                        ? "bg-emerald-700 hover:bg-emerald-600"
                        : "bg-indigo-700 hover:bg-indigo-600"
                    }`}
                  >
                    <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                      <DownloadIcon />
                    </span>
                    {activeDownloadLabel}
                  </a>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
