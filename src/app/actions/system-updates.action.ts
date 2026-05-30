"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireAuthUser, canEditRoles } from "@/lib/auth";

export async function saveSystemUpdateAction(formData: FormData) {
  const user = await requireAuthUser();

  // Hanya izinkan admin/developer (Atau role khusus)
  if (!canEditRoles(user)) {
    return { error: "Anda tidak memiliki izin untuk mengedit update sistem." };
  }

  const id = formData.get("id") as string | null;
  const version = formData.get("version") as string;
  const type = formData.get("type") as "update" | "announcement";
  
  // Ambil features, di UI form bisa pakai textarea dipisahkan new line
  const featuresText = formData.get("features") as string;
  const features = featuresText
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase belum diinisiasi." };
  }

  const payload = {
    version,
    type,
    features,
    release_date: new Date().toISOString().split("T")[0],
    updated_at: new Date().toISOString(),
  };

  let error;
  let savedRow: {
    id: string;
    type: "update" | "announcement";
    version: string;
    features: string[];
    release_date: string;
    created_at: string;
  } | null = null;
  if (id) {
    const res = await supabase
      .from("system_updates")
      .update(payload)
      .eq("id", id)
      .select("id, type, version, features, release_date, created_at")
      .single();
    error = res.error;
    savedRow = res.data;
  } else {
    const res = await supabase
      .from("system_updates")
      .insert(payload)
      .select("id, type, version, features, release_date, created_at")
      .single();
    error = res.error;
    savedRow = res.data;
  }

  if (error) {
    console.error("[saveSystemUpdate] Error:", error.message);
    return { error: "Gagal menyimpan info sistem. Cek policy Supabase." };
  }

  revalidatePath("/");
  revalidatePath("/system-updates");
  return {
    success: true,
    update: savedRow
      ? {
          id: savedRow.id,
          type: savedRow.type,
          version: savedRow.version,
          features: savedRow.features,
          releaseDate: savedRow.release_date,
          createdAt: savedRow.created_at,
        }
      : null,
  };
}

export async function deleteSystemUpdateAction(id: string) {
  const user = await requireAuthUser();

  if (!canEditRoles(user)) {
    return { error: "Anda tidak memiliki izin untuk menghapus." };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase belum diinisiasi." };
  }

  const { error } = await supabase.from("system_updates").delete().eq("id", id);
  if (error) {
    return { error: "Gagal menghapus info sistem." };
  }

  revalidatePath("/");
  revalidatePath("/system-updates");
  return { success: true };
}
