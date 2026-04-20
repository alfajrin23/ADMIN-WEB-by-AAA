"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type ProjectScopedAutocompleteInputProps = {
  name: string;
  suggestionsByProject: Record<string, string[]>;
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

export function ProjectScopedAutocompleteInput({
  name,
  suggestionsByProject,
  placeholder,
  required,
  projectFieldName = "project_id",
  projectClientNameById,
  currentProjectId,
  value,
  onValueChange,
}: ProjectScopedAutocompleteInputProps) {
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

  const visibleSuggestions = useMemo(() => {
    return suggestionsByProject[activeProjectId] ?? [];
  }, [activeProjectId, suggestionsByProject]);

  const currentClientScopeName = useMemo(() => {
    if (!activeProjectId) {
      return "";
    }
    return resolveClientScopeName(projectClientNameById?.[activeProjectId] ?? null);
  }, [activeProjectId, projectClientNameById]);

  const applyBestMatch = useCallback(
    (inputValue: string, activeSuggestions: string[]) => {
      const normalizedInput = normalizeText(inputValue);
      if (!normalizedInput) {
        return null;
      }

      const exactMatch = activeSuggestions.find(
        (item) => normalizeText(item) === normalizedInput,
      );
      if (exactMatch) {
        return exactMatch;
      }

      const prefixMatch = activeSuggestions.find((item) =>
        normalizeText(item).startsWith(normalizedInput),
      );
      if (prefixMatch) {
        return prefixMatch;
      }

      const containsMatch = activeSuggestions.find((item) =>
        normalizeText(item).includes(normalizedInput),
      );
      if (containsMatch) {
        return containsMatch;
      }

      return null;
    },
    [],
  );

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        name={name}
        value={activeValue}
        onChange={(event) => updateValue(event.currentTarget.value)}
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

          const currentProjectId = syncCurrentProjectId();
          const activeSuggestions = suggestionsByProject[currentProjectId] ?? [];
          const bestMatch = applyBestMatch(event.currentTarget.value, activeSuggestions);
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
        {visibleSuggestions.map((item) => (
          <option key={`${activeProjectId}-${item}`} value={item} />
        ))}
      </datalist>
      {activeProjectId ? (
        visibleSuggestions.length > 0 ? (
          <p className="text-[11px] text-slate-500">
            Saran keterangan mengikuti histori klien {currentClientScopeName}.
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">
            Belum ada histori keterangan untuk klien {currentClientScopeName}.
          </p>
        )
      ) : (
        <p className="text-[11px] text-slate-500">
          Pilih project dulu agar saran keterangan mengikuti klien.
        </p>
      )}
    </div>
  );
}
