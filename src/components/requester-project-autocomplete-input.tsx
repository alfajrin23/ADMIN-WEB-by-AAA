"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

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
  projectClientNameById?: Record<string, string | null>;
  currentProjectId?: string;
  value?: string;
  onValueChange?: (value: string) => void;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function resolveClientScopeName(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || "Tanpa Klien";
}

function resolveClientScopeKey(value: string | null | undefined) {
  return resolveClientScopeName(value).toLowerCase();
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
  projectClientNameById,
  currentProjectId,
  value,
  onValueChange,
}: RequesterProjectAutocompleteInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState(value ?? "");
  const [detectedProjectId, setDetectedProjectId] = useState(currentProjectId?.trim() ?? "");
  const activeValue = value ?? internalValue;
  const activeProjectId = currentProjectId?.trim() ?? detectedProjectId;

  const updateValue = useCallback(
    (nextValue: string) => {
      if (value === undefined) {
        setInternalValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );

  const resolveCurrentProjectId = useCallback(() => {
    if (typeof currentProjectId === "string") {
      return currentProjectId.trim();
    }
    const form = inputRef.current?.form;
    if (!(form instanceof HTMLFormElement)) {
      return "";
    }
    return getNamedFieldValue(form, projectFieldName).trim();
  }, [currentProjectId, projectFieldName]);

  const syncCurrentProjectId = useCallback(() => {
    const currentProjectId = resolveCurrentProjectId();
    setDetectedProjectId(currentProjectId);
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

  const normalizedValue = normalizeText(activeValue);

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

  const currentClientScopeName = useMemo(() => {
    if (!activeProjectId) {
      return "";
    }
    return resolveClientScopeName(projectClientNameById?.[activeProjectId] ?? null);
  }, [activeProjectId, projectClientNameById]);

  const currentClientScopeKey = useMemo(() => {
    if (!activeProjectId) {
      return "";
    }
    return resolveClientScopeKey(projectClientNameById?.[activeProjectId] ?? null);
  }, [activeProjectId, projectClientNameById]);

  const scopedSuggestions = useMemo(() => {
    if (!currentClientScopeKey) {
      return dedupedSuggestions;
    }
    return dedupedSuggestions.filter(
      (option) => resolveClientScopeKey(option.clientName) === currentClientScopeKey,
    );
  }, [currentClientScopeKey, dedupedSuggestions]);

  const requesterNameSuggestions = useMemo(() => {
    const uniqueNames = new Set<string>();
    for (const option of scopedSuggestions) {
      uniqueNames.add(option.requesterName);
    }
    return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b, "id-ID"));
  }, [scopedSuggestions]);

  const matchingProjectOptions = useMemo(() => {
    if (!normalizedValue) {
      return [];
    }
    return scopedSuggestions.filter(
      (option) => normalizeText(option.requesterName) === normalizedValue,
    );
  }, [normalizedValue, scopedSuggestions]);

  const typedRequesterMatches = useMemo(() => {
    if (!normalizedValue) {
      return [];
    }

    const groupedMatches = new Map<
      string,
      {
        requesterName: string;
        projectCount: number;
      }
    >();

    for (const option of scopedSuggestions) {
      const normalizedRequester = normalizeText(option.requesterName);
      if (!normalizedRequester.includes(normalizedValue)) {
        continue;
      }

      if (!groupedMatches.has(normalizedRequester)) {
        groupedMatches.set(normalizedRequester, {
          requesterName: option.requesterName,
          projectCount: 0,
        });
      }

      groupedMatches.get(normalizedRequester)!.projectCount += 1;
    }

    return Array.from(groupedMatches.values())
      .sort((a, b) => {
        if (a.projectCount !== b.projectCount) {
          return b.projectCount - a.projectCount;
        }
        return a.requesterName.localeCompare(b.requesterName, "id-ID");
      })
      .slice(0, 6);
  }, [normalizedValue, scopedSuggestions]);

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

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        name={name}
        value={activeValue}
        onChange={(event) => {
          updateValue(event.currentTarget.value);
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
          if (bestMatch && bestMatch !== event.currentTarget.value) {
            updateValue(bestMatch);
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
          Histori nama ini
          {currentClientScopeName ? ` pada klien ${currentClientScopeName}` : ""} ada di project:{" "}
          {buildProjectContext(matchingProjectOptions[0])}
        </p>
      ) : matchingProjectOptions.length > 1 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <p className="font-semibold">
            Nama ini
            {currentClientScopeName ? ` pada klien ${currentClientScopeName}` : ""} ada di{" "}
            {matchingProjectOptions.length} project. Ini hanya keterangan, input tetap bisa dilanjutkan:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {matchingProjectOptions.map((option) => (
              <span
                key={`${option.projectId}|${option.requesterName}`}
                className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                  activeProjectId === option.projectId
                    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                    : "border-amber-300 bg-white text-amber-700"
                }`}
              >
                {buildProjectContext(option)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-amber-700">
            Keterangan ini tidak akan mengubah pilihan project yang sudah dipilih.
          </p>
        </div>
      ) : typedRequesterMatches.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          <p className="font-semibold text-slate-700">
            Histori nama serupa
            {currentClientScopeName ? ` pada klien ${currentClientScopeName}` : ""}:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {typedRequesterMatches.map((item) => (
              <span
                key={item.requesterName}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600"
              >
                {item.requesterName} - {item.projectCount} project
              </span>
            ))}
          </div>
        </div>
      ) : activeProjectId && requesterNameSuggestions.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          Belum ada histori nama pengajuan untuk klien {currentClientScopeName}.
        </p>
      ) : activeProjectId ? (
        <p className="text-[11px] text-slate-500">
          Saran nama pengajuan mengikuti histori klien {currentClientScopeName}.
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          Pilih project dulu agar saran nama pengajuan mengikuti klien.
        </p>
      )}
    </div>
  );
}
