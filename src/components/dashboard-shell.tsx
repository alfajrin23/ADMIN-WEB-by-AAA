"use client";

import { useState } from "react";

export function DashboardShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div
      className={`mx-auto grid min-h-screen max-w-[1480px] grid-cols-1 p-4 lg:p-5 transition-[grid-template-columns] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
        isOpen ? "gap-4 lg:grid-cols-[272px_minmax(0,1fr)]" : "gap-0 lg:grid-cols-[0px_minmax(0,1fr)]"
      }`}
    >
      <div
        className={`transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] overflow-visible relative z-[100] ${
          isOpen
            ? "opacity-100 translate-x-0 w-[272px] lg:w-auto"
            : "opacity-0 -translate-x-12 w-0 overflow-hidden pointer-events-none"
        }`}
      >
        {/* We use w-[272px] for fixed width during transition so sidebar contents don't squeeze */}
        <div className={`w-[272px] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
           {sidebar}
        </div>
      </div>

      <div className="min-w-0 flex flex-col relative w-full lg:pl-1">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`hidden lg:flex absolute shadow-md border border-slate-200 z-50 h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 hover:text-indigo-600 hover:scale-105 hover:shadow-lg transition-all focus:outline-none ${isOpen ? '-left-6 top-6' : '-left-2 top-6'}`}
          title={isOpen ? "Sembunyikan Sidebar" : "Tampilkan Sidebar"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 transition-transform duration-500 ${isOpen ? "rotate-0" : "rotate-180"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
