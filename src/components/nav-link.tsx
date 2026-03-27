"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavLinkProps = {
  children: ReactNode;
  href: string;
  icon?: ReactNode;
  tone?: "overview" | "projects" | "attendance" | "logs" | "roles";
};

const toneClass = {
  overview: "border-blue-200 bg-blue-50 text-blue-700",
  projects: "border-emerald-200 bg-emerald-50 text-emerald-700",
  attendance: "border-amber-200 bg-amber-50 text-amber-700",
  logs: "border-indigo-200 bg-indigo-50 text-indigo-700",
  roles: "border-slate-200 bg-slate-100 text-slate-700",
};

export function NavLink({ children, href, icon, tone = "overview" }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      prefetch
      data-ui-button="true"
      data-active={isActive ? "true" : "false"}
      className={`block rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-all duration-300 ${
        isActive
          ? `${toneClass[tone]} shadow-sm`
          : "border-transparent bg-white/70 text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <span className="flex items-center gap-2.5">
        {icon ? (
          <span
            className={`nav-link-icon flex h-7 w-7 items-center justify-center rounded-lg ${
              isActive ? "bg-white/75" : "bg-slate-100 text-slate-600"
            }`}
          >
            <span className="h-3.5 w-3.5">{icon}</span>
          </span>
        ) : null}
        <span>{children}</span>
      </span>
    </Link>
  );
}
