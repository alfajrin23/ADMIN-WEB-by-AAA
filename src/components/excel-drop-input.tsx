"use client";

import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { UploadIcon } from "@/components/icons";

type ExcelDropInputProps = {
  name: string;
};

const excelAccept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isExcelFile(file: File) {
  return (
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

export function ExcelDropInput({ name }: ExcelDropInputProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const setInputFile = (file: File) => {
    if (!inputRef.current) {
      return;
    }

    if (!isExcelFile(file)) {
      inputRef.current.value = "";
      inputRef.current.setCustomValidity("Pilih file Excel (.xlsx).");
      inputRef.current.reportValidity();
      setFileName(null);
      return;
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputRef.current.files = transfer.files;
    inputRef.current.setCustomValidity("");
    setFileName(file.name);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      setInputFile(droppedFile);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.setCustomValidity("");
    setFileName(selectedFile?.name ?? null);
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-all duration-200 ${
          isDragOver
            ? "border-emerald-500 bg-emerald-100/70 shadow-lg shadow-emerald-200"
            : "border-emerald-300 bg-emerald-50 hover:border-emerald-500 hover:bg-emerald-100/70"
        }`}
      >
        <span className="btn-icon icon-float-soft h-7 w-7 bg-emerald-200 text-emerald-700">
          <UploadIcon />
        </span>
        <p className="text-sm font-semibold text-emerald-900">Drag & drop file Excel di sini</p>
        <p className="text-xs text-emerald-700">atau klik tombol di bawah</p>
        <span className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5">
          Choose File
        </span>
      </label>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        name={name}
        accept={excelAccept}
        required
        className="sr-only"
        onChange={handleInputChange}
      />

      <p className="text-xs text-slate-500">
        {fileName ? `File terpilih: ${fileName}` : "Belum ada file dipilih."}
      </p>
      <p className="text-xs text-slate-500">Format yang didukung: .xlsx</p>
    </div>
  );
}
