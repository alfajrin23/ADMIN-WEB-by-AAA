import {
  createRoleAction,
  deleteRoleAction,
  updateRolePermissionsAction,
  updateUserRoleAction,
} from "@/app/auth-actions";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { PermissionMatrix } from "@/components/permission-matrix";
import {
  RolesIcon,
  SaveIcon,
  ShieldIcon,
  SparkIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";
import { canEditRoles, getAppUsers, requireRoleManagerUser, ROLE_LABEL } from "@/lib/auth";
import { getRoleCatalog } from "@/lib/role-store";
import { createEmptyPermissionMatrix } from "@/lib/roles";

type RolesPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function RolesPage({ searchParams }: RolesPageProps) {
  const currentUser = await requireRoleManagerUser();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const success = typeof params.success === "string" ? params.success : "";
  const [roles, users] = await Promise.all([getRoleCatalog(), getAppUsers()]);
  const emptyPermissions = createEmptyPermissionMatrix();
  const customRoles = roles.filter((role) => !role.isSystem);
  const roleManagersCount = users.filter((user) => canEditRoles(user)).length;

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
        <div className="page-hero-grid xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <div>
            <span className="page-eyebrow">
              <span className="btn-icon rounded-full bg-blue-100 text-blue-700">
                <SparkIcon />
              </span>
              Role Center
            </span>
            <h1 className="page-title mt-4">
              Kelola role dinamis dan permission matrix tanpa mengubah alur data yang sudah ada.
            </h1>
            <p className="page-description mt-4">
              Role bawaan sistem tetap aman sebagai fallback. Role custom bisa ditambah, diubah, dan
              diassign ke user secara terpisah per modul dan aksi.
            </p>
          </div>

          <div className="hero-meta-grid">
            <article className="hero-meta-card">
              <p className="hero-meta-label">Total Role</p>
              <p className="hero-meta-value">{roles.length}</p>
              <p className="hero-meta-note">{customRoles.length} custom role aktif</p>
            </article>
            <article className="hero-meta-card">
              <p className="hero-meta-label">Role Manager</p>
              <p className="hero-meta-value">{roleManagersCount}</p>
              <p className="hero-meta-note">User yang bisa ubah role & permission</p>
            </article>
            <article className="hero-meta-card">
              <p className="hero-meta-label">Akun Anda</p>
              <p className="hero-meta-value">{currentUser.roleLabel}</p>
              <p className="hero-meta-note">@{currentUser.username}</p>
            </article>
            <article className="hero-meta-card">
              <p className="hero-meta-label">User Tercatat</p>
              <p className="hero-meta-value">{users.length}</p>
              <p className="hero-meta-note">Semua assignment role aktif</p>
            </article>
          </div>
        </div>
      </section>

      <section className="soft-card p-5">
        <div className="section-header">
          <div>
            <h2 className="section-title">Tambah Role Baru</h2>
            <p className="section-description">
              Buat role custom baru lalu atur permission per modul lewat checkbox matrix.
            </p>
          </div>
          <span className="badge badge-primary">
            <RolesIcon className="h-3.5 w-3.5" />
            Role custom
          </span>
        </div>

        <form action={createRoleAction} className="mt-5 space-y-4">
          <input type="hidden" name="return_to" value="/roles" />
          <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Nama role
              </label>
              <input name="name" placeholder="Contoh: finance_viewer" required />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Key role
              </label>
              <input
                name="role_key"
                placeholder="Otomatis dari nama jika kosong"
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Deskripsi
            </label>
            <textarea
              name="description"
              rows={3}
              placeholder="Jelaskan tujuan role ini dan siapa yang akan memakainya."
            />
          </div>

          <PermissionMatrix permissions={emptyPermissions} editable />

          <div className="button-stack justify-end">
            <button className="button-primary">
              <span className="btn-icon bg-white/15 text-white">
                <SaveIcon />
              </span>
              Simpan Role Baru
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4">
        {roles.map((role) => (
          <article key={role.key} className="role-card">
            <div className="role-card__header">
              <div>
                <div className="pill-group">
                  <span className="badge badge-neutral">
                    <ShieldIcon className="h-3.5 w-3.5" />
                    {role.isSystem ? "System" : "Custom"}
                  </span>
                  <span className="badge badge-primary">
                    Base: {ROLE_LABEL[role.derivedRole]}
                  </span>
                  <span className="badge badge-success">
                    <UsersIcon className="h-3.5 w-3.5" />
                    {role.userCount ?? 0} user
                  </span>
                </div>
                <h3 className="role-card__title mt-3">{role.name}</h3>
                <p className="role-card__subtitle">
                  {role.description || "Tidak ada deskripsi role."}
                </p>
                <p className="muted-code mt-2">key: {role.key}</p>
              </div>
            </div>

            {role.isSystem ? (
              <>
                <PermissionMatrix permissions={role.permissions} />
                <div className="info-banner">
                  <p className="info-banner__title">Role bawaan sistem</p>
                  <p className="info-banner__text">
                    Role ini menjadi fallback kompatibilitas untuk user lama dan tidak dapat diubah
                    atau dihapus.
                  </p>
                </div>
              </>
            ) : (
              <>
                <form action={updateRolePermissionsAction} className="space-y-4">
                  <input type="hidden" name="role_key" value={role.key} />
                  <input type="hidden" name="return_to" value="/roles" />
                  <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Nama role
                      </label>
                      <input name="name" defaultValue={role.name} required />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Deskripsi
                      </label>
                      <input
                        name="description"
                        defaultValue={role.description ?? ""}
                        placeholder="Deskripsi singkat role"
                      />
                    </div>
                  </div>

                  <PermissionMatrix permissions={role.permissions} editable />

                  <div className="button-stack justify-end">
                    <button className="button-primary">
                      <span className="btn-icon bg-white/15 text-white">
                        <SaveIcon />
                      </span>
                      Simpan Permission
                    </button>
                  </div>
                </form>
                <form action={deleteRoleAction}>
                  <input type="hidden" name="role_key" value={role.key} />
                  <input type="hidden" name="return_to" value="/roles" />
                  <div className="button-stack justify-end">
                    <ConfirmActionButton
                      className="button-danger"
                      modalDescription={`Yakin ingin menghapus role "${role.name}"?`}
                    >
                      <span className="btn-icon bg-rose-100 text-rose-700">
                        <TrashIcon />
                      </span>
                      Hapus Role
                    </ConfirmActionButton>
                  </div>
                </form>
              </>
            )}
          </article>
        ))}
      </section>

      <section className="soft-card p-5">
        <div className="section-header">
          <div>
            <h2 className="section-title">Assign Role ke User</h2>
            <p className="section-description">
              Ubah role user dengan aman. Role custom akan memakai fallback base role untuk
              kompatibilitas audit log dan akses lama.
            </p>
          </div>
        </div>

        <div className="mt-5 table-card">
          <div className="data-table-shell">
            <table className="data-table data-table--sticky">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role Saat Ini</th>
                  <th className="text-right">Assign Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <p className="font-semibold text-slate-900">{user.fullName}</p>
                      <p className="mt-1 text-xs text-slate-500">@{user.username}</p>
                      {user.id === currentUser.id ? (
                        <span className="badge badge-neutral mt-2">Anda</span>
                      ) : null}
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
                        <input type="hidden" name="return_to" value="/roles" />
                        <select
                          name="next_role"
                          defaultValue={user.roleKey}
                          className="w-full sm:max-w-[260px]"
                          aria-label={`Assign role ${user.fullName}`}
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
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      Belum ada user.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
