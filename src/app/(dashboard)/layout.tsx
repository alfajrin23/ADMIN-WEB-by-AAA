import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/auth-actions";
import {
  AttendanceIcon,
  DashboardIcon,
  LogsIcon,
  LogoutIcon,
  ProjectIcon,
} from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { canManageData, canViewLogs, requireAuthUser, ROLE_LABEL } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireAuthUser();
  const today = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="app-surface">
      <div className="mx-auto grid min-h-screen max-w-[1280px] grid-cols-1 gap-4 p-4 md:grid-cols-[280px_minmax(0,1fr)] md:p-6">
        <aside className="motion-display panel p-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-admin.svg"
              alt="Logo Admin Proyek"
              width={48}
              height={48}
              priority
            />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
                Admin Web
              </p>
              <h1 className="mt-1 text-xl font-semibold text-slate-900">Rekap Proyek</h1>
            </div>
          </Link>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-900">{user.fullName}</p>
            <p className="text-xs text-slate-500">@{user.username}</p>
            <p className="mt-1 inline-flex rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
              {ROLE_LABEL[user.role]}
            </p>
          </div>

          <nav className="mt-6 space-y-2">
            <NavLink href="/" icon={<DashboardIcon />} tone="overview">
              Ringkasan
            </NavLink>
            {canManageData(user.role) ? (
              <>
                <NavLink href="/projects" icon={<ProjectIcon />} tone="projects">
                  Proyek & Biaya
                </NavLink>
                <NavLink href="/attendance" icon={<AttendanceIcon />} tone="attendance">
                  Absen Harian
                </NavLink>
              </>
            ) : null}
            {canViewLogs(user.role) ? (
              <NavLink href="/logs" icon={<LogsIcon />} tone="logs">
                Logs Input
              </NavLink>
            ) : null}
          </nav>

          <form action={logoutAction} className="mt-6">
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              <span className="btn-icon bg-slate-100 text-slate-700">
                <LogoutIcon />
              </span>
              Keluar
            </button>
          </form>
        </aside>

        <div className="min-w-0 space-y-4">
          <header className="motion-display panel flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Sistem Administrasi</p>
              <p className="text-lg font-semibold text-slate-900">
                Rekap Pengeluaran Per Project
              </p>
            </div>
            <p className="shrink-0 font-mono text-sm text-slate-500">{today}</p>
          </header>
          <main className="min-w-0 space-y-4">{children}</main>
          <footer className="panel px-5 py-4">
            <p className="text-xs text-slate-500">Terima kasih sudah menggunakan Admin Web.</p>
            <a
              href="https://alfajrin23.github.io/Personal-Portofolio/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-signature mt-2 inline-flex text-sm font-semibold"
            >
              Copyright by Al Fajrin A Alamsyah
            </a>
          </footer>
        </div>
      </div>
    </div>
  );
}
