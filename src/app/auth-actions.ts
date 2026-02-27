"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createActivityLog } from "@/lib/activity-logs";
import {
  createUserSession,
  clearUserSession,
  hashPassword,
  isAppRole,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  requireDevUser,
  verifyPassword,
} from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getSafeReturnTo(formData: FormData, fallback: string) {
  const value = getString(formData, "return_to");
  return value.startsWith("/") ? value : fallback;
}

function toErrorRedirect(pathname: string, message: string) {
  const params = new URLSearchParams({ error: message });
  return `${pathname}?${params.toString()}`;
}

function toSuccessRedirect(pathname: string, message: string) {
  const params = new URLSearchParams({ success: message });
  return `${pathname}?${params.toString()}`;
}

type AuthUserRow = {
  id: string;
  full_name: string;
  username: string;
  role: string;
  password_hash: string;
  created_at: string;
};

export async function loginAction(formData: FormData) {
  const username = normalizeUsername(getString(formData, "username"));
  const password = getString(formData, "password");
  if (!username || !password) {
    redirect(toErrorRedirect("/login", "Username dan password wajib diisi."));
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    redirect(toErrorRedirect("/login", "Supabase belum terkonfigurasi."));
  }

  const { data } = await supabase
    .from("app_users")
    .select("id, full_name, username, role, password_hash, created_at")
    .eq("username", username)
    .maybeSingle();

  const foundUser = data as AuthUserRow | null;
  if (
    !foundUser ||
    !isAppRole(foundUser.role) ||
    !verifyPassword(password, foundUser.password_hash)
  ) {
    redirect(toErrorRedirect("/login", "Username atau password salah."));
  }

  await createUserSession(foundUser.id);
  await createActivityLog({
    actor: {
      id: foundUser.id,
      fullName: foundUser.full_name,
      username: foundUser.username,
      role: foundUser.role,
      createdAt: foundUser.created_at,
    },
    actionType: "login",
    module: "auth",
    description: "Login ke aplikasi.",
  });

  redirect("/");
}

export async function registerAction(formData: FormData) {
  const fullName = getString(formData, "full_name");
  const username = normalizeUsername(getString(formData, "username"));
  const password = getString(formData, "password");
  const passwordConfirm = getString(formData, "password_confirm");

  if (fullName.length < 3) {
    redirect(toErrorRedirect("/register", "Nama minimal 3 karakter."));
  }
  if (!isValidUsername(username)) {
    redirect(
      toErrorRedirect(
        "/register",
        "Username hanya boleh huruf kecil, angka, titik, strip, underscore (3-32 karakter).",
      ),
    );
  }
  if (!isValidPassword(password)) {
    redirect(toErrorRedirect("/register", "Password minimal 6 karakter."));
  }
  if (password !== passwordConfirm) {
    redirect(toErrorRedirect("/register", "Konfirmasi password tidak sama."));
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    redirect(toErrorRedirect("/register", "Supabase belum terkonfigurasi."));
  }

  const { data: existed } = await supabase
    .from("app_users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existed?.id) {
    redirect(toErrorRedirect("/register", "Username sudah dipakai."));
  }

  const { count } = await supabase
    .from("app_users")
    .select("id", { head: true, count: "exact" });
  const assignedRole = (count ?? 0) === 0 ? "dev" : "viewer";

  const { data: inserted, error } = await supabase
    .from("app_users")
    .insert({
      full_name: fullName,
      username,
      password_hash: hashPassword(password),
      role: assignedRole,
    })
    .select("id, full_name, username, role, created_at")
    .single();

  if (error || !inserted || !isAppRole(inserted.role)) {
    redirect(toErrorRedirect("/register", "Gagal membuat akun baru."));
  }

  await createUserSession(inserted.id);
  await createActivityLog({
    actor: {
      id: inserted.id,
      fullName: inserted.full_name,
      username: inserted.username,
      role: inserted.role,
      createdAt: inserted.created_at,
    },
    actionType: "register",
    module: "auth",
    description: `Membuat akun baru (${inserted.role}).`,
    entityId: inserted.id,
    entityName: inserted.full_name,
  });

  revalidatePath("/logs");
  redirect("/");
}

export async function logoutAction() {
  await clearUserSession();
  redirect("/login");
}

export async function updateUserRoleAction(formData: FormData) {
  const actor = await requireDevUser();
  const userId = getString(formData, "user_id");
  const nextRole = getString(formData, "next_role");
  const returnTo = getSafeReturnTo(formData, "/logs");

  if (!userId || !isAppRole(nextRole)) {
    redirect(toErrorRedirect(returnTo, "Data role tidak valid."));
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    redirect(toErrorRedirect(returnTo, "Supabase belum terkonfigurasi."));
  }

  const { data: targetRow } = await supabase
    .from("app_users")
    .select("id, full_name, username, role, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (!targetRow || !isAppRole(String(targetRow.role))) {
    redirect(toErrorRedirect(returnTo, "User tidak ditemukan."));
  }

  const currentRole = targetRow.role as string;
  if (currentRole === nextRole) {
    redirect(toSuccessRedirect(returnTo, "Role user tidak berubah."));
  }

  if (currentRole === "dev" && nextRole !== "dev") {
    const { count: devCount } = await supabase
      .from("app_users")
      .select("id", { head: true, count: "exact" })
      .eq("role", "dev");
    if ((devCount ?? 0) <= 1) {
      redirect(toErrorRedirect(returnTo, "Minimal harus ada 1 akun dengan role dev."));
    }
  }

  const { error } = await supabase.from("app_users").update({ role: nextRole }).eq("id", userId);
  if (error) {
    redirect(toErrorRedirect(returnTo, "Gagal mengubah role user."));
  }

  await createActivityLog({
    actor,
    actionType: "role_update",
    module: "user",
    entityId: String(targetRow.id),
    entityName: String(targetRow.full_name ?? targetRow.username ?? "User"),
    description: `Mengubah role user dari ${currentRole} ke ${nextRole}.`,
    payload: {
      before: currentRole,
      after: nextRole,
      username: targetRow.username,
    },
  });

  revalidatePath("/logs");
  redirect(toSuccessRedirect(returnTo, "Role user berhasil diperbarui."));
}
