"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { PROJECT_AUTOCOMPLETE_SELECT_EVENT } from "@/components/project-autocomplete";

type RequesterProjectSuggestion = {
  requesterName: string;
  projectId: string;
  projectName: string;
  projectCode?: string | null;
  clientName?: string | null;
};

type RequesterProjectAutocompleteInputProps = {
  name: string;
  suggestions: RequesterProjectSuggestion[];
  placeholder?: string;
  required?: boolean;
  projectFieldName?: string;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
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

function getNamedFieldValue(form: HTMLFormElement, fieldName: string) {
  const target = form.elements.namedItem(fieldName);
  if (target instanceof RadioNodeList) {
    return typeof target.value === "string" ? target.value : "";
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return target.value;
  }
  return "";
}

function dispatchProjectSelection(projectId: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(PROJECT_AUTOCOMPLETE_SELECT_EVENT, {
      detail: {
        projectId,
      },
    }),
  );
}

function buildProjectContext(option: RequesterProjectSuggestion) {
  const segments = [option.projectName];
  if (option.projectCode?.trim()) {
    segments.push(`Kode: ${option.projectCode.trim()}`);
  }
  if (option.clientName?.trim()) {
    segments.push(`Klien: ${option.clientName.trim()}`);
  }
  return segments.join(" | ");
}

export function RequesterProjectAutocompleteInput({
  name,
  suggestions,
  placeholder,
  required,
  projectFieldName = "project_id",
}: RequesterProjectAutocompleteInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [projectId, setProjectId] = useState("");
  const [needsProjectChoice, setNeedsProjectChoice] = useState(false);

  const resolveCurrentProjectId = useCallback(() => {
    const form = inputRef.current?.form;
    if (!(form instanceof HTMLFormElement)) {
      return "";
    }
    return getNamedFieldValue(form, projectFieldName).trim();
  }, [projectFieldName]);

  const syncCurrentProjectId = useCallback(() => {
    const currentProjectId = resolveCurrentProjectId();
    setProjectId(currentProjectId);
    return currentProjectId;
  }, [resolveCurrentProjectId]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const handleSync = () => {
      syncCurrentProjectId();
    };

    handleSync();
    form.addEventListener("input", handleSync);
    form.addEventListener("change", handleSync);

    return () => {
      form.removeEventListener("input", handleSync);
      form.removeEventListener("change", handleSync);
    };
  }, [syncCurrentProjectId]);

  const normalizedValue = normalizeText(value);

  const dedupedSuggestions = useMemo(() => {
    const unique = new Map<string, RequesterProjectSuggestion>();
    for (const option of suggestions) {
      const requesterName = option.requesterName.trim();
      const linkedProjectId = option.projectId.trim();
      if (!requesterName || !linkedProjectId) {
        continue;
      }
      const key = `${normalizeText(requesterName)}|${linkedProjectId}`;
      if (!unique.has(key)) {
        unique.set(key, {
          ...option,
          requesterName,
          projectId: linkedProjectId,
        });
      }
    }
    return Array.from(unique.values());
  }, [suggestions]);

  const requesterNameSuggestions = useMemo(() => {
    const uniqueNames = new Set<string>();
    for (const option of dedupedSuggestions) {
      uniqueNames.add(option.requesterName);
    }
    return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b, "id-ID"));
  }, [dedupedSuggestions]);

  const matchingProjectOptions = useMemo(() => {
    if (!normalizedValue) {
      return [];
    }
    return dedupedSuggestions.filter(
      (option) => normalizeText(option.requesterName) === normalizedValue,
    );
  }, [dedupedSuggestions, normalizedValue]);

  const applyBestRequesterMatch = useCallback(
    (inputValue: string) => {
      const normalizedInput = normalizeText(inputValue);
      if (!normalizedInput) {
        return null;
      }

      const exactMatch = requesterNameSuggestions.find(
        (item) => normalizeText(item) === normalizedInput,
      );
      if (exactMatch) {
        return exactMatch;
      }

      const prefixMatch = requesterNameSuggestions.find((item) =>
        normalizeText(item).startsWith(normalizedInput),
      );
      if (prefixMatch) {
        return prefixMatch;
      }

      const containsMatch = requesterNameSuggestions.find((item) =>
        normalizeText(item).includes(normalizedInput),
      );
      if (containsMatch) {
        return containsMatch;
      }

      return null;
    },
    [requesterNameSuggestions],
  );

  const syncProjectByRequester = useCallback(
    (requesterName: string, currentProjectId: string) => {
      const normalizedRequesterName = normalizeText(requesterName);
      if (!normalizedRequesterName) {
        setNeedsProjectChoice(false);
        return true;
      }

      const matchedOptions = dedupedSuggestions.filter(
        (option) => normalizeText(option.requesterName) === normalizedRequesterName,
      );
      if (matchedOptions.length === 0) {
        setNeedsProjectChoice(false);
        return true;
      }

      if (matchedOptions.length === 1) {
        const resolvedProjectId = matchedOptions[0].projectId;
        if (resolvedProjectId) {
          dispatchProjectSelection(resolvedProjectId);
          setProjectId(resolvedProjectId);
        }
        setNeedsProjectChoice(false);
        return true;
      }

      const hasSelectedProjectInMatches = matchedOptions.some(
        (option) => option.projectId === currentProjectId,
      );
      if (hasSelectedProjectInMatches) {
        setNeedsProjectChoice(false);
        return true;
      }

      setNeedsProjectChoice(true);
      return false;
    },
    [dedupedSuggestions],
  );

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        name={name}
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          setNeedsProjectChoice(false);
        }}
        onFocus={() => {
          syncCurrentProjectId();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          const currentInput = event.currentTarget;

          const bestMatch = applyBestRequesterMatch(event.currentTarget.value);
          const resolvedRequesterName = bestMatch ?? event.currentTarget.value;
          if (bestMatch && bestMatch !== event.currentTarget.value) {
            setValue(bestMatch);
          }

          const currentProjectId = syncCurrentProjectId();
          const canContinue = syncProjectByRequester(resolvedRequesterName, currentProjectId);
          if (!canContinue) {
            return;
          }

          requestAnimationFrame(() => {
            focusNextField(currentInput);
          });
        }}
        list={listId}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
      />
      <datalist id={listId}>
        {requesterNameSuggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

      {matchingProjectOptions.length === 1 ? (
        <p className="text-[11px] font-medium text-emerald-700">
          Otomatis cocok ke project: {buildProjectContext(matchingProjectOptions[0])}
        </p>
      ) : matchingProjectOptions.length > 1 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <p className="font-semibold">
            Nama ini ada di {matchingProjectOptions.length} project. Pilih project agar tidak salah input:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {matchingProjectOptions.map((option) => (
              <button
                key={`${option.projectId}|${option.requesterName}`}
                type="button"
                data-ui-button="true"
                onClick={() => {
                  dispatchProjectSelection(option.projectId);
                  setProjectId(option.projectId);
                  setNeedsProjectChoice(false);
                  requestAnimationFrame(() => {
                    focusNextField(inputRef.current);
                  });
                }}
                className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                  projectId === option.projectId
                    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                    : "border-amber-300 bg-white text-amber-700 hover:bg-amber-100"
                }`}
              >
                {buildProjectContext(option)}
              </button>
            ))}
          </div>
          {needsProjectChoice ? (
            <p className="mt-2 font-semibold text-rose-700">
              Tekan salah satu project di atas dulu, lalu lanjut isi field berikutnya.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">
          Saran nama pengajuan diambil dari histori seluruh project.
        </p>
      )}
    </div>
  );
}
