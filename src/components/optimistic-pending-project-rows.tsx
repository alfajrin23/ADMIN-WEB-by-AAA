"use client";

import { useMemo } from "react";
import { useOptimisticCreateStore } from "@/components/optimistic-create-store";
import { PROJECT_STATUS_STYLE } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { Project } from "@/lib/types";

type OptimisticPendingProjectRowsProps = {
  searchText: string;
  storedProjects: Project[];
};

function fingerprint(project: Project) {
  return [
    project.name.trim().toLowerCase(),
    project.code?.trim().toLowerCase() ?? "",
    project.clientName?.trim().toLowerCase() ?? "",
    project.startDate ?? "",
  ].join("|");
}

export function OptimisticPendingProjectRows({
  searchText,
  storedProjects,
}: OptimisticPendingProjectRowsProps) {
  const { pendingProjects } = useOptimisticCreateStore();
  const rows = useMemo(() => {
    const normalizedQuery = searchText.trim().toLowerCase();
    const storedFingerprints = new Set(storedProjects.map(fingerprint));
    return pendingProjects.filter((project) => {
      if (storedFingerprints.has(fingerprint(project))) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [project.name, project.code ?? "", project.clientName ?? "", project.status]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [pendingProjects, searchText, storedProjects]);

  return rows.map((project) => (
    <tr key={project.id} className="bg-blue-50/70">
      <td className="font-medium text-slate-900">
        <p>{project.name}</p>
        <p className="mt-1 text-xs text-slate-500">{project.code ?? "-"}</p>
      </td>
      <td>{project.clientName ?? "-"}</td>
      <td>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${PROJECT_STATUS_STYLE[project.status]}`}
        >
          {project.status}
        </span>
      </td>
      <td>{project.startDate ? formatDate(project.startDate) : "-"}</td>
      <td className="text-center">-</td>
      <td className="text-right text-xs font-semibold text-blue-600">Menyimpan...</td>
    </tr>
  ));
}
