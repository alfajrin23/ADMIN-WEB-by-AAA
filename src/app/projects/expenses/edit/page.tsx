import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteExpenseAction, updateExpenseAction } from "@/app/actions";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { SaveIcon, TrashIcon } from "@/components/icons";
import { RupiahInput } from "@/components/rupiah-input";
import { SPECIALIST_COST_PRESETS } from "@/lib/constants";
import { getExpenseById, getExpenseCategories, getProjects } from "@/lib/data";

type EditExpensePageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function EditExpensePage({ searchParams }: EditExpensePageProps) {
  const params = await searchParams;
  const expenseId = typeof params.id === "string" ? params.id : "";
  const [expense, projects, expenseCategories] = await Promise.all([
    getExpenseById(expenseId),
    getProjects(),
    getExpenseCategories(),
  ]);
  if (!expense) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Edit Biaya Project</h1>
          <Link
            href={`/projects?view=rekap&project=${expense.projectId}`}
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            Kembali ke Rekap
          </Link>
        </div>

        <form action={updateExpenseAction} className="mt-4 space-y-3">
          <input type="hidden" name="expense_id" value={expense.id} />
          <input
            type="hidden"
            name="return_to"
            value={`/projects?view=rekap&project=${expense.projectId}`}
          />
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
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Kategori baru (opsional)
            </label>
            <input
              name="category_custom"
              placeholder="Isi jika ingin mengganti ke kategori baru"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Nama pengajuan
              </label>
              <input name="requester_name" defaultValue={expense.requesterName ?? ""} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Penerima / vendor
              </label>
              <input name="recipient_name" defaultValue={expense.recipientName ?? ""} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Keterangan</label>
            <input name="description" defaultValue={expense.description ?? ""} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Informasi penggunaan
            </label>
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
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Harga satuan
              </label>
              <RupiahInput name="unit_price" defaultValue={expense.unitPrice} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Spesialis (preset)
              </label>
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
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Spesialis (custom)
              </label>
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
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Nominal biaya total
            </label>
            <RupiahInput name="amount" defaultValue={Math.abs(expense.amount)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Mode transaksi</label>
            <select name="amount_mode" defaultValue={expense.amount < 0 ? "kurangi" : "tambah"}>
              <option value="tambah">Tambah</option>
              <option value="kurangi">Kurangi</option>
            </select>
          </div>
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
            <span className="btn-icon icon-float-soft bg-white/20 text-white">
              <SaveIcon />
            </span>
            Simpan
          </button>
        </form>

        <form action={deleteExpenseAction} className="mt-3">
          <input type="hidden" name="expense_id" value={expense.id} />
          <input
            type="hidden"
            name="return_to"
            value={`/projects?view=rekap&project=${expense.projectId}`}
          />
          <ConfirmActionButton
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
            modalDescription="Yakin ingin menghapus biaya ini?"
          >
            <span className="btn-icon icon-wiggle-soft bg-rose-100 text-rose-700">
              <TrashIcon />
            </span>
            Hapus Biaya Ini
          </ConfirmActionButton>
        </form>
      </section>
    </div>
  );
}
