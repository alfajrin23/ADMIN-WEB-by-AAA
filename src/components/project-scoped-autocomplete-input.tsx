"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type ProjectScopedAutocompleteInputProps = {
  name: string;
  suggestionsByProject: Record<string, string[]>;
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

export function ProjectScopedAutocompleteInput({
  name,
  suggestionsByProject,
  placeholder,
  required,
  projectFieldName = "project_id",
}: ProjectScopedAutocompleteInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [projectId, setProjectId] = useState("");

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

  const visibleSuggestions = useMemo(() => {
    return suggestionsByProject[projectId] ?? [];
  }, [projectId, suggestionsByProject]);

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
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
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
            setValue(bestMatch);
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
          <option key={`${projectId}-${item}`} value={item} />
        ))}
      </datalist>
    </div>
  );
}
