"use client";

import { useId, useMemo, useState } from "react";

type ProjectOption = {
  id: string;
  name: string;
};

type ProjectAutocompleteProps = {
  projects: ProjectOption[];
};

export function ProjectAutocomplete({ projects }: ProjectAutocompleteProps) {
  const listId = useId();
  const [query, setQuery] = useState("");

  const selectedId = useMemo(() => {
    const matched = projects.find((project) => project.name.toLowerCase() === query.toLowerCase());
    return matched?.id ?? "";
  }, [projects, query]);

  return (
    <div className="space-y-1">
      <input
        type="text"
        list={listId}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ketik nama project..."
        autoComplete="off"
        required
      />
      <datalist id={listId}>
        {projects.map((project) => (
          <option key={project.id} value={project.name} />
        ))}
      </datalist>
      <input type="hidden" name="project_id" value={selectedId} />
      <p className="text-[11px] text-slate-500">Ketik huruf awal untuk melihat rekomendasi project.</p>
    </div>
  );
}
