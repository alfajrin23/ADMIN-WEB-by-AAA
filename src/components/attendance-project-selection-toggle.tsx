"use client";

import { useEffect, useMemo, useState } from "react";

type AttendanceProjectSelectionToggleProps = {
  formId: string;
  scopeKey: string;
};

function getAttendanceSelectionCheckboxes(formId: string, scopeKey: string) {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[data-attendance-selection="true"][data-attendance-scope="${scopeKey}"][form="${formId}"]`,
    ),
  );
}

export function AttendanceProjectSelectionToggle({
  formId,
  scopeKey,
}: AttendanceProjectSelectionToggleProps) {
  const [selectedCount, setSelectedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const allSelected = useMemo(
    () => totalCount > 0 && selectedCount === totalCount,
    [selectedCount, totalCount],
  );

  useEffect(() => {
    const syncState = () => {
      const checkboxes = getAttendanceSelectionCheckboxes(formId, scopeKey);
      const checked = checkboxes.filter((item) => item.checked).length;
      setSelectedCount(checked);
      setTotalCount(checkboxes.length);
    };

    syncState();
    const observer = new MutationObserver(syncState);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", syncState);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", syncState);
    };
  }, [formId, scopeKey]);

  const toggleAll = (checked: boolean) => {
    const checkboxes = getAttendanceSelectionCheckboxes(formId, scopeKey);
    for (const checkbox of checkboxes) {
      checkbox.checked = checked;
    }
    setSelectedCount(checked ? checkboxes.length : 0);
    setTotalCount(checkboxes.length);
  };

  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
      <input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} />
      Pilih semua ({selectedCount}/{totalCount})
    </label>
  );
}
