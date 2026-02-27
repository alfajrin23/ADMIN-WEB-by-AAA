"use client";

import { useEffect, useId, useMemo, useState } from "react";

type ProjectOption = {
  id: string;
  name: string;
};

type ProjectAutocompleteProps = {
  projects: ProjectOption[];
  initialProjectId?: string;
};

function isFocusableElement(element: HTMLElement) {
  if (element.hasAttribute("disabled")) {
    return false;
  }
  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  if (element.tabIndex < 0) {
    return false;
  }
  if (element instanceof HTMLInputElement && element.type === "hidden") {
    return false;
  }
  if (element.getClientRects().length === 0) {
    return false;
  }
  return true;
}

function focusNextField(current: HTMLInputElement) {
  const form = current.closest("form");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const fields = Array.from(
    form.querySelectorAll<HTMLElement>("input, select, textarea, button, [tabindex]"),
  ).filter(isFocusableElement);
  const currentIndex = fields.findIndex((item) => item === current);
  if (currentIndex < 0 || currentIndex >= fields.length - 1) {
    return;
  }

  fields[currentIndex + 1]?.focus();
}

export function ProjectAutocomplete({ projects, initialProjectId }: ProjectAutocompleteProps) {
  const listId = useId();
  const initialProjectName = useMemo(() => {
    if (!initialProjectId) {
      return "";
    }
    return projects.find((project) => project.id === initialProjectId)?.name ?? "";
  }, [projects, initialProjectId]);
  const [query, setQuery] = useState(initialProjectName);

  useEffect(() => {
    setQuery(initialProjectName);
  }, [initialProjectName]);

  const selectedId = useMemo(() => {
    const matched = projects.find((project) => project.name.toLowerCase() === query.toLowerCase());
    return matched?.id ?? "";
  }, [projects, query]);

  const applyBestMatch = () => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return;
    }

    const exactMatch = projects.find((project) => project.name.toLowerCase() === normalizedQuery);
    if (exactMatch) {
      if (exactMatch.name !== query) {
        setQuery(exactMatch.name);
      }
      return;
    }

    const prefixMatch =
      projects.find((project) => project.name.toLowerCase().startsWith(normalizedQuery)) ??
      projects.find((project) => project.name.toLowerCase().includes(normalizedQuery));

    if (prefixMatch) {
      setQuery(prefixMatch.name);
    }
  };

  return (
    <div className="space-y-1">
      <input
        type="text"
        list={listId}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            applyBestMatch();
            requestAnimationFrame(() => {
              focusNextField(event.currentTarget);
            });
          }
        }}
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
