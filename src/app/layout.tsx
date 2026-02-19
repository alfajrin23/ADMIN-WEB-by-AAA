import type { Metadata } from "next";
import { Manrope, Space_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { AttendanceIcon, DashboardIcon, ProjectIcon } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Administrasi Proyek",
  description: "Aplikasi administrasi pengeluaran biaya proyek dan absensi tukang",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const today = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <html lang="id">
      <body className={`${manrope.variable} ${spaceMono.variable} antialiased`}>
        <div className="app-surface">
          <div className="mx-auto grid min-h-screen max-w-[1280px] grid-cols-1 gap-4 p-4 md:grid-cols-[260px_1fr] md:p-6">
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
              <nav className="mt-8 space-y-2">
                <NavLink href="/" icon={<DashboardIcon />} tone="overview">
                  Ringkasan
                </NavLink>
                <NavLink href="/projects" icon={<ProjectIcon />} tone="projects">
                  Proyek & Biaya
                </NavLink>
                <NavLink href="/attendance" icon={<AttendanceIcon />} tone="attendance">
                  Absen Harian
                </NavLink>
              </nav>
            </aside>
            <div className="space-y-4">
              <header className="motion-display panel flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Sistem Administrasi
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    Rekap Pengeluaran Per Project
                  </p>
                </div>
                <p className="font-mono text-sm text-slate-500">{today}</p>
              </header>
              <main className="space-y-4">{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
