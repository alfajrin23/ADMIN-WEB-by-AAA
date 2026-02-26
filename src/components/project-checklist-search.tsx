"use client";

import { useMemo, useState } from "react";

type ProjectOption = {
  id: string;
  name: string;
};

type ProjectChecklistSearchProps = {
  projects: ProjectOption[];
  inputName?: string;
  excludeProjectId?: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export function ProjectChecklistSearch({
  projects,
  inputName = "project_ids",
  excludeProjectId,
}: ProjectChecklistSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const availableProjects = useMemo(
    () =>
      projects
        .filter((project) => project.id !== excludeProjectId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects, excludeProjectId],
  );

  const normalizedQuery = normalizeText(query);
  const visibleProjects = useMemo(() => {
    if (!normalizedQuery) {
      return availableProjects;
    }
    return availableProjects.filter((project) =>
      normalizeText(project.name).includes(normalizedQuery),
    );
  }, [availableProjects, normalizedQuery]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleSelection = (projectId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(projectId)) {
          return prev;
        }
        return [...prev, projectId];
      }
      return prev.filter((item) => item !== projectId);
    });
  };

  return (
    <div className="mt-2 space-y-2">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Cari project lain..."
        autoComplete="off"
      />
      <p className="text-[11px] text-slate-500">
        {selectedIds.length} project tambahan terpilih
      </p>

      <div className="grid max-h-40 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-2">
        {visibleProjects.length === 0 ? (
          <p className="text-xs text-slate-500">Project tidak ditemukan.</p>
        ) : (
          visibleProjects.map((project) => (
            <label
              key={`bulk-${project.id}`}
              className="inline-flex items-start gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selectedSet.has(project.id)}
                onChange={(event) => toggleSelection(project.id, event.currentTarget.checked)}
                className="mt-0.5"
              />
              <span>{project.name}</span>
            </label>
          ))
        )}
      </div>

      {selectedIds.map((projectId) => (
        <input key={`selected-${projectId}`} type="hidden" name={inputName} value={projectId} />
      ))}
    </div>
  );
}
