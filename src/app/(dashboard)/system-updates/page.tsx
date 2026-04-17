import { Metadata } from "next";
import { getSystemUpdates } from "@/lib/data";
import { requireAuthUser, canEditRoles } from "@/lib/auth";
import { SystemUpdatesClient } from "./client-page";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Info Sistem & Pengumuman | Admin Web",
};

export default async function SystemUpdatesPage() {
  const user = await requireAuthUser();

  if (!canEditRoles(user)) {
    redirect("/");
  }

  const updates = await getSystemUpdates();

  return (
    <div className="flex flex-col gap-4">
      <div className="panel px-4 py-4 lg:px-6 lg:py-5">
        <h2 className="text-lg font-bold text-slate-900">Manejemen Info Sistem</h2>
        <p className="mt-1 text-sm text-slate-500">
          Buat dan kelola riwayat pembaruan atau pengumuman yang akan dikirim ke notifikasi seluruh pengguna.
        </p>
      </div>

      <SystemUpdatesClient initialUpdates={updates} />
    </div>
  );
}
