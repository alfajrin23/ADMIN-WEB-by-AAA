"use client";

import { useEffect, useState } from "react";
import { CheckIcon, ClipboardIcon } from "@/components/icons";
import { buildReportUrl } from "@/lib/report-client";

type ReportCopyButtonProps = {
  label: string;
  className: string;
  copyPath: string;
  selectedFormId?: string;
  selectedOnly?: boolean;
  projectIds?: string[];
  successLabel?: string;
};

async function writeTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fallback below keeps copy working in older/stricter browsers.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const isCopied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!isCopied) {
    throw new Error("Clipboard browser tidak tersedia.");
  }
}

export function ReportCopyButton({
  label,
  className,
  copyPath,
  selectedFormId,
  selectedOnly = false,
  projectIds,
  successLabel = "Tersalin",
}: ReportCopyButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  useEffect(() => {
    if (status !== "success") {
      return;
    }

    const timeoutId = window.setTimeout(() => setStatus("idle"), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const handleCopy = async () => {
    const target = buildReportUrl(copyPath, { selectedFormId, selectedOnly, projectIds });
    if (!target.hasSelection) {
      window.alert("Pilih minimal satu project terlebih dahulu.");
      return;
    }

    try {
      setStatus("loading");
      const response = await fetch(target.href, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(responseText.trim() || "Gagal menyalin laporan.");
      }
      if (!responseText.trim()) {
        throw new Error("Laporan tidak memiliki isi untuk disalin.");
      }

      await writeTextToClipboard(responseText);
      setStatus("success");
    } catch (error) {
      console.error("Copy report clipboard gagal.", error);
      setStatus("idle");
      window.alert(error instanceof Error ? error.message : "Gagal menyalin laporan.");
    }
  };

  const buttonLabel =
    status === "loading" ? "Menyalin..." : status === "success" ? successLabel : label;

  return (
    <button
      type="button"
      data-ui-button="true"
      className={`${className} disabled:cursor-not-allowed disabled:opacity-70`}
      disabled={status === "loading"}
      onClick={handleCopy}
    >
      <span
        className={`btn-icon ${
          status === "success"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-white/20 text-current"
        }`}
      >
        {status === "success" ? <CheckIcon /> : <ClipboardIcon />}
      </span>
      {buttonLabel}
    </button>
  );
}
