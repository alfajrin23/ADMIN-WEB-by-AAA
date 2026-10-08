"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PROJECT_STATUSES } from "@/lib/constants";

type ProjectsStatusFilterProps = {
  initialValue: string;
};

export function ProjectsStatusFilter({ initialValue }: ProjectsStatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const applyStatus = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status) {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <label className="mt-3 flex w-full max-w-xs flex-col gap-1.5 text-xs font-medium text-slate-600">
      Status proyek
      <select
        value={initialValue}
        onChange={(event) => applyStatus(event.currentTarget.value)}
        aria-label="Filter status proyek"
      >
        <option value="">Semua status</option>
        {PROJECT_STATUSES.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>
    </label>
  );
}
