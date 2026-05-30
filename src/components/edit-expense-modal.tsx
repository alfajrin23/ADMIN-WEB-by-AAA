"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { updateExpenseAction, getEditExpenseModalDataAction } from "@/app/actions/expense.action";
import { CloseIcon, SaveIcon } from "@/components/icons";
import { RupiahInput } from "@/components/rupiah-input";
import { SPECIALIST_COST_PRESETS, toCategorySlug } from "@/lib/constants";
import type { ProjectExpenseSearchResult } from "@/lib/types";

type EditExpenseModalProps = {
  expenseId: string;
  onClose: () => void;
  onOptimisticSave?: (formData: FormData, nextValue: ProjectExpenseSearchResult) => void;
};

function getFormText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getFormAmount(formData: FormData, key: string) {
  const value = getFormText(formData, key).replace(/\./g, "").replace(",", ".");
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function EditExpenseModal({ expenseId, onClose, onOptimisticSave }: EditExpenseModalProps) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getEditExpenseModalDataAction>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryText = searchParams.toString();
  const returnTo = queryText ? `${pathname}?${queryText}` : pathname;

  useEffect(() => {
    let active = true;
    getEditExpenseModalDataAction(expenseId).then((result) => {
      if (active) {
        setData(result);
        setIsLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [expenseId]);

  if (isLoading) {
    return (
      <div className="modal-overlay fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-950/45" />
        <div className="panel relative z-10 p-5 text-center text-sm font-medium text-slate-600">
          Loading data biaya...
        </div>
      </div>
    );
  }

  if (!data?.expense) {
    return (
      <div className="modal-overlay fixed inset-0 z-[80] flex items-center justify-center p-4">
        <button type="button" onClick={onClose} className="absolute inset-0 bg-slate-950/45" />
        <div className="panel relative z-10 p-5 text-center text-sm font-medium text-rose-600">
          Biaya tidak ditemukan. <br />
          <button onClick={onClose} className="mt-2 text-blue-600 underline">Tutup</button>
        </div>
      </div>
    );
  }

  const { expense, projects, expenseCategories } = data;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!onOptimisticSave) {
      return;
    }
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const projectId = getFormText(formData, "project_id");
    const selectedCategory = toCategorySlug(
      getFormText(formData, "category_custom") || getFormText(formData, "category"),
    );
    const rawAmount = Math.abs(getFormAmount(formData, "amount"));
    const amount = getFormText(formData, "amount_mode") === "kurangi" ? -rawAmount : rawAmount;
    onOptimisticSave(formData, {
      expenseId: expense.id,
      projectId,
      projectName: projects.find((project) => project.id === projectId)?.name ?? "Project",
      expenseDate: getFormText(formData, "expense_date"),
      requesterName: getFormText(formData, "requester_name") || null,
      description: getFormText(formData, "description") || null,
      usageInfo: getFormText(formData, "usage_info") || null,
      recipientName: getFormText(formData, "recipient_name") || null,
      category: selectedCategory || expense.category,
      amount,
    });
  };

  return (
    <div className="modal-overlay fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup modal edit"
        className="absolute inset-0 bg-slate-950/45"
      />
      <section className="modal-card panel relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Edit Biaya Project</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            <span className="btn-icon bg-slate-100 text-slate-600">
              <CloseIcon />
            </span>
            Tutup
          </button>
        </div>

        <form action={onOptimisticSave ? undefined : updateExpenseAction as (formData: FormData) => Promise<void>} onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input type="hidden" name="expense_id" value={expense.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
            <select name="project_id" defaultValue={expense.projectId} required>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Kategori</label>
              <select name="category" defaultValue={expense.category} required>
                {expenseCategories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal</label>
              <input type="date" name="expense_date" defaultValue={expense.expenseDate} required />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Kategori baru (opsional)</label>
            <input name="category_custom" placeholder="Isi jika ingin mengganti ke kategori baru" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Nama pengajuan</label>
              <input name="requester_name" defaultValue={expense.requesterName ?? ""} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Penerima / vendor</label>
              <input name="recipient_name" defaultValue={expense.recipientName ?? ""} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
            <input name="description" defaultValue={expense.description ?? ""} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Informasi penggunaan</label>
            <input name="usage_info" defaultValue={expense.usageInfo ?? ""} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Qty</label>
              <input type="number" min={0} step={1} name="quantity" defaultValue={expense.quantity} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Satuan</label>
              <input name="unit_label" defaultValue={expense.unitLabel ?? ""} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Harga satuan</label>
              <RupiahInput name="unit_price" defaultValue={expense.unitPrice} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Spesialis (preset)</label>
              <select
                name="specialist_type"
                defaultValue={
                  SPECIALIST_COST_PRESETS.some((item) => item.value === expense.specialistType)
                    ? String(expense.specialistType)
                    : ""
                }
              >
                <option value="">Pilih jika kategori Upah Tim Spesialis</option>
                {SPECIALIST_COST_PRESETS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Spesialis (custom)</label>
              <input
                name="specialist_type_custom"
                defaultValue={
                  SPECIALIST_COST_PRESETS.some((item) => item.value === expense.specialistType)
                    ? ""
                    : (expense.specialistType ?? "")
                }
                placeholder="Contoh: Plumbing, Finishing, Mekanikal"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nominal biaya total</label>
            <RupiahInput name="amount" defaultValue={Math.abs(expense.amount)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Mode transaksi</label>
            <select name="amount_mode" defaultValue={expense.amount < 0 ? "kurangi" : "tambah"}>
              <option value="tambah">Tambah</option>
              <option value="kurangi">Kurangi</option>
            </select>
          </div>
          <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
            <span className="btn-icon icon-float-soft bg-white/20 text-white">
              <SaveIcon />
            </span>
            Simpan Perubahan
          </button>
        </form>
      </section>
    </div>
  );
}
