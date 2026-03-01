"use client";

import { useState } from "react";
import { RupiahInput } from "@/components/rupiah-input";

type ReimburseLinesInputProps = {
  amountName?: string;
  noteName?: string;
};

type ReimburseRow = {
  id: number;
};

export function ReimburseLinesInput({
  amountName = "reimburse_amount",
  noteName = "reimburse_note",
}: ReimburseLinesInputProps) {
  const [rows, setRows] = useState<ReimburseRow[]>([{ id: 1 }]);

  const addRow = () => {
    setRows((prev) => [...prev, { id: prev[prev.length - 1].id + 1 }]);
  };

  const removeRow = (targetId: number) => {
    setRows((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((row) => row.id !== targetId);
    });
  };

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1.2fr_auto]">
          <RupiahInput name={amountName} placeholder="Nominal reimburse" />
          <input
            name={noteName}
            placeholder={`Keterangan reimburse #${index + 1}`}
            autoComplete="off"
          />
          <button
            type="button"
            data-ui-button="true"
            onClick={() => removeRow(row.id)}
            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={rows.length <= 1}
          >
            Hapus
          </button>
        </div>
      ))}
      <button
        type="button"
        data-ui-button="true"
        onClick={addRow}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
      >
        + Tambah Reimburse
      </button>
    </div>
  );
}
