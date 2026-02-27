import { updateUserRoleAction } from "@/app/auth-actions";
import { getActivityLogs } from "@/lib/activity-logs";
import { APP_ROLES, getAppUsers, requireDevUser, ROLE_LABEL } from "@/lib/auth";

type LogsPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
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

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const currentUser = await requireDevUser();
  const params = await searchParams;
  const [logs, users] = await Promise.all([getActivityLogs(300), getAppUsers()]);
  const error = typeof params.error === "string" ? params.error : "";
  const success = typeof params.success === "string" ? params.success : "";

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
          <h1 className="text-lg font-semibold text-slate-900">Logs Input</h1>
          <p className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
            Login sebagai: {currentUser.fullName} ({ROLE_LABEL[currentUser.role]})
          </p>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Riwayat aktivitas tambah/edit/hapus project, biaya, absensi, import excel, dan perubahan role user.
        </p>
      </section>

      <section className="panel p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Manajemen Role User</h2>
          <p className="text-xs text-slate-500">{users.length} user</p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
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
                      <input type="hidden" name="return_to" value="/logs" />
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
                      <button className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Riwayat Aktivitas</h2>
          <p className="text-xs text-slate-500">{logs.length} log terbaru</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2 font-medium">Waktu</th>
                <th className="pb-2 font-medium">User</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Aksi</th>
                <th className="pb-2 font-medium">Modul</th>
                <th className="pb-2 font-medium">Deskripsi</th>
                <th className="pb-2 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
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
                  <td className="py-2 text-slate-700">{log.description}</td>
                  <td className="py-2 font-mono text-xs text-slate-600">{formatPayload(log.payload)}</td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-500">
                    Belum ada log input.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
