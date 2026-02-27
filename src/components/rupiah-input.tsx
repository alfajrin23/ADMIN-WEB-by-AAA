"use client";

import { useMemo, useState } from "react";

type RupiahInputProps = {
  name: string;
  defaultValue?: number;
  required?: boolean;
  placeholder?: string;
  submitOnEnter?: boolean;
};

function normalizeDigits(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  return digits.replace(/^0+(?=\d)/, "") || "0";
}

function formatThousands(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function RupiahInput({
  name,
  defaultValue = 0,
  required = false,
  placeholder,
  submitOnEnter = false,
}: RupiahInputProps) {
  const initial = Number.isFinite(defaultValue) && defaultValue > 0 ? String(Math.floor(defaultValue)) : "";
  const [rawValue, setRawValue] = useState(initial);

  const displayValue = useMemo(() => {
    if (!rawValue) {
      return "";
    }
    return formatThousands(rawValue);
  }, [rawValue]);

  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-700 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.14)]">
      <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
        Rp
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={(event) => setRawValue(normalizeDigits(event.target.value))}
        data-enter-submit={submitOnEnter ? "true" : undefined}
        required={required}
        placeholder={placeholder}
        className="!rounded-none !border-0 !shadow-none focus:!border-0 focus:!shadow-none"
      />
      <input type="hidden" name={name} value={rawValue} />
    </div>
  );
}
