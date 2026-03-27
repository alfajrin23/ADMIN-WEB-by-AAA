export type ReportUrlOptions = {
  selectedFormId?: string;
  selectedOnly?: boolean;
  projectIds?: string[];
};

export function getSelectedProjectIds(formId: string) {
  if (typeof document === "undefined") {
    return [];
  }

  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[data-project-selection="true"][form="${formId}"]:checked`,
    ),
  )
    .map((checkbox) => checkbox.value.trim())
    .filter((value) => value.length > 0);
}

export function normalizeProjectIds(projectIds: string[] | undefined) {
  return Array.from(
    new Set(
      (projectIds ?? [])
        .map((projectId) => projectId.trim())
        .filter((projectId) => projectId.length > 0),
    ),
  );
}

export function buildReportUrl(basePath: string, options: ReportUrlOptions) {
  const url = new URL(basePath, window.location.origin);
  const fixedProjectIds = normalizeProjectIds(options.projectIds);
  if (fixedProjectIds.length > 0) {
    url.searchParams.delete("selected_only");
    url.searchParams.delete("project");
    url.searchParams.set("selected_only", "1");
    for (const projectId of fixedProjectIds) {
      url.searchParams.append("project", projectId);
    }
    return {
      href: `${url.pathname}${url.search}`,
      hasSelection: true,
    };
  }

  if (!options.selectedOnly) {
    return {
      href: `${url.pathname}${url.search}`,
      hasSelection: true,
    };
  }

  const selectedIds = options.selectedFormId
    ? getSelectedProjectIds(options.selectedFormId)
    : [];
  if (selectedIds.length === 0) {
    return {
      href: `${url.pathname}${url.search}`,
      hasSelection: false,
    };
  }

  url.searchParams.delete("selected_only");
  url.searchParams.delete("project");
  url.searchParams.set("selected_only", "1");
  for (const projectId of selectedIds) {
    url.searchParams.append("project", projectId);
  }
  return {
    href: `${url.pathname}${url.search}`,
    hasSelection: true,
  };
}
