"use client";

import { updateManyProjectsAction } from "@/app/actions/project.action";
import { EditIcon } from "@/components/icons";
import {
  OptimisticMutationNotice,
  useOptimisticMutation,
} from "@/components/optimistic-mutation-notice";

type OptimisticProjectsBulkEditButtonProps = {
  formId: string;
};

function isChecked(formData: FormData, key: string) {
  return formData.get(key) === "1";
}

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function OptimisticProjectsBulkEditButton({
  formId,
}: OptimisticProjectsBulkEditButtonProps) {
  const { notice, runOptimisticMutation } = useOptimisticMutation();

  const handleClick = () => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    const formData = new FormData(form);
    const projectIds = formData
      .getAll("project")
      .filter((value): value is string => typeof value === "string");
    if (projectIds.length === 0) {
      return;
    }

    const cells = projectIds.flatMap((projectId) =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-optimistic-project-id="${projectId}"] [data-project-field]`,
        ),
      ),
    );
    const snapshots = cells.map((cell) => ({ cell, text: cell.textContent ?? "" }));

    void runOptimisticMutation({
      action: updateManyProjectsAction,
      formData,
      pendingMessage: `Memperbarui ${projectIds.length} project...`,
      optimisticUpdate: () => {
        for (const cell of cells) {
          const field = cell.dataset.projectField;
          if (field === "status" && isChecked(formData, "apply_status")) {
            cell.textContent = getText(formData, "status");
          }
          if (field === "client_name" && isChecked(formData, "apply_client_name")) {
            cell.textContent = getText(formData, "client_name") || "-";
          }
          if (field === "start_date" && isChecked(formData, "apply_start_date")) {
            cell.textContent = getText(formData, "start_date") || "-";
          }
        }
      },
      rollback: () => {
        for (const { cell, text } of snapshots) {
          cell.textContent = text;
        }
      },
    });
  };

  return (
    <>
      <OptimisticMutationNotice notice={notice} />
      <button type="button" onClick={handleClick} className="button-primary button-sm mt-3">
        <span className="btn-icon bg-white/20 text-white">
          <EditIcon />
        </span>
        Simpan Edit Project Terpilih
      </button>
    </>
  );
}
