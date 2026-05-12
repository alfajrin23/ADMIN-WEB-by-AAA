"use client";

import { useDeferredValue, useMemo, useState } from "react";

type ProjectOption = {
  id: string;
  name: string;
  code?: string | null;
  clientName?: string | null;
};

type ProjectChecklistSearchProps = {
  projects: ProjectOption[];
  inputName?: string;
  excludeProjectId?: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function resolveClientName(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || "Tanpa Klien";
}

export function ProjectChecklistSearch({
  projects,
  inputName = "project_ids",
  excludeProjectId,
}: ProjectChecklistSearchProps) {
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(query);

  const availableProjects = useMemo(
    () =>
      projects
        .filter((project) => project.id !== excludeProjectId)
        .slice()
        .sort((a, b) => {
          const clientCompare = resolveClientName(a.clientName).localeCompare(
            resolveClientName(b.clientName),
            "id-ID",
          );
          if (clientCompare !== 0) {
            return clientCompare;
          }
          return a.name.localeCompare(b.name, "id-ID");
        }),
    [projects, excludeProjectId],
  );

  const clientOptions = useMemo(
    () =>
      Array.from(new Set(availableProjects.map((project) => resolveClientName(project.clientName)))).sort(
        (a, b) => a.localeCompare(b, "id-ID"),
      ),
    [availableProjects],
  );

  const normalizedQuery = normalizeText(deferredQuery);
  const visibleProjects = useMemo(() => {
    return availableProjects.filter((project) => {
      const matchesClient =
        !clientFilter || resolveClientName(project.clientName) === clientFilter;
      if (!matchesClient) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = normalizeText([project.name, project.code, project.clientName].join(" "));
      return haystack.includes(normalizedQuery);
    });
  }, [availableProjects, clientFilter, normalizedQuery]);

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

  const toggleVisibleProjects = (checked: boolean) => {
    const visibleIds = visibleProjects.map((project) => project.id);
    setSelectedIds((prev) => {
      const current = new Set(prev);
      if (checked) {
        for (const projectId of visibleIds) {
          current.add(projectId);
        }
      } else {
        for (const projectId of visibleIds) {
          current.delete(projectId);
        }
      }
      return Array.from(current);
    });
  };

  const selectedVisibleCount = visibleProjects.filter((project) => selectedSet.has(project.id)).length;

  return (
    <div className="mt-2 space-y-2">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Cari nama / kode / klien project lain..."
          autoComplete="off"
        />
        <select value={clientFilter} onChange={(event) => setClientFilter(event.currentTarget.value)}>
          <option value="">Semua klien</option>
          {clientOptions.map((clientName) => (
            <option key={clientName} value={clientName}>
              {clientName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-[11px] text-slate-600">
          {selectedIds.length} project tambahan terpilih, {selectedVisibleCount}/{visibleProjects.length} pada
          daftar tampil.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-ui-button="true"
            className="button-soft button-xs"
            onClick={() => toggleVisibleProjects(true)}
            disabled={visibleProjects.length === 0}
          >
            {clientFilter ? "Pilih Semua Dari Klien Ini" : "Pilih Semua Tampil"}
          </button>
          <button
            type="button"
            data-ui-button="true"
            className="button-soft button-xs"
            onClick={() => toggleVisibleProjects(false)}
            disabled={selectedVisibleCount === 0}
          >
            Lepas Semua Tampil
          </button>
        </div>
      </div>

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
              <span>
                <span className="block font-semibold text-slate-700">{project.name}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  {resolveClientName(project.clientName)}
                  {project.code?.trim() ? ` | ${project.code.trim()}` : ""}
                </span>
              </span>
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
