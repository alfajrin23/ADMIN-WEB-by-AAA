"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/icons";

type AttendanceSearchInputProps = {
  initialValue: string;
  placeholder?: string;
};

const ATTENDANCE_RECAP_SELECTION_FORM_ID = "attendance-recap-selection-form";

function normalizeSelectedAttendanceIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}

function getVisibleAttendanceSelectionState(formId: string) {
  const checkboxes = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[data-attendance-selection="true"][form="${formId}"]`,
    ),
  );
  return {
    visibleIds: normalizeSelectedAttendanceIds(checkboxes.map((input) => input.value)),
    checkedIds: normalizeSelectedAttendanceIds(
      checkboxes.filter((input) => input.checked).map((input) => input.value),
    ),
  };
}

function mergeAttendanceSelectedIds(params: {
  searchParamSelectedIds: string[];
  visibleIds: string[];
  checkedIds: string[];
}) {
  const visibleIdSet = new Set(params.visibleIds);
  const hiddenSelectedIds = params.searchParamSelectedIds.filter((selectedId) => !visibleIdSet.has(selectedId));
  return normalizeSelectedAttendanceIds([...hiddenSelectedIds, ...params.checkedIds]);
}

export function AttendanceSearchInput({
  initialValue,
  placeholder = "Cari nama karyawan...",
}: AttendanceSearchInputProps) {
  return (
    <AttendanceSearchInputInner
      key={initialValue}
      initialValue={initialValue}
      placeholder={placeholder}
    />
  );
}

function AttendanceSearchInputInner({
  initialValue,
  placeholder = "Cari nama karyawan...",
}: AttendanceSearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<number | null>(null);
  const lastAppliedQuery = useRef(initialValue.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [currentValue, setCurrentValue] = useState(initialValue);

  const applySearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed === lastAppliedQuery.current) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }
      const selectedIds = mergeAttendanceSelectedIds({
        searchParamSelectedIds: normalizeSelectedAttendanceIds(searchParams.getAll("selected")),
        ...getVisibleAttendanceSelectionState(ATTENDANCE_RECAP_SELECTION_FORM_ID),
      });
      params.delete("selected");
      for (const selectedId of selectedIds) {
        params.append("selected", selectedId);
      }
      params.delete("success");
      params.delete("error");

      const queryText = params.toString();
      router.replace(queryText ? `${pathname}?${queryText}` : pathname, { scroll: false });
      lastAppliedQuery.current = trimmed;
    },
    [pathname, router, searchParams],
  );

  const handleClear = () => {
    setCurrentValue("");
    applySearch("");
    inputRef.current?.focus();
  };

  const hasValue = currentValue.trim().length > 0;

  return (
    <div className="attendance-search-wrapper" data-focused={isFocused} data-has-value={hasValue}>
      <div className="attendance-search-inner">
        <span className="attendance-search-icon" data-focused={isFocused}>
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          key={initialValue}
          defaultValue={initialValue}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setCurrentValue(nextValue);
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = window.setTimeout(() => applySearch(nextValue), 220);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          autoComplete="off"
          className="attendance-search-input"
        />
        {hasValue ? (
          <button
            type="button"
            onClick={handleClear}
            className="attendance-search-clear"
            aria-label="Hapus pencarian"
          >
            <CloseIcon />
          </button>
        ) : (
          <span className="attendance-search-shortcut">
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </span>
        )}
      </div>
    </div>
  );
}
