"use client";

import { useTransition, useState } from "react";
import { SystemUpdate } from "@/lib/types";
import { saveSystemUpdateAction, deleteSystemUpdateAction } from "@/app/actions/system-updates.action";

function formatDateLabel(dateRaw: string) {
  const date = new Date(dateRaw);
  if (isNaN(date.getTime())) return dateRaw;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SystemUpdatesClient({ initialUpdates }: { initialUpdates: SystemUpdate[] }) {
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<SystemUpdate | null>(null);
  const [updates, setUpdates] = useState<SystemUpdate[]>(initialUpdates);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showSqlTip, setShowSqlTip] = useState(false);

  function showFeedback(msg: string, isError = false) {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(""), 5000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(""), 4000);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await saveSystemUpdateAction(formData);
      if (res.error) {
        showFeedback(res.error, true);
      } else {
        setIsModalOpen(false);
        setEditingData(null);
        showFeedback(editingData ? "Info sistem berhasil diperbarui." : "Info sistem baru berhasil dibuat.");
        // Reload updates dari server (revalidatePath akan memperbarui data saat navigasi)
        // Untuk sekarang optimistically update the list
        const featuresText = formData.get("features") as string;
        const features = featuresText.split("\n").map((f) => f.trim()).filter((f) => f.length > 0);
        const version = formData.get("version") as string;
        const type = formData.get("type") as "update" | "announcement";
        const id = formData.get("id") as string;

        if (id) {
          setUpdates((prev) =>
            prev.map((u) =>
              u.id === id
                ? { ...u, version, type, features }
                : u,
            ),
          );
        } else {
          const newEntry: SystemUpdate = {
            id: `optimistic-${Date.now()}`,
            type,
            version,
            features,
            releaseDate: new Date().toISOString().slice(0, 10),
            createdAt: new Date().toISOString(),
          };
          setUpdates((prev) => [newEntry, ...prev]);
        }
      }
    });
  }

  async function handleDelete(id: string, version: string) {
    if (!confirm(`Hapus info "${version}"? Aksi ini tidak bisa dibatalkan.`)) return;
    startTransition(async () => {
      const res = await deleteSystemUpdateAction(id);
      if (res.error) {
        showFeedback(res.error, true);
      } else {
        setUpdates((prev) => prev.filter((u) => u.id !== id));
        showFeedback(`Info "${version}" berhasil dihapus.`);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Feedback messages */}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          ✓ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          ✗ {errorMsg}
        </div>
      )}

      {/* SQL Tip — tampil jika tidak ada data atau ada error */}
      {updates.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-800">Belum ada data Info Sistem</p>
              <p className="mt-1 text-xs text-amber-700">
                Jalankan script SQL seed untuk mengisi data riwayat update ke database Supabase, atau buat manual melalui tombol &quot;Buat Info Baru&quot;.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSqlTip((v) => !v)}
              className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
            >
              {showSqlTip ? "Tutup" : "Lihat Petunjuk SQL"}
            </button>
          </div>
          {showSqlTip && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">Cara seed data ke Supabase:</p>
              <ol className="space-y-1 text-xs text-slate-600 list-decimal list-inside">
                <li>Buka <strong>Supabase Dashboard → SQL Editor</strong></li>
                <li>Copy isi file <code className="rounded bg-slate-100 px-1 font-mono">scripts/seed-system-updates.sql</code></li>
                <li>Paste dan klik <strong>Run</strong></li>
                <li>Refresh halaman ini — data akan muncul di tabel dan dropdown notifikasi</li>
              </ol>
            </div>
          )}
        </div>
      )}

      <div className="panel p-4">
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-slate-800">Daftar Rilis &amp; Pengumuman</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {updates.length} entri tersimpan di database. Setiap entri akan tampil di dropdown notifikasi seluruh pengguna.
            </p>
          </div>
          <button
            onClick={() => { setEditingData(null); setIsModalOpen(true); }}
            className="button-primary button-sm"
          >
            Buat Info Baru
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3">Versi/Judul</th>
                <th className="px-4 py-3">Rilis</th>
                <th className="px-4 py-3">Fitur</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {updates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Belum ada info sistem yang tercatat.
                  </td>
                </tr>
              )}
              {updates.map((update) => (
                <tr key={update.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium">
                    {update.type === "announcement" ? (
                      <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full text-[10px]">Pengumuman</span>
                    ) : (
                      <span className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full text-[10px]">Update</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800">{update.version}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateLabel(update.releaseDate)}</td>
                  <td className="px-4 py-3">
                    <ul className="space-y-0.5">
                      {update.features.slice(0, 2).map((feat, i) => (
                        <li key={i} className="text-xs text-slate-500 line-clamp-1">• {feat}</li>
                      ))}
                      {update.features.length > 2 && (
                        <li className="text-[11px] text-slate-400 italic">+{update.features.length - 2} lainnya</li>
                      )}
                    </ul>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      disabled={isPending}
                      onClick={() => { setEditingData(update); setIsModalOpen(true); }}
                      className="text-xs text-indigo-600 hover:underline mr-3 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => handleDelete(update.id, update.version)}
                      className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800">
                  {editingData ? `Edit: ${editingData.version}` : "Buat Info Sistem Baru"}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Akan tampil di dropdown notifikasi seluruh pengguna.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <form key={editingData?.id || "new"} onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
              <input type="hidden" name="id" value={editingData?.id || ""} />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Entri</label>
                <select
                  name="type"
                  className="form-input w-full p-2 border rounded-xl"
                  required
                  defaultValue={editingData?.type || "update"}
                >
                  <option value="update">Update Sistem (Versi Rilis)</option>
                  <option value="announcement">Pengumuman Terbuka</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Versi / Judul</label>
                <input
                  type="text"
                  name="version"
                  required
                  defaultValue={editingData?.version || ""}
                  placeholder="Cth: v1.5.0 atau Libur Lebaran 2026"
                  className="form-input w-full p-2 border rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Daftar Fitur / Poin Pengumuman
                </label>
                <textarea
                  name="features"
                  required
                  rows={5}
                  defaultValue={editingData?.features.join("\n") || ""}
                  placeholder={"Fitur atau perbaikan baru #1\nFitur atau perbaikan baru #2\nDan seterusnya..."}
                  className="form-input w-full p-2 border rounded-xl"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Gunakan enter/baris baru untuk setiap poin. Setiap baris = satu poin notifikasi.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="button-ghost button-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="button-primary button-sm"
                >
                  {isPending ? "Menyimpan..." : editingData ? "Perbarui Info" : "Simpan Info Baru"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
