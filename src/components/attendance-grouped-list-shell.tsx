"use client";

import dynamic from "next/dynamic";

export const AttendanceGroupedListShell = dynamic(
  () => import("@/components/attendance-grouped-list").then((module) => module.AttendanceGroupedList),
  {
    ssr: false,
    loading: () => (
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
        Memuat daftar absensi...
      </p>
    ),
  },
);
