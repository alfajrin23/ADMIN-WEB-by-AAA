"use client";

import { useEffect, useId, useMemo, useState } from "react";

export const PROJECT_AUTOCOMPLETE_SELECT_EVENT = "project-autocomplete:select";

type ProjectOption = {
  id: string;
  name: string;
  code?: string | null;
  clientName?: string | null;
};

type ProjectAutocompleteProps = {
  projects: ProjectOption[];
  initialProjectId?: string;
  autoFocus?: boolean;
};

type PreparedProjectOption = {
  id: string;
  name: string;
  displayName: string;
  normalizedName: string;
  normalizedDisplay: string;
  searchText: string;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildProjectContext(project: ProjectOption) {
  const parts: string[] = [];
  const code = project.code?.trim();
  const clientName = project.clientName?.trim();
  if (code) {
    parts.push(`Kode: ${code}`);
  }
  if (clientName) {
    parts.push(`Klien: ${clientName}`);
  }
  if (parts.length === 0) {
    parts.push(`ID: ${project.id.slice(0, 8)}`);
  }
  return parts.join(" | ");
}

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

function focusNextField(current: HTMLInputElement | null) {
  if (!(current instanceof HTMLInputElement)) {
    return;
  }
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

function focusFormFieldByName(form: HTMLFormElement | null, fieldName: string) {
  if (!(form instanceof HTMLFormElement)) {
    return false;
  }

  const target = form.elements.namedItem(fieldName);
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement
  ) {
    target.focus();
    return true;
  }

  return false;
}

export function ProjectAutocomplete({ projects, initialProjectId, autoFocus = false }: ProjectAutocompleteProps) {
  const listId = useId();

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      const key = normalizeText(project.name);
      if (!key) {
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([name]) => name),
    );
  }, [projects]);

  const options = useMemo<PreparedProjectOption[]>(() => {
    return projects.map((project) => {
      const normalizedName = normalizeText(project.name);
      const context = buildProjectContext(project);
      const displayName = duplicateNames.has(normalizedName)
        ? `${project.name} - ${context}`
        : project.name;

      return {
        id: project.id,
        name: project.name,
        displayName,
        normalizedName,
        normalizedDisplay: normalizeText(displayName),
        searchText: normalizeText([project.name, project.code, project.clientName, context].join(" ")),
      };
    });
  }, [projects, duplicateNames]);

  const initialProjectDisplayName = useMemo(() => {
    if (!initialProjectId) {
      return "";
    }
    return options.find((option) => option.id === initialProjectId)?.displayName ?? "";
  }, [options, initialProjectId]);

  const [query, setQuery] = useState(initialProjectDisplayName);

  useEffect(() => {
    setQuery(initialProjectDisplayName);
  }, [initialProjectDisplayName]);

  useEffect(() => {
    const handleExternalProjectSelect = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId?: string }>;
      const selectedProjectId = customEvent.detail?.projectId?.trim() ?? "";
      if (!selectedProjectId) {
        return;
      }
      const matched = options.find((option) => option.id === selectedProjectId);
      if (!matched) {
        return;
      }
      setQuery(matched.displayName);
    };

    window.addEventListener(
      PROJECT_AUTOCOMPLETE_SELECT_EVENT,
      handleExternalProjectSelect as EventListener,
    );
    return () => {
      window.removeEventListener(
        PROJECT_AUTOCOMPLETE_SELECT_EVENT,
        handleExternalProjectSelect as EventListener,
      );
    };
  }, [options]);

  const normalizedQuery = normalizeText(query);

  const selectedOption = useMemo(() => {
    if (!normalizedQuery) {
      return null;
    }

    const exactDisplay = options.find((option) => option.normalizedDisplay === normalizedQuery);
    if (exactDisplay) {
      return exactDisplay;
    }

    const exactNameMatches = options.filter((option) => option.normalizedName === normalizedQuery);
    if (exactNameMatches.length === 1) {
      return exactNameMatches[0];
    }

    return null;
  }, [options, normalizedQuery]);

  const selectedId = selectedOption?.id ?? "";
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const isAmbiguousName = useMemo(() => {
    if (!normalizedQuery || !duplicateNames.has(normalizedQuery)) {
      return false;
    }
    const exactNameMatches = options.filter((option) => option.normalizedName === normalizedQuery);
    return exactNameMatches.length > 1;
  }, [normalizedQuery, duplicateNames, options]);

  const findBestMatch = () => {
    if (!normalizedQuery) {
      return null;
    }

    const exactDisplay = options.find((option) => option.normalizedDisplay === normalizedQuery);
    if (exactDisplay) {
      return exactDisplay;
    }

    const exactNameMatches = options.filter((option) => option.normalizedName === normalizedQuery);
    if (exactNameMatches.length === 1) {
      return exactNameMatches[0];
    }
    if (exactNameMatches.length > 1) {
      return null;
    }

    const prefixMatches = options.filter(
      (option) =>
        option.normalizedName.startsWith(normalizedQuery) ||
        option.normalizedDisplay.startsWith(normalizedQuery),
    );
    if (prefixMatches.length === 1) {
      return prefixMatches[0];
    }
    if (prefixMatches.length > 1) {
      return null;
    }

    const containsMatches = options.filter((option) => option.searchText.includes(normalizedQuery));
    if (containsMatches.length === 1) {
      return containsMatches[0];
    }

    return null;
  };

  const applyBestMatch = () => {
    const match = findBestMatch();
    if (!match) {
      return null;
    }
    if (match.displayName !== query) {
      setQuery(match.displayName);
    }
    return match;
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
            const currentInput = event.currentTarget;
            const match = applyBestMatch();
            if (!match) {
              return;
            }
            requestAnimationFrame(() => {
              if (focusFormFieldByName(currentInput.form, "category")) {
                return;
              }
              focusNextField(currentInput);
            });
          }
        }}
        placeholder="Ketik nama / kode / klien project..."
        autoComplete="off"
        autoFocus={autoFocus}
        required
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.displayName} />
        ))}
      </datalist>
      <input type="hidden" name="project_id" value={selectedId} />
      {selectedProject ? (
        <p className="text-[11px] font-medium text-emerald-700">
          Project terpilih: {selectedProject.name} ({buildProjectContext(selectedProject)})
        </p>
      ) : isAmbiguousName ? (
        <p className="text-[11px] font-medium text-rose-600">
          Nama project sama ada lebih dari satu. Tambahkan kode/klien sebelum tekan Enter.
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          Ketik huruf awal untuk rekomendasi. Tekan Enter untuk pilih lalu lanjut ke field berikutnya.
        </p>
      )}
    </div>
  );
}
