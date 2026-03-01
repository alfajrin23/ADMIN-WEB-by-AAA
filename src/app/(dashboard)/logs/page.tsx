import Link from "next/link";
import { updateActivityLogAction } from "@/app/actions";
import { updateUserRoleAction } from "@/app/auth-actions";
import { CloseIcon, EditIcon, EyeIcon, FilterIcon, SaveIcon } from "@/components/icons";
import { type ActivityLog, getActivityLogs } from "@/lib/activity-logs";
import { APP_ROLES, getAppUsers, requireDevUser, ROLE_LABEL } from "@/lib/auth";

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
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
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
  const currentUser = await requireDevUser();
  const params = await searchParams;
  const [logs, users] = await Promise.all([getActivityLogs(300), getAppUsers()]);
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
  const selectedLogMode = params.mode === "edit" ? "edit" : "view";
  const selectedLog = selectedLogId ? logs.find((log) => log.id === selectedLogId) ?? null : null;
  const selectedLogEntityEditHref = selectedLog ? getLogEntityEditHref(selectedLog) : null;
  const selectedLogPayloadEntries = toPayloadEntries(selectedLog?.payload ?? null);
  const closeModalHref = createLogsHref({
    fromDate,
    toDate,
  });

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

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-base font-semibold text-slate-900">Logs Input</h1>
          <p className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
            Login sebagai: {currentUser.fullName} ({ROLE_LABEL[currentUser.role]})
          </p>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Riwayat aktivitas tambah/edit/hapus project, biaya, absensi, import excel, dan perubahan role user.
        </p>
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Manajemen Role User</h2>
          <p className="text-xs text-slate-500">{users.length} user</p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2 font-medium">Nama</th>
                <th className="pb-2 font-medium">Username</th>
                <th className="pb-2 font-medium">Role Saat Ini</th>
                <th className="pb-2 font-medium">Ubah Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-900">
                    {user.fullName}
                    {user.id === currentUser.id ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        Anda
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-slate-700">@{user.username}</td>
                  <td className="py-2">
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                      {ROLE_LABEL[user.role]}
                    </span>
                  </td>
                  <td className="py-2">
                    <form action={updateUserRoleAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="user_id" value={user.id} />
                      <input type="hidden" name="return_to" value={closeModalHref} />
                      <select
                        name="next_role"
                        defaultValue={user.role}
                        className="max-w-[160px]"
                        aria-label={`Ubah role ${user.fullName}`}
                      >
                        {APP_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                      <button className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">
                        <span className="btn-icon bg-white/20 text-white">
                          <SaveIcon />
                        </span>
                        Simpan Role
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    Belum ada user.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Riwayat Aktivitas</h2>
          <p className="text-xs text-slate-500">
            {filteredLogs.length} log tampil
            {fromDate || toDate ? ` (dari ${logs.length} log terbaru)` : ""}
          </p>
        </div>
        <form method="get" className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Dari tanggal</label>
            <input type="date" name="from" defaultValue={fromDate} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">
              Sampai tanggal
            </label>
            <input type="date" name="to" defaultValue={toDate} />
          </div>
          <button
            data-ui-button="true"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 sm:self-end lg:w-auto"
          >
            <span className="btn-icon bg-white/20 text-white">
              <FilterIcon />
            </span>
            Filter
          </button>
          <Link
            href="/logs"
            data-ui-button="true"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 sm:self-end lg:w-auto"
          >
            <span className="btn-icon bg-slate-100 text-slate-600">
              <CloseIcon />
            </span>
            Reset
          </Link>
        </form>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2 font-medium">Waktu</th>
                <th className="pb-2 font-medium">User</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Aksi</th>
                <th className="pb-2 font-medium">Modul</th>
                <th className="pb-2 font-medium">Entitas</th>
                <th className="pb-2 font-medium">Deskripsi</th>
                <th className="pb-2 font-medium">Data</th>
                <th className="pb-2 text-right font-medium">Kelola</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const entityEditHref = getLogEntityEditHref(log);
                return (
                <tr key={log.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 text-slate-600">{formatDateTime(log.createdAt)}</td>
                  <td className="py-2 font-medium text-slate-900">
                    {log.actorName}
                    <p className="text-xs text-slate-500">
                      {log.actorUsername ? `@${log.actorUsername}` : "-"}
                    </p>
                  </td>
                  <td className="py-2 text-slate-600">{ROLE_LABEL[log.actorRole]}</td>
                  <td className="py-2 font-semibold uppercase text-indigo-700">{log.actionType}</td>
                  <td className="py-2 text-slate-700">{log.module}</td>
                  <td className="py-2 text-slate-700">
                    {log.entityName ?? "-"}
                    <p className="text-xs text-slate-500">{log.entityId ?? "-"}</p>
                  </td>
                  <td className="py-2 text-slate-700">{log.description}</td>
                  <td className="py-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="font-mono text-xs text-slate-600">{formatPayload(log.payload)}</p>
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={createLogsHref({
                          fromDate,
                          toDate,
                          logId: log.id,
                          mode: "view",
                        })}
                        data-ui-button="true"
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        <span className="btn-icon bg-blue-100 text-blue-700">
                          <EyeIcon />
                        </span>
                        Detail Log
                      </Link>
                      {entityEditHref ? (
                        <Link
                          href={entityEditHref}
                          data-ui-button="true"
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          <span className="btn-icon bg-emerald-100 text-emerald-700">
                            <EditIcon />
                          </span>
                          Edit
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })}
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-4 text-center text-slate-500">
                    Log tidak ditemukan untuk rentang tanggal ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedLog ? (
        <div className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4">
          <Link
            href={closeModalHref}
            aria-label="Tutup modal log"
            className="absolute inset-0 bg-slate-950/45"
          />
          <section className="modal-card panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">
                {selectedLogMode === "edit" ? "Edit Log Aktivitas" : "Detail Log Aktivitas"}
              </h3>
              <Link
                href={closeModalHref}
                data-ui-button="true"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                <span className="btn-icon bg-slate-100 text-slate-600">
                  <CloseIcon />
                </span>
                Tutup
              </Link>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[640px] text-xs">
                <tbody>
                  <tr className="border-b border-slate-200">
                    <th className="w-44 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500">
                      Waktu
                    </th>
                    <td className="px-3 py-2 text-slate-800">{formatDateTime(selectedLog.createdAt)}</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <th className="bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500">
                      User
                    </th>
                    <td className="px-3 py-2 text-slate-800">
                      {selectedLog.actorName} ({selectedLog.actorUsername ? `@${selectedLog.actorUsername}` : "-"})
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <th className="bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500">
                      Aksi / Modul
                    </th>
                    <td className="px-3 py-2 text-slate-800">
                      {selectedLog.actionType} / {selectedLog.module}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <th className="bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500">
                      Entitas
                    </th>
                    <td className="px-3 py-2 text-slate-800">
                      {selectedLog.entityName ?? "-"}
                      <p className="text-xs text-slate-500">{selectedLog.entityId ?? "-"}</p>
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500">
                      ID Log
                    </th>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{selectedLog.id}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {selectedLogMode === "edit" ? (
              <form action={updateActivityLogAction} className="mt-4 space-y-3">
                <input type="hidden" name="log_id" value={selectedLog.id} />
                <input type="hidden" name="return_to" value={closeModalHref} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Deskripsi</label>
                  <textarea
                    name="description"
                    rows={3}
                    required
                    defaultValue={selectedLog.description}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Payload JSON (opsional)
                  </label>
                  <textarea
                    name="payload_json"
                    rows={10}
                    className="font-mono text-xs"
                    defaultValue={formatPayloadJson(selectedLog.payload)}
                    placeholder='Contoh: {"field":"value"}'
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Link
                    href={createLogsHref({
                      fromDate,
                      toDate,
                      logId: selectedLog.id,
                      mode: "view",
                    })}
                    data-ui-button="true"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
                      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      <span className="btn-icon bg-indigo-100 text-indigo-700">
                        <EditIcon />
                      </span>
                      Edit Data Asli
                    </Link>
                  ) : null}
                  <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
                    <span className="btn-icon bg-white/20 text-white">
                      <SaveIcon />
                    </span>
                    Simpan Perubahan Log
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Deskripsi</p>
                  <p className="text-xs text-slate-800">{selectedLog.description}</p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left text-slate-500">
                        <th className="px-3 py-2 text-xs font-semibold">Field</th>
                        <th className="px-3 py-2 text-xs font-semibold">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLogPayloadEntries.map((entry) => (
                        <tr key={entry.key} className="border-t border-slate-200 align-top">
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{entry.key}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">
                            {entry.value || "-"}
                          </td>
                        </tr>
                      ))}
                      {selectedLogPayloadEntries.length === 0 ? (
                        <tr className="border-t border-slate-200">
                          <td colSpan={2} className="px-3 py-3 text-center text-xs text-slate-500">
                            Tidak ada payload.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {selectedLogEntityEditHref ? (
                    <Link
                      href={selectedLogEntityEditHref}
                      data-ui-button="true"
                      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      <span className="btn-icon bg-indigo-100 text-indigo-700">
                        <EditIcon />
                      </span>
                      Edit Data Asli
                    </Link>
                  ) : null}
                  <Link
                    href={createLogsHref({
                      fromDate,
                      toDate,
                      logId: selectedLog.id,
                      mode: "edit",
                    })}
                    data-ui-button="true"
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    <span className="btn-icon bg-white/20 text-white">
                      <EditIcon />
                    </span>
                    Edit Log
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
