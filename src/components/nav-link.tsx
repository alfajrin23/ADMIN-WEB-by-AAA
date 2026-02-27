"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavLinkProps = {
  children: ReactNode;
  href: string;
  icon?: ReactNode;
  tone?: "overview" | "projects" | "attendance" | "logs";
};

const toneClass = {
  overview: "from-blue-600 to-cyan-500",
  projects: "from-emerald-600 to-teal-500",
  attendance: "from-amber-600 to-orange-500",
  logs: "from-indigo-600 to-violet-500",
};

export function NavLink({ children, href, icon, tone = "overview" }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      data-ui-button="true"
      data-active={isActive ? "true" : "false"}
      className={`block rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 ${
        isActive
          ? `bg-gradient-to-r ${toneClass[tone]} text-white shadow`
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <span className="flex items-center gap-2">
        {icon ? <span className="nav-link-icon h-4 w-4">{icon}</span> : null}
        <span>{children}</span>
      </span>
    </Link>
  );
}
