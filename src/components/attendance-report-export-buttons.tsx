"use client";

import { useEffect, useMemo, useState } from "react";
import { CloseIcon, DownloadIcon, ExcelIcon, PdfIcon } from "@/components/icons";

type ExportKind = "pdf" | "excel";

type AttendanceReportExportButtonsProps = {
  formId: string;
  pdfPath?: string;
  excelPath?: string;
};

function withQuery(path: string, query: string) {
  return query.length > 0 ? `${path}?${query}` : path;
}

function withPreviewQuery(path: string) {
  return path.includes("?") ? `${path}&preview=1` : `${path}?preview=1`;
}

function getFormQuery(formId: string) {
  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) {
    return null;
  }

  const params = new URLSearchParams();
  const formData = new FormData(form);
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }
    params.append(key, trimmed);
  }

  return params.toString();
}

export function AttendanceReportExportButtons({
  formId,
  pdfPath = "/api/reports/wages",
  excelPath = "/api/reports/wages/excel",
}: AttendanceReportExportButtonsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewHref, setPreviewHref] = useState("");
  const [downloadHref, setDownloadHref] = useState("");
  const [kind, setKind] = useState<ExportKind>("pdf");
  const label = useMemo(() => (kind === "pdf" ? "Export PDF" : "Export Excel"), [kind]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }
      if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      event.preventDefault();
      if (!downloadHref) {
        return;
      }
      window.open(downloadHref, "_blank", "noopener,noreferrer");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [downloadHref, isOpen]);

  const openPreview = (nextKind: ExportKind) => {
    const query = getFormQuery(formId);
    if (query === null) {
      window.alert("Form export tidak ditemukan.");
      return;
    }

    setKind(nextKind);
    setPreviewHref(withPreviewQuery(withQuery(pdfPath, query)));
    setDownloadHref(withQuery(nextKind === "pdf" ? pdfPath : excelPath, query));
    setIsOpen(true);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openPreview("pdf")}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
        >
          <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
            <PdfIcon />
          </span>
          Export PDF
        </button>
        <button
          type="button"
          onClick={() => openPreview("excel")}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
        >
          <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
            <ExcelIcon />
          </span>
          Export Excel
        </button>
      </div>

      {isOpen ? (
        <div className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Tutup preview"
            className="absolute inset-0 bg-slate-950/45"
            onClick={() => setIsOpen(false)}
          />
          <section className="modal-card panel relative z-10 flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Preview Laporan Upah</h3>
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
              <iframe title="Preview laporan upah" src={previewHref} className="h-full w-full" />
            </div>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                data-ui-button="true"
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white ${
                  kind === "excel" ? "bg-emerald-700 hover:bg-emerald-600" : "bg-indigo-700 hover:bg-indigo-600"
                }`}
                onClick={() => window.open(downloadHref, "_blank", "noopener,noreferrer")}
              >
                <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
                  <DownloadIcon />
                </span>
                Download ({label})
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
