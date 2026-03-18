"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { queueActivityLog } from "@/lib/activity-logs";
import {
  canEditRoles,
  createUserSession,
  clearUserSession,
  getAppUsers,
  hashPassword,
  isAppRole,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  requireRoleManagerUser,
  verifyPassword,
} from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { getRoleCatalog, getRoleDefinitionByKey } from "@/lib/role-store";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  deriveLegacyRoleFromPermissions,
  isAppRole as isBuiltInRoleKey,
  normalizeRoleKey,
  type AppPermissionMatrix,
} from "@/lib/roles";
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

function revalidateRolePages() {
  revalidatePath("/logs");
  revalidatePath("/roles");
  revalidateTag(CACHE_TAGS.roles, "max");
  revalidateTag(CACHE_TAGS.users, "max");
  revalidateTag(CACHE_TAGS.activityLogs, "max");
}

function parsePermissionMatrix(formData: FormData): AppPermissionMatrix {
  const matrix = Object.fromEntries(
    PERMISSION_MODULES.map((moduleDef) => [
      moduleDef.value,
      Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action.value, false])),
    ]),
  ) as AppPermissionMatrix;

  for (const moduleDef of PERMISSION_MODULES) {
    for (const action of PERMISSION_ACTIONS) {
      const key = `permission_${moduleDef.value}_${action.value}`;
      const value = formData.get(key);
      matrix[moduleDef.value][action.value] =
        value === "1" || value === "on" || value === "true";
    }
  }

  return matrix;
}

