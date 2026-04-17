import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/auth-actions";
import {
  AttendanceIcon,
  DashboardIcon,
  LogsIcon,
  LogoutIcon,
  ProjectIcon,
  RolesIcon,
  ShieldIcon,
} from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import {
  canAccessAttendance,
  canAccessProjects,
  canEditRoles,
  canViewLogs,
  requireAuthUser,
} from "@/lib/auth";
import { ProfileEditTrigger } from "@/components/profile-edit-trigger";
import { NotificationDropdown } from "@/components/notification-dropdown";
import { getSystemUpdates } from "@/lib/data";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireAuthUser();
  const updates = await getSystemUpdates();

  return (
    <div className="app-surface">
      <DashboardShell
        sidebar={
          <aside className="panel flex flex-col p-4 lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)]">
            <Link href="/" prefetch className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md shadow-slate-900/10">
              <Image
                src="/logo-admin.svg"
                alt="Logo Admin Proyek"
                width={26}
                height={26}
                priority
              />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
                Admin Web
              </p>
              <h1 className="mt-1 text-lg font-bold tracking-[-0.03em] text-slate-950">
                Rekap Proyek
              </h1>
            </div>
          </Link>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{user.fullName}</p>
                <p className="mt-1 truncate text-xs text-slate-500">@{user.username}</p>
              </div>
              <div className="flex items-center gap-1">
                <NotificationDropdown updates={updates} />
                <ProfileEditTrigger defaultFullName={user.fullName} />
              </div>
            </div>
            <div className="mt-3">
              <span className="badge badge-primary">{user.roleLabel}</span>
            </div>
          </div>

          <div className="mt-5 flex-1 overflow-y-auto pr-1">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Navigasi
            </p>
            <nav className="space-y-1.5">
              <NavLink href="/" icon={<DashboardIcon />} tone="overview">
                Ringkasan
              </NavLink>
              {canAccessProjects(user) ? (
                <NavLink href="/projects" icon={<ProjectIcon />} tone="projects">
                  Proyek & Biaya
                </NavLink>
              ) : null}
              {canAccessAttendance(user) ? (
                <NavLink href="/attendance" icon={<AttendanceIcon />} tone="attendance">
                  Absen Harian
                </NavLink>
              ) : null}
              {canViewLogs(user) ? (
                <NavLink href="/logs" icon={<LogsIcon />} tone="logs">
                  Logs Input
                </NavLink>
              ) : null}
              {canEditRoles(user) ? (
                <>
                  <NavLink href="/roles" icon={<RolesIcon />} tone="roles">
                    Roles & Permission
                  </NavLink>
                  <NavLink href="/system-updates" icon={<ShieldIcon />} tone="logs">
                    Info Sistem
                  </NavLink>
                </>
              ) : null}
            </nav>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4">
            <form action={logoutAction}>
              <button className="button-danger button-sm w-full justify-start">
                <span className="btn-icon bg-rose-100 text-rose-700">
                  <LogoutIcon />
                </span>
                Logout
              </button>
            </form>
          </div>
        </aside>
      }>
        <div className="min-w-0 space-y-4">
            <header className="panel sticky top-4 z-20 px-4 py-3 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Workspace
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-slate-950">
                  Administrasi proyek yang lebih ringkas dan lebih mudah dibaca.
                </h2>
              </div>
              <Link href="/" prefetch className="button-ghost button-sm">
                <span className="btn-icon bg-slate-100 text-slate-700">
                  <DashboardIcon />
                </span>
                Dashboard
              </Link>
            </div>
          </header>

          <main className="min-w-0 space-y-4">{children}</main>

          <footer className="panel px-4 py-3">
            <p className="text-xs text-slate-500">Terima kasih sudah menggunakan Admin Web.</p>
            <a
              href="https://alfajrin23.github.io/Personal-Portofolio/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-signature mt-1.5 inline-flex text-xs font-semibold"
            >
              Copyright by Al Fajrin A Alamsyah
            </a>
            </footer>
          </div>
      </DashboardShell>
    </div>
  );
}
