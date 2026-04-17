"use client";

import { useTransition, useState } from "react";
import { SystemUpdate } from "@/lib/types";
import { saveSystemUpdateAction, deleteSystemUpdateAction } from "@/app/actions/system-updates.action";

export function SystemUpdatesClient({ initialUpdates }: { initialUpdates: SystemUpdate[] }) {
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<SystemUpdate | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const res = await saveSystemUpdateAction(formData);
      if (res.error) {
        alert(res.error);
      } else {
        setIsModalOpen(false);
        setEditingData(null);
      }
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus info/update ini?")) return;
    startTransition(async () => {
      const res = await deleteSystemUpdateAction(id);
      if (res.error) {
        alert(res.error);
      }
    });
  }

  return (
    <div className="panel p-4">
      <div className="mb-4 flex justify-between items-center">
        <h3 className="font-semibold text-slate-800">Daftar Rilis & Pengumuman</h3>
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
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {initialUpdates.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Belum ada info sistem yang tercatat.
                </td>
              </tr>
            )}
            {initialUpdates.map((update) => (
              <tr key={update.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium">
                  {update.type === "announcement" ? (
                    <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full text-[10px]">Pengumuman</span>
                  ) : (
                    <span className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full text-[10px]">Update</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-slate-800">{update.version}</td>
                <td className="px-4 py-3">{update.releaseDate}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button 
                    disabled={isPending}
                    onClick={() => { setEditingData(update); setIsModalOpen(true); }}
                    className="text-xs text-indigo-600 hover:underline mr-3"
                  >
                    Edit
                  </button>
                  <button 
                    disabled={isPending}
                    onClick={() => handleDelete(update.id)}
                    className="text-xs text-rose-600 hover:underline mr-3"
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Form Info Sistem</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <form key={editingData?.id || 'new'} onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
              <input type="hidden" name="id" value={editingData?.id || ""} />
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Entri</label>
                <select name="type" className="form-input w-full p-2 border rounded-xl" required defaultValue={editingData?.type || "update"}>
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
                  placeholder="Cth: v1.0.0 atau Pengumuman Lebaran" 
                  className="form-input w-full p-2 border rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Detail (Pemisah Enter)</label>
                <textarea 
                  name="features" 
                  required
                  rows={4} 
                  defaultValue={editingData?.features.join('\n') || ""}
                  placeholder="Fitur tambahan 1&#10;Perbaikan Bug X"
                  className="form-input w-full p-2 border rounded-xl"
                ></textarea>
                <p className="text-[10px] text-slate-500 mt-1">Gunakan enter/baris baru untuk setiap poin notifikasi.</p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="button-ghost button-sm">Batal</button>
                <button type="submit" disabled={isPending} className="button-primary button-sm">
                  {isPending ? "Menyimpan..." : "Simpan Info"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
