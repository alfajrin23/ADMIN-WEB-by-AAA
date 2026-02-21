"use client";

import { useEffect, useMemo, useState } from "react";

type ProjectsSelectionToggleProps = {
  formId: string;
};

function getProjectCheckboxes(formId: string) {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[data-project-selection="true"][form="${formId}"]`,
    ),
  );
}

export function ProjectsSelectionToggle({ formId }: ProjectsSelectionToggleProps) {
  const [selectedCount, setSelectedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const allSelected = useMemo(
    () => totalCount > 0 && selectedCount === totalCount,
    [selectedCount, totalCount],
  );

  useEffect(() => {
    const syncState = () => {
      const checkboxes = getProjectCheckboxes(formId);
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
  }, [formId]);

  const toggleAll = (checked: boolean) => {
    const checkboxes = getProjectCheckboxes(formId);
    for (const checkbox of checkboxes) {
      checkbox.checked = checked;
    }
    setSelectedCount(checked ? checkboxes.length : 0);
    setTotalCount(checkboxes.length);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(event) => toggleAll(event.target.checked)}
        />
        Pilih Semua Rekapan
      </label>
      <span className="text-xs text-slate-500">
        {selectedCount}/{totalCount} terpilih
      </span>
    </div>
  );
}
