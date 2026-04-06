"use client";

import { useId, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { AttendanceWorkerPreset } from "@/lib/attendance-worker-presets";

type AttendanceWorkerNameInputProps = {
  name: string;
  workerOptions: AttendanceWorkerPreset[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatWageRange(worker: AttendanceWorkerPreset) {
  if (worker.wageMin <= 0 && worker.wageMax <= 0) {
    return "Upah referensi belum tersedia";
  }
  if (worker.wageMin === worker.wageMax) {
    return formatCurrency(worker.wageMin);
  }
  return `${formatCurrency(worker.wageMin)} - ${formatCurrency(worker.wageMax)}`;
}

export function AttendanceWorkerNameInput({
  name,
  workerOptions,
  defaultValue = "",
  placeholder,
  required = false,
  autoFocus = false,
}: AttendanceWorkerNameInputProps) {
  const generatedId = useId();
  const [value, setValue] = useState(defaultValue);

  const matchedWorker = useMemo(() => {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) {
      return null;
    }
    return workerOptions.find((item) => normalizeText(item.name) === normalizedValue) ?? null;
  }, [value, workerOptions]);

  return (
    <>
      <input
        name={name}
        list={generatedId}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <datalist id={generatedId}>
        {workerOptions.map((item) => (
          <option key={item.name} value={item.name}>
            {`${item.sourceLabels.join(", ")} | ${formatWageRange(item)}`}
          </option>
        ))}
      </datalist>
      <p className="mt-1 text-[11px] text-slate-500">
        {matchedWorker
          ? `Referensi master: ${matchedWorker.sourceLabels.join(", ")}. Upah acuan ${formatWageRange(
              matchedWorker,
            )}${matchedWorker.referenceCount > 1 ? ". Nama ini muncul lebih dari satu kali di file master." : "."}`
          : workerOptions.length > 0
            ? `Master pekerja tersedia (${workerOptions.length} nama unik), ditampilkan tanpa grouping di form input.`
            : "Master pekerja belum ditemukan, jadi nama pekerja diisi manual."}
      </p>
    </>
  );
}
