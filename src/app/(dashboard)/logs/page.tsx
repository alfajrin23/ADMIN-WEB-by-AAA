import Link from "next/link";
import { updateActivityLogAction } from "@/app/actions";
import { updateUserRoleAction } from "@/app/auth-actions";
import { CloseIcon, EditIcon, EyeIcon, FilterIcon, RolesIcon, SaveIcon } from "@/components/icons";
import { type ActivityLog, getActivityLogs } from "@/lib/activity-logs";
import {
  canEditRoles,
  canManageModule,
  getAppUsers,
  requireLogsUser,
  ROLE_LABEL,
} from "@/lib/auth";
import { getRoleCatalog } from "@/lib/role-store";

type LogsPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
    log?: string;
    mode?: string;
    from?: string;
    to?: string;
  }>;
};

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function formatPayload(payload: Record<string, unknown> | null) {
  if (!payload) {
    return "-";
  }
  const text = JSON.stringify(payload);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function formatPayloadJson(payload: Record<string, unknown> | null) {
  if (!payload) {
    return "";
  }
  return JSON.stringify(payload, null, 2);
}

function toPayloadEntries(payload: Record<string, unknown> | null) {
  if (!payload) {
    return [];
  }
  return Object.entries(payload).map(([key, value]) => ({
    key,
    value:
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value),
  }));
}

