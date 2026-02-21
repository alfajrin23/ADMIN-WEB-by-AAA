"use client";

import { useMemo, useState } from "react";
import { CloseIcon, DetailIcon, DownloadIcon, ExcelIcon, PdfIcon } from "@/components/icons";

type ReportIconType = "pdf" | "excel" | "detail";

type ReportDownloadPreviewButtonProps = {
  label: string;
  className: string;
  iconType: ReportIconType;
  downloadPath: string;
  previewPath?: string;
  selectedFormId?: string;
  selectedOnly?: boolean;
};

function getSelectedProjectIds(formId: string) {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[data-project-selection="true"][form="${formId}"]:checked`,
    ),
  )
    .map((checkbox) => checkbox.value.trim())
    .filter((value) => value.length > 0);
}

function buildUrl(basePath: string, options: { selectedFormId?: string; selectedOnly?: boolean }) {
  const url = new URL(basePath, window.location.origin);
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

  url.searchParams.set("selected_only", "1");
  for (const projectId of selectedIds) {
    url.searchParams.append("project", projectId);
  }
  return {
    href: `${url.pathname}${url.search}`,
    hasSelection: true,
  };
}

function withPreviewQuery(href: string) {
  return href.includes("?") ? `${href}&preview=1` : `${href}?preview=1`;
}

function renderIcon(iconType: ReportIconType) {
  if (iconType === "excel") {
    return <ExcelIcon />;
  }
  if (iconType === "detail") {
    return <DetailIcon />;
  }
  return <PdfIcon />;
}

export function ReportDownloadPreviewButton({
  label,
  className,
  iconType,
  downloadPath,
  previewPath,
  selectedFormId,
  selectedOnly = false,
}: ReportDownloadPreviewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [downloadHref, setDownloadHref] = useState("");
  const [previewHref, setPreviewHref] = useState("");
  const isExcel = useMemo(() => iconType === "excel", [iconType]);

  const handleOpenPreview = () => {
    const download = buildUrl(downloadPath, { selectedFormId, selectedOnly });
    if (!download.hasSelection) {
      window.alert("Pilih minimal satu project terlebih dahulu.");
      return;
    }
    const previewBase = previewPath ?? downloadPath;
    const preview = buildUrl(previewBase, { selectedFormId, selectedOnly });
    setDownloadHref(download.href);
    setPreviewHref(withPreviewQuery(preview.href));
    setIsOpen(true);
  };

  return (
    <>
      <button type="button" data-ui-button="true" className={className} onClick={handleOpenPreview}>
        <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
          {renderIcon(iconType)}
        </span>
        {label}
      </button>

      {isOpen ? (
        <div className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Tutup preview"
            className="absolute inset-0 bg-slate-950/45"
            onClick={() => setIsOpen(false)}
          />
          <section className="modal-card panel relative z-10 flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Preview Laporan</h3>
              <button
                type="button"
                data-ui-button="true"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                onClick={() => setIsOpen(false)}
              >
                <span className="btn-icon bg-slate-100 text-slate-600">
                  <CloseIcon />
                </span>
                Tutup
              </button>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200">
              <iframe
                title="Preview laporan"
                src={previewHref}
                className="h-full w-full"
              />
            </div>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                data-ui-button="true"
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white ${
                  isExcel ? "bg-emerald-700 hover:bg-emerald-600" : "bg-indigo-700 hover:bg-indigo-600"
                }`}
                onClick={() => window.open(downloadHref, "_blank", "noopener,noreferrer")}
              >
                <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                  <DownloadIcon />
                </span>
                Download
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
