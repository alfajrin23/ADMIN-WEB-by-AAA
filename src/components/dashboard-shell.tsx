"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { OptimisticCreateStoreProvider } from "@/components/optimistic-create-store";

export function DashboardShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMobileNavOpen]);

  return (
    <OptimisticCreateStoreProvider>
      <div
        className={`mx-auto grid min-h-screen w-full max-w-[2560px] grid-cols-1 gap-3 px-3 py-3 sm:gap-4 sm:px-5 lg:gap-5 lg:px-6 lg:py-5 2xl:px-8 transition-[grid-template-columns] duration-200 ${
          isSidebarOpen ? "lg:grid-cols-[264px_minmax(0,1fr)]" : "lg:grid-cols-[0px_minmax(0,1fr)]"
        }`}
      >
        <div
          className={`fixed inset-0 z-40 bg-slate-950/40 p-3 lg:relative lg:inset-auto lg:z-auto lg:bg-transparent lg:p-0 lg:transition-[width,opacity] lg:duration-200 ${
            isMobileNavOpen ? "block" : "hidden lg:block"
          } ${isSidebarOpen ? "lg:w-[264px]" : "lg:w-0 lg:overflow-hidden lg:opacity-0"}`}
        >
          <div
            className="absolute inset-0 lg:hidden"
            aria-hidden="true"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <div
            className={`relative z-10 h-full w-[min(21rem,calc(100vw-1.5rem))] lg:w-[264px] ${
              isSidebarOpen ? "lg:block" : "lg:hidden"
            }`}
          >
            {sidebar}
          </div>
        </div>

        <div className="relative flex min-w-0 w-full flex-col gap-3 sm:gap-4">
          <div className="dashboard-mobile-topbar lg:hidden">
            <button
              type="button"
              className="button-ghost dashboard-mobile-topbar__menu"
              aria-label="Buka navigasi"
              aria-expanded={isMobileNavOpen}
              onClick={() => setIsMobileNavOpen(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <div>
              <p>ADMIN WEB</p>
              <strong>Rekap Proyek</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSidebarOpen((open) => !open)}
            className="absolute -left-4 top-6 z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 lg:flex"
            title={isSidebarOpen ? "Sembunyikan sidebar" : "Tampilkan sidebar"}
            aria-label={isSidebarOpen ? "Sembunyikan sidebar" : "Tampilkan sidebar"}
            aria-expanded={isSidebarOpen}
          >
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${isSidebarOpen ? "" : "rotate-180"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m15 19-7-7 7-7" />
            </svg>
          </button>
          {children}
        </div>
      </div>
    </OptimisticCreateStoreProvider>
  );
}