function parseDateFilter(value: string | undefined) {
  if (!value) {
    return "";
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function createLogsHref(params: {
  fromDate?: string;
  toDate?: string;
  logId?: string;
  mode?: "view" | "edit";
}) {
  const query = new URLSearchParams();
  if (params.fromDate) {
    query.set("from", params.fromDate);
  }
  if (params.toDate) {
    query.set("to", params.toDate);
  }
  if (params.logId) {
    query.set("log", params.logId);
  }
  if (params.mode) {
    query.set("mode", params.mode);
  }
  const queryText = query.toString();
  return queryText ? `/logs?${queryText}` : "/logs";
}

function getPayloadString(payload: Record<string, unknown> | null, key: string) {
  if (!payload) {
    return "";
  }
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function getPayloadStringArray(payload: Record<string, unknown> | null, key: string) {
  if (!payload) {
    return [];
  }
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getLogEntityEditHref(log: ActivityLog) {
  const primaryProjectId = getPayloadString(log.payload, "project_id");
  const secondaryProjectIds = getPayloadStringArray(log.payload, "project_ids");
  const fallbackProjectId = primaryProjectId || secondaryProjectIds[0] || "";

  if (log.module === "project") {
    if (log.entityId) {
      return `/projects/edit?id=${encodeURIComponent(log.entityId)}`;
    }
    return "/projects?modal=project-new";
  }

  if (log.module === "expense") {
    if (log.entityId) {
      return `/projects/expenses/edit?id=${encodeURIComponent(log.entityId)}`;
    }
    if (fallbackProjectId) {
      const query = new URLSearchParams({
        view: "rekap",
        project: fallbackProjectId,
        modal: "expense-new",
      });
      return `/projects?${query.toString()}`;
    }
    return "/projects?modal=expense-new";
  }

  if (log.module === "attendance") {
    if (log.entityId) {
      return `/attendance/edit?id=${encodeURIComponent(log.entityId)}`;
    }
    if (fallbackProjectId) {
      return `/attendance?project=${encodeURIComponent(fallbackProjectId)}`;
    }
    return "/attendance";
  }

  if (log.module === "payroll") {
    if (fallbackProjectId) {
      return `/attendance?project=${encodeURIComponent(fallbackProjectId)}`;
    }
    return "/attendance";
  }

  return null;
}

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const currentUser = await requireLogsUser();
  const params = await searchParams;
  const [logs, users, roles] = await Promise.all([getActivityLogs(300), getAppUsers(), getRoleCatalog()]);
  const error = typeof params.error === "string" ? params.error : "";
  const success = typeof params.success === "string" ? params.success : "";
  const fromDate = parseDateFilter(typeof params.from === "string" ? params.from : "");
  const toDate = parseDateFilter(typeof params.to === "string" ? params.to : "");
  const filteredLogs = logs.filter((log) => {
    const logDate = log.createdAt.slice(0, 10);
    if (fromDate && logDate < fromDate) {
      return false;
    }
    if (toDate && logDate > toDate) {
      return false;
    }
    return true;
  });
  const selectedLogId = typeof params.log === "string" ? params.log : "";
  const canEditLogs = canManageModule(currentUser, "logs");
  const selectedLogMode = params.mode === "edit" && canEditLogs ? "edit" : "view";
  const selectedLog = selectedLogId ? logs.find((log) => log.id === selectedLogId) ?? null : null;
  const selectedLogEntityEditHref = selectedLog ? getLogEntityEditHref(selectedLog) : null;
  const selectedLogPayloadEntries = toPayloadEntries(selectedLog?.payload ?? null);
  const closeModalHref = createLogsHref({
    fromDate,
    toDate,
  });
  const roleEditEnabled = canEditRoles(currentUser);

  return (
    <div className="space-y-4">
      {error ? (
        <section className="panel border-rose-300 bg-rose-50 p-4">
          <p className="text-sm text-rose-700">{error}</p>
        </section>
      ) : null}
      {success ? (
        <section className="panel border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">{success}</p>
        </section>
      ) : null}

      <section className="page-hero">
        <div className="page-hero-grid xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div>
            <span className="page-eyebrow">Audit & Logs</span>
            <h1 className="page-title mt-4">
              Audit trail yang lebih cepat disaring, lebih mudah dibaca, dan tetap terhubung ke data asli.
            </h1>
            <p className="page-description mt-4">
              Lihat aktivitas input, edit, hapus, import, dan perubahan role dari satu tampilan.
              Filter tanggal, lihat payload, lalu loncat langsung ke data asal jika tersedia.
            </p>
          </div>
          <div className="hero-meta-grid">
            <article className="hero-meta-card">
              <p className="hero-meta-label">Login Sebagai</p>
              <p className="hero-meta-value">{currentUser.roleLabel}</p>
              <p className="hero-meta-note">{currentUser.fullName}</p>
            </article>
            <article className="hero-meta-card">
              <p className="hero-meta-label">Total Log</p>
              <p className="hero-meta-value">{logs.length}</p>
              <p className="hero-meta-note">Log terbaru yang dimuat</p>
            </article>
            <article className="hero-meta-card">
              <p className="hero-meta-label">Hasil Filter</p>
              <p className="hero-meta-value">{filteredLogs.length}</p>
              <p className="hero-meta-note">Berdasarkan tanggal yang dipilih</p>
            </article>
            <article className="hero-meta-card">
              <p className="hero-meta-label">User</p>
              <p className="hero-meta-value">{users.length}</p>
              <p className="hero-meta-note">Role assignment aktif</p>
            </article>
          </div>
        </div>
      </section>

      {roleEditEnabled ? (
        <section className="soft-card p-4 md:p-5">
          <div className="section-header">
            <div>
              <h2 className="section-title">Quick Role Assignment</h2>
              <p className="section-description">
                Ubah role user langsung dari halaman log, atau buka role center untuk mengelola
                matrix permission custom.
              </p>
            </div>
            <div className="section-actions">
              <Link href="/roles" className="button-secondary button-sm">
                <span className="btn-icon bg-blue-100 text-blue-700">
                  <RolesIcon />
                </span>
                Buka Role Center
              </Link>
            </div>
          </div>

          <div className="mt-5 table-card">
            <div className="data-table-shell">
              <table className="data-table data-table--sticky data-table--compact">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role Aktif</th>
                    <th className="text-right">Assign Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <p className="font-semibold text-slate-900">{user.fullName}</p>
                        <p className="mt-1 text-xs text-slate-500">@{user.username}</p>
                      </td>
                      <td>
                        <div className="pill-group">
                          <span className="badge badge-primary">{user.roleLabel}</span>
                          <span className="badge badge-neutral">{ROLE_LABEL[user.role]}</span>
                        </div>
                      </td>
                      <td>
                        <form
                          action={updateUserRoleAction}
                          className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end"
                        >
                          <input type="hidden" name="user_id" value={user.id} />
                          <input type="hidden" name="return_to" value="/logs" />
                          <select
                            name="next_role"
                            defaultValue={user.roleKey}
                            className="w-full sm:max-w-[260px]"
                            aria-label={`Ubah role ${user.fullName}`}
                          >
                            {roles.map((role) => (
                              <option key={role.key} value={role.key}>
                                {role.name}
                                {role.isSystem ? "" : ` (${ROLE_LABEL[role.derivedRole]})`}
                              </option>
                            ))}
                          </select>
                          <button className="button-secondary button-sm">
                            <span className="btn-icon bg-blue-100 text-blue-700">
                              <SaveIcon />
                            </span>
                            Simpan
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <section className="info-banner">
          <p className="info-banner__title">Role Center</p>
          <p className="info-banner__text">
            Anda bisa melihat audit log, tetapi tidak memiliki permission untuk mengubah role user.
          </p>
        </section>
      )}

      <section className="soft-card p-4 md:p-5">
        <div className="section-header">
          <div>
            <h2 className="section-title">Riwayat Aktivitas</h2>
            <p className="section-description">
              Filter berdasarkan tanggal, lalu buka detail log untuk melihat payload atau edit
              deskripsi log bila diizinkan.
            </p>
          </div>
        </div>

        <div className="toolbar-card toolbar-card--dense mt-5">
          <form method="get" className="filter-grid lg:grid-cols-[1fr_1fr_auto_auto]">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Dari tanggal
              </label>
              <input type="date" name="from" defaultValue={fromDate} />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Sampai tanggal
              </label>
              <input type="date" name="to" defaultValue={toDate} />
            </div>
            <button data-ui-button="true" className="button-primary button-sm lg:self-end">
              <span className="btn-icon bg-white/15 text-white">
                <FilterIcon />
              </span>
              Filter
            </button>
            <Link href="/logs" data-ui-button="true" className="button-ghost button-sm lg:self-end">
              <span className="btn-icon bg-slate-100 text-slate-700">
                <CloseIcon />
              </span>
              Reset
            </Link>
          </form>
        </div>

        <div className="mt-5 table-card">
          <div className="data-table-shell">
            <table className="data-table data-table--sticky data-table--compact">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>User & Aktivitas</th>
                  <th>Entitas</th>
                  <th>Deskripsi</th>
                  <th>Data</th>
                  <th className="text-right">Kelola</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const entityEditHref = getLogEntityEditHref(log);
                  return (
                    <tr key={log.id}>
                      <td className="text-slate-600">{formatDateTime(log.createdAt)}</td>
                      <td>
                        <p className="font-semibold text-slate-900">{log.actorName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {log.actorUsername ? `@${log.actorUsername}` : "-"} | {ROLE_LABEL[log.actorRole]}
                        </p>
                        <div className="pill-group mt-2">
                          <span className="badge badge-primary">{log.actionType}</span>
                          <span className="badge badge-neutral">{log.module}</span>
                        </div>
                      </td>
                      <td>
                        <p className="text-sm text-slate-900">{log.entityName ?? "-"}</p>
                        <p className="muted-code mt-1 break-all">{log.entityId ?? "-"}</p>
                      </td>
                      <td className="text-slate-700">{log.description}</td>
                      <td>
                        <div className="soft-card-muted p-3">
                          <p className="muted-code break-all">{formatPayload(log.payload)}</p>
                        </div>
                      </td>
                      <td>
                        <div className="table-actions">
                          <Link
                            href={createLogsHref({
                              fromDate,
                              toDate,
                              logId: log.id,
                              mode: "view",
                            })}
                            prefetch
                            scroll={false}
                            data-ui-button="true"
                            className="button-secondary button-xs"
                          >
                            <span className="btn-icon bg-blue-100 text-blue-700">
                              <EyeIcon />
                            </span>
                            Detail
                          </Link>
                          {entityEditHref ? (
                            <Link
                              href={entityEditHref}
                              data-ui-button="true"
                              className="button-soft button-xs"
                            >
                              <span className="btn-icon bg-slate-100 text-slate-700">
                                <EditIcon />
                              </span>
                              Edit Data
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Log tidak ditemukan untuk rentang tanggal ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {selectedLog ? (
        <div className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4">
          <Link
            href={closeModalHref}
            prefetch
            scroll={false}
            aria-label="Tutup modal log"
            className="absolute inset-0 bg-slate-950/45"
          />
          <section className="modal-card panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto p-5">
            <div className="section-header">
              <div>
                <h3 className="section-title">
                  {selectedLogMode === "edit" ? "Edit Log Aktivitas" : "Detail Log Aktivitas"}
                </h3>
                <p className="section-description">
                  {selectedLog.actionType} pada modul {selectedLog.module}.
                </p>
              </div>
              <Link
                href={closeModalHref}
                prefetch
                scroll={false}
                data-ui-button="true"
                className="button-ghost button-sm"
              >
                <span className="btn-icon bg-slate-100 text-slate-700">
                  <CloseIcon />
                </span>
                Tutup
              </Link>
            </div>

            <div className="mt-5 summary-strip">
              <article className="soft-card-muted summary-card">
                <p className="summary-label">Waktu</p>
                <p className="summary-value text-xl">{formatDateTime(selectedLog.createdAt)}</p>
              </article>
              <article className="soft-card-muted summary-card">
                <p className="summary-label">User</p>
                <p className="summary-value text-xl">{selectedLog.actorName}</p>
                <p className="summary-note">
                  {selectedLog.actorUsername ? `@${selectedLog.actorUsername}` : "-"}
                </p>
              </article>
              <article className="soft-card-muted summary-card">
                <p className="summary-label">Entitas</p>
                <p className="summary-value text-xl">{selectedLog.entityName ?? "-"}</p>
                <p className="summary-note">{selectedLog.entityId ?? "-"}</p>
              </article>
            </div>

            {selectedLogMode === "edit" ? (
              <form action={updateActivityLogAction} className="mt-5 space-y-4">
                <input type="hidden" name="log_id" value={selectedLog.id} />
                <input type="hidden" name="return_to" value={closeModalHref} />
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Deskripsi
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    required
                    defaultValue={selectedLog.description}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Payload JSON
                  </label>
                  <textarea
                    name="payload_json"
                    rows={12}
                    className="font-mono text-xs"
                    defaultValue={formatPayloadJson(selectedLog.payload)}
                    placeholder='Contoh: {"field":"value"}'
                  />
                </div>
                <div className="button-stack justify-end">
                  <Link
                    href={createLogsHref({
                      fromDate,
                      toDate,
                      logId: selectedLog.id,
                      mode: "view",
                    })}
                    prefetch
                    scroll={false}
                    data-ui-button="true"
                    className="button-ghost button-sm"
                  >
                    <span className="btn-icon bg-slate-100 text-slate-700">
                      <EyeIcon />
                    </span>
                    Kembali ke Detail
                  </Link>
                  {selectedLogEntityEditHref ? (
                    <Link
                      href={selectedLogEntityEditHref}
                      data-ui-button="true"
                      className="button-soft button-sm"
                    >
                      <span className="btn-icon bg-slate-100 text-slate-700">
                        <EditIcon />
                      </span>
                      Edit Data Asli
                    </Link>
                  ) : null}
                  <button className="button-primary button-sm">
                    <span className="btn-icon bg-white/15 text-white">
                      <SaveIcon />
                    </span>
                    Simpan Perubahan Log
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="soft-card-muted p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Deskripsi
                  </p>
                  <p className="mt-2 text-sm text-slate-800">{selectedLog.description}</p>
                </div>

                <div className="table-card">
                  <div className="data-table-shell">
                    <table className="data-table data-table--compact">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLogPayloadEntries.map((entry) => (
                          <tr key={entry.key}>
                            <td className="font-mono text-xs text-slate-700">{entry.key}</td>
                            <td className="font-mono text-xs text-slate-700 break-all">
                              {entry.value || "-"}
                            </td>
                          </tr>
                        ))}
                        {selectedLogPayloadEntries.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                              Tidak ada payload.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="button-stack justify-end">
                  {selectedLogEntityEditHref ? (
                    <Link
                      href={selectedLogEntityEditHref}
                      data-ui-button="true"
                      className="button-soft button-sm"
                    >
                      <span className="btn-icon bg-slate-100 text-slate-700">
                        <EditIcon />
                      </span>
                      Edit Data Asli
                    </Link>
                  ) : null}
                  {canEditLogs ? (
                    <Link
                      href={createLogsHref({
                        fromDate,
                        toDate,
                        logId: selectedLog.id,
                        mode: "edit",
                      })}
                      prefetch
                      scroll={false}
                      data-ui-button="true"
                      className="button-primary button-sm"
                    >
                      <span className="btn-icon bg-white/15 text-white">
                        <EditIcon />
                      </span>
                      Edit Log
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