async function replaceRolePermissions(
  roleKey: string,
  permissions: AppPermissionMatrix,
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, reason: "Supabase belum terkonfigurasi." };
  }

  const deleteResult = await supabase.from("role_permissions").delete().eq("role_key", roleKey);
  if (deleteResult.error) {
    return {
      ok: false as const,
      reason: "Tabel role_permissions belum tersedia. Jalankan schema terbaru dulu.",
    };
  }

  const rows = PERMISSION_MODULES.map((moduleDef) => ({
    role_key: roleKey,
    module: moduleDef.value,
    can_view: permissions[moduleDef.value].view,
    can_create: permissions[moduleDef.value].create,
    can_edit: permissions[moduleDef.value].edit,
    can_delete: permissions[moduleDef.value].delete,
    can_import: permissions[moduleDef.value].import,
  }));
  const insertResult = await supabase.from("role_permissions").insert(rows);
  if (insertResult.error) {
    return { ok: false as const, reason: "Gagal menyimpan permission role." };
  }

  return { ok: true as const };
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
  queueActivityLog({
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
  queueActivityLog({
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
  const actor = await requireRoleManagerUser();
  const userId = getString(formData, "user_id");
  const nextRoleKeyRaw = getString(formData, "next_role");
  const returnTo = getSafeReturnTo(formData, "/roles");
  const nextRoleKey = normalizeRoleKey(nextRoleKeyRaw);

  if (!userId || !nextRoleKey) {
    redirect(toErrorRedirect(returnTo, "Data role tidak valid."));
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    redirect(toErrorRedirect(returnTo, "Supabase belum terkonfigurasi."));
  }

  const withRoleKey = await supabase
    .from("app_users")
    .select("id, full_name, username, role, role_key, created_at")
    .eq("id", userId)
    .maybeSingle();
  const fallback =
    withRoleKey.error || !withRoleKey.data
      ? await supabase
          .from("app_users")
          .select("id, full_name, username, role, created_at")
          .eq("id", userId)
          .maybeSingle()
      : null;

  const targetRow = !withRoleKey.error && withRoleKey.data
    ? (withRoleKey.data as {
        id: string;
        full_name: string;
        username: string;
        role: string;
        role_key?: string | null;
        created_at: string;
      })
    : fallback && !fallback.error && fallback.data
      ? (fallback.data as {
          id: string;
          full_name: string;
          username: string;
          role: string;
          role_key?: string | null;
          created_at: string;
        })
      : null;

  if (!targetRow || !isAppRole(String(targetRow.role ?? ""))) {
    redirect(toErrorRedirect(returnTo, "User tidak ditemukan."));
  }

  const nextRoleDefinition = await getRoleDefinitionByKey(nextRoleKey, nextRoleKey);
  if (nextRoleDefinition.key !== nextRoleKey) {
    redirect(toErrorRedirect(returnTo, "Role tujuan tidak ditemukan."));
  }

  const currentRoleDefinition = await getRoleDefinitionByKey(
    typeof targetRow.role_key === "string" ? targetRow.role_key : null,
    targetRow.role,
  );

  if (currentRoleDefinition.key === nextRoleDefinition.key) {
    redirect(toSuccessRedirect(returnTo, "Role user tidak berubah."));
  }

  const users = await getAppUsers();
  const nextRolePreviewUser = {
    ...actor,
    id: String(targetRow.id),
    fullName: String(targetRow.full_name),
    username: String(targetRow.username),
    role: nextRoleDefinition.derivedRole,
    roleKey: nextRoleDefinition.key,
    roleLabel: nextRoleDefinition.name,
    permissions: nextRoleDefinition.permissions,
    isSystemRole: nextRoleDefinition.isSystem,
    createdAt: String(targetRow.created_at),
  };
  const editableRoleUsersAfterChange = users.filter((user) =>
    user.id === userId ? canEditRoles(nextRolePreviewUser) : canEditRoles(user),
  );
  if (editableRoleUsersAfterChange.length === 0) {
    redirect(
      toErrorRedirect(returnTo, "Minimal harus ada 1 user yang bisa mengelola role dan permission."),
    );
  }

  const updatePayload =
    isBuiltInRoleKey(nextRoleDefinition.key)
      ? { role: nextRoleDefinition.key, role_key: null }
      : { role: nextRoleDefinition.derivedRole, role_key: nextRoleDefinition.key };

  const updateResult = await supabase.from("app_users").update(updatePayload).eq("id", userId);
  if (updateResult.error) {
    if (!isBuiltInRoleKey(nextRoleDefinition.key)) {
      redirect(
        toErrorRedirect(
          returnTo,
          "Gagal assign role custom. Pastikan schema terbaru dengan kolom role_key sudah dijalankan.",
        ),
      );
    }

    const fallbackUpdate = await supabase
      .from("app_users")
      .update({ role: nextRoleDefinition.key })
      .eq("id", userId);
    if (fallbackUpdate.error) {
      redirect(toErrorRedirect(returnTo, "Gagal mengubah role user."));
    }
  }

  queueActivityLog({
    actor,
    actionType: "role_update",
    module: "user",
    entityId: String(targetRow.id),
    entityName: String(targetRow.full_name ?? targetRow.username ?? "User"),
    description: `Mengubah role user dari ${currentRoleDefinition.name} ke ${nextRoleDefinition.name}.`,
    payload: {
      before_key: currentRoleDefinition.key,
      before_name: currentRoleDefinition.name,
      after_key: nextRoleDefinition.key,
      after_name: nextRoleDefinition.name,
      username: targetRow.username,
    },
  });

  revalidateRolePages();
  redirect(toSuccessRedirect(returnTo, "Role user berhasil diperbarui."));
}

export async function createRoleAction(formData: FormData) {
  const actor = await requireRoleManagerUser();
  const returnTo = getSafeReturnTo(formData, "/roles");
  const name = getString(formData, "name");
  const description = getString(formData, "description") || null;
  const requestedRoleKey = normalizeRoleKey(getString(formData, "role_key") || name);

  if (name.length < 2 || !requestedRoleKey) {
    redirect(toErrorRedirect(returnTo, "Nama dan key role wajib diisi."));
  }
  if (isBuiltInRoleKey(requestedRoleKey)) {
    redirect(toErrorRedirect(returnTo, "Key role bentrok dengan role bawaan sistem."));
  }

  const permissions = parsePermissionMatrix(formData);
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    redirect(toErrorRedirect(returnTo, "Supabase belum terkonfigurasi."));
  }

  const existed = await supabase
    .from("app_roles")
    .select("role_key")
    .eq("role_key", requestedRoleKey)
    .maybeSingle();
  if (!existed.error && existed.data?.role_key) {
    redirect(toErrorRedirect(returnTo, "Key role sudah dipakai."));
  }
  if (existed.error) {
    redirect(
      toErrorRedirect(returnTo, "Tabel app_roles belum tersedia. Jalankan schema terbaru dulu."),
    );
  }

  const insertResult = await supabase.from("app_roles").insert({
    role_key: requestedRoleKey,
    name,
    description,
  });
  if (insertResult.error) {
    redirect(toErrorRedirect(returnTo, "Gagal membuat role baru."));
  }

  const permissionResult = await replaceRolePermissions(requestedRoleKey, permissions);
  if (!permissionResult.ok) {
    redirect(toErrorRedirect(returnTo, permissionResult.reason));
  }

  queueActivityLog({
    actor,
    actionType: "create",
    module: "role",
    entityId: requestedRoleKey,
    entityName: name,
    description: `Membuat role baru "${name}".`,
    payload: {
      role_key: requestedRoleKey,
      derived_role: deriveLegacyRoleFromPermissions(permissions),
    },
  });

  revalidateRolePages();
  redirect(toSuccessRedirect(returnTo, "Role baru berhasil dibuat."));
}

export async function updateRolePermissionsAction(formData: FormData) {
  const actor = await requireRoleManagerUser();
  const returnTo = getSafeReturnTo(formData, "/roles");
  const roleKey = normalizeRoleKey(getString(formData, "role_key"));
  const name = getString(formData, "name");
  const description = getString(formData, "description") || null;

  if (!roleKey || !name) {
    redirect(toErrorRedirect(returnTo, "Data role tidak lengkap."));
  }
  if (isBuiltInRoleKey(roleKey)) {
    redirect(toErrorRedirect(returnTo, "Role bawaan sistem tidak dapat diubah."));
  }

  const permissions = parsePermissionMatrix(formData);
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    redirect(toErrorRedirect(returnTo, "Supabase belum terkonfigurasi."));
  }

  const updateResult = await supabase
    .from("app_roles")
    .update({
      name,
      description,
    })
    .eq("role_key", roleKey);

  if (updateResult.error) {
    redirect(toErrorRedirect(returnTo, "Gagal memperbarui metadata role."));
  }

  const permissionResult = await replaceRolePermissions(roleKey, permissions);
  if (!permissionResult.ok) {
    redirect(toErrorRedirect(returnTo, permissionResult.reason));
  }

  queueActivityLog({
    actor,
    actionType: "update",
    module: "role",
    entityId: roleKey,
    entityName: name,
    description: `Memperbarui permission role "${name}".`,
    payload: {
      role_key: roleKey,
      derived_role: deriveLegacyRoleFromPermissions(permissions),
    },
  });

  revalidateRolePages();
  redirect(toSuccessRedirect(returnTo, "Role berhasil diperbarui."));
}

export async function deleteRoleAction(formData: FormData) {
  const actor = await requireRoleManagerUser();
  const returnTo = getSafeReturnTo(formData, "/roles");
  const roleKey = normalizeRoleKey(getString(formData, "role_key"));

  if (!roleKey) {
    redirect(toErrorRedirect(returnTo, "Role tidak valid."));
  }
  if (isBuiltInRoleKey(roleKey)) {
    redirect(toErrorRedirect(returnTo, "Role bawaan sistem tidak dapat dihapus."));
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    redirect(toErrorRedirect(returnTo, "Supabase belum terkonfigurasi."));
  }

  const roleCatalog = await getRoleCatalog();
  const targetRole = roleCatalog.find((role) => role.key === roleKey);
  if (!targetRole) {
    redirect(toErrorRedirect(returnTo, "Role tidak ditemukan."));
  }
  if ((targetRole.userCount ?? 0) > 0) {
    redirect(toErrorRedirect(returnTo, "Role masih dipakai user dan tidak bisa dihapus."));
  }

  const deleteResult = await supabase.from("app_roles").delete().eq("role_key", roleKey);
  if (deleteResult.error) {
    redirect(toErrorRedirect(returnTo, "Gagal menghapus role."));
  }

  queueActivityLog({
    actor,
    actionType: "delete",
    module: "role",
    entityId: roleKey,
    entityName: targetRole.name,
    description: `Menghapus role "${targetRole.name}".`,
  });

  revalidateRolePages();
  redirect(toSuccessRedirect(returnTo, "Role berhasil dihapus."));
}
