"use client";

import { useRef, useState } from "react";
import {
  KMP_MATERIAL_IMPORT_MAX_FILE_SIZE,
} from "@/lib/kmp-material-import/validators";

type ImportUploadStepProps = {
  file: File | null;
  error: string;
  isAnalyzing: boolean;
  onFileChange: (file: File | null) => void;
  onAnalyze: () => void;
  onCancel: () => void;
};

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImportUploadStep({
  file,
  error,
  isAnalyzing,
  onFileChange,
  onAnalyze,
  onCancel,
}: ImportUploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptFile = (candidate: File | undefined) => {
    if (!candidate) {
      return;
    }
    onFileChange(candidate);
  };

  return (
    <div className="space-y-4">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) {
            setIsDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          acceptFile(event.dataTransfer.files[0]);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-slate-50 hover:border-blue-300"
        }`}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
          📊
        </div>
        <h4 className="mt-4 text-base font-black text-slate-900">
          Tarik file REAL COST ke area ini
        </h4>
        <p className="mt-2 text-sm text-slate-500">
          Hanya .xlsx, maksimal {KMP_MATERIAL_IMPORT_MAX_FILE_SIZE / 1024 / 1024} MB.
          File belum disimpan pada tahap ini.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => acceptFile(event.currentTarget.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          Pilih File Excel
        </button>
      </div>

      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-emerald-950">{file.name}</p>
            <p className="mt-1 text-xs text-emerald-700">{formatFileSize(file.size)}</p>
          </div>
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => {
              onFileChange(null);
              if (inputRef.current) {
                inputRef.current.value = "";
              }
            }}
            className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            Ganti
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={isAnalyzing}
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={!file || isAnalyzing}
          onClick={onAnalyze}
          className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAnalyzing ? "Menganalisis file..." : "Analisis File"}
        </button>
      </div>
    </div>
  );
}
