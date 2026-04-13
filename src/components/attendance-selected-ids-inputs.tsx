"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type AttendanceSelectedIdsInputsProps = {
  sourceFormId: string;
};

function normalizeSelectedAttendanceIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}

function getVisibleAttendanceSelectionState(sourceFormId: string) {
  const checkboxes = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[data-attendance-selection="true"][form="${sourceFormId}"]`,
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

export function AttendanceSelectedIdsInputs({
  sourceFormId,
}: AttendanceSelectedIdsInputsProps) {
  const searchParams = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const syncState = () => {
      setSelectedIds(
        mergeAttendanceSelectedIds({
          searchParamSelectedIds: normalizeSelectedAttendanceIds(searchParams.getAll("selected")),
          ...getVisibleAttendanceSelectionState(sourceFormId),
        }),
      );
    };

    syncState();
    const observer = new MutationObserver(syncState);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", syncState);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", syncState);
    };
  }, [searchParams, sourceFormId]);

  return (
    <>
      {selectedIds.map((selectedId) => (
        <input key={selectedId} type="hidden" name="selected" value={selectedId} />
      ))}
    </>
  );
}
