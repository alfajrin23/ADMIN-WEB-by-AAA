import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { getRoleCatalog, getRoleDefinitionByKey } from "@/lib/role-store";
import {
  APP_ROLES,
  ROLE_LABEL,
  clonePermissionMatrix,
  getBuiltInRoleDefinition,
  hasAnyPermission,
  hasPermission,
  isAppRole,
  normalizeRoleKey,
  type AppPermissionMatrix,
  type AppRole,
  type PermissionAction,
  type PermissionModule,
} from "@/lib/roles";
import { getSupabaseServerClient } from "@/lib/supabase";

export { APP_ROLES, ROLE_LABEL, isAppRole };
export type { AppPermissionMatrix, AppRole, PermissionAction, PermissionModule };

export type AppUser = {
  id: string;
  fullName: string;
  username: string;
  role: AppRole;
  roleKey: string;
  roleLabel: string;
  permissions: AppPermissionMatrix;
  isSystemRole: boolean;
  createdAt: string;
};

const SESSION_COOKIE_NAME = "admin_web_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

type SessionPayload = {
  userId: string;
  exp: number;
};

type AppUserRow = {
  id: string;
  full_name: string;
  username: string;
  role: string;
  role_key?: string | null;
  created_at: string;
};

const getCachedUserRowById = unstable_cache(
  async (id: string): Promise<AppUserRow | null> => {
    if (!id) {
      return null;
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return null;
    }

    const withRoleKey = await supabase
      .from("app_users")
      .select("id, full_name, username, role, role_key, created_at")
      .eq("id", id)
      .maybeSingle();

    if (!withRoleKey.error && withRoleKey.data) {
      return withRoleKey.data as AppUserRow;
    }

    const fallback = await supabase
      .from("app_users")
      .select("id, full_name, username, role, created_at")
      .eq("id", id)
      .maybeSingle();

    return !fallback.error && fallback.data ? (fallback.data as AppUserRow) : null;
  },
  ["app-user-row-by-id"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.users],
  },
);

function getSessionSecret() {
  return (
    process.env.AUTH_SESSION_SECRET?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "admin-web-default-secret"
  );
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadBase64: string) {
  return createHmac("sha256", getSessionSecret()).update(payloadBase64).digest("base64url");
}

function createSessionToken(userId: string) {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const payloadBase64 = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

function parseSessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payloadBase64);
  if (
    expectedSignature.length !== signature.length ||
    !timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payloadBase64)) as SessionPayload;
    if (!parsed?.userId || !parsed?.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function findUserRowById(id: string): Promise<AppUserRow | null> {
  if (!id) {
    return null;
  }
  return getCachedUserRowById(id);
}

async function mapAppUser(row: AppUserRow): Promise<AppUser> {
  const roleDefinition = await getRoleDefinitionByKey(
    typeof row.role_key === "string" ? row.role_key : null,
    row.role,
  );

  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    role: roleDefinition.derivedRole,
    roleKey: roleDefinition.key,
    roleLabel: roleDefinition.name,
    permissions: clonePermissionMatrix(roleDefinition.permissions),
    isSystemRole: roleDefinition.isSystem,
    createdAt: row.created_at,
  };
}

function resolvePermissionMatrix(input: AppUser | AppPermissionMatrix | AppRole): AppPermissionMatrix {
  if (typeof input === "string") {
    return getBuiltInRoleDefinition(isAppRole(input) ? input : "viewer").permissions;
  }
  if ("permissions" in input) {
    return input.permissions;
  }
  return input;
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string) {
  return /^[a-z0-9._-]{3,32}$/.test(value);
}

export function isValidPassword(value: string) {
  return value.length >= 6;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hashed = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hashed}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algo, salt, hash] = storedHash.split("$");
  if (algo !== "scrypt" || !salt || !hash) {
    return false;
  }

  const computed = scryptSync(password, salt, 64).toString("base64url");
  if (computed.length !== hash.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

export function canViewModule(
  input: AppUser | AppPermissionMatrix | AppRole,
  module: PermissionModule,
) {
  return hasPermission(resolvePermissionMatrix(input), module, "view");
}

export function canManageModule(
  input: AppUser | AppPermissionMatrix | AppRole,
  module: PermissionModule,
) {
  return hasAnyPermission(resolvePermissionMatrix(input), module, ["create", "edit", "delete"]);
}

export function canManageData(input: AppUser | AppPermissionMatrix | AppRole) {
  return canManageModule(input, "projects") || canManageModule(input, "attendance");
}

export function canAccessProjects(input: AppUser | AppPermissionMatrix | AppRole) {
  return canViewModule(input, "projects") || canManageModule(input, "projects");
}

export function canManageProjects(input: AppUser | AppPermissionMatrix | AppRole) {
  return canManageModule(input, "projects");
}

export function canAccessAttendance(input: AppUser | AppPermissionMatrix | AppRole) {
  return canViewModule(input, "attendance") || canManageModule(input, "attendance");
}

export function canManageAttendance(input: AppUser | AppPermissionMatrix | AppRole) {
  return canManageModule(input, "attendance");
}

export function canExportReports(input: AppUser | AppPermissionMatrix | AppRole) {
  return canViewModule(input, "reports");
}

export function canImportData(input: AppUser | AppPermissionMatrix | AppRole) {
  const permissions = resolvePermissionMatrix(input);
  return (
    hasPermission(permissions, "projects", "import") ||
    hasPermission(permissions, "attendance", "import") ||
    hasPermission(permissions, "reports", "import")
  );
}

export function canViewLogs(input: AppUser | AppPermissionMatrix | AppRole) {
  return canViewModule(input, "logs");
}

export function canManageRoles(input: AppUser | AppPermissionMatrix | AppRole) {
  return canViewModule(input, "roles") || canManageModule(input, "roles");
}

export function canEditRoles(input: AppUser | AppPermissionMatrix | AppRole) {
  return hasAnyPermission(resolvePermissionMatrix(input), "roles", ["create", "edit", "delete"]);
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = parseSessionToken(sessionToken);
  if (!payload) {
    return null;
  }

  const row = await findUserRowById(payload.userId);
  return row ? mapAppUser(row) : null;
}

export async function requireAuthUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

async function requireModulePermission(
  module: PermissionModule,
  action: PermissionAction = "view",
) {
  const user = await requireAuthUser();
  const permissions = resolvePermissionMatrix(user);
  const allowed =
    action === "view"
      ? hasPermission(permissions, module, "view") || canManageModule(user, module)
      : hasPermission(permissions, module, action);
  if (!allowed) {
    redirect("/");
  }
  return user;
}

export async function requireEditorUser() {
  const user = await requireAuthUser();
  if (!canManageData(user)) {
    redirect("/");
  }
  return user;
}

export async function requireProjectViewerUser() {
  return requireModulePermission("projects", "view");
}

export async function requireProjectEditorUser() {
  const user = await requireAuthUser();
  if (!canManageProjects(user)) {
    redirect("/");
  }
  return user;
}

export async function requireAttendanceViewerUser() {
  return requireModulePermission("attendance", "view");
}

export async function requireAttendanceEditorUser() {
  const user = await requireAuthUser();
  if (!canManageAttendance(user)) {
    redirect("/");
  }
  return user;
}

export async function requireLogsUser() {
  return requireModulePermission("logs", "view");
}

export async function requireRoleManagerUser() {
  const user = await requireAuthUser();
  if (!canEditRoles(user)) {
    redirect("/");
  }
  return user;
}

export async function createUserSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearUserSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getAppUsers() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const withRoleKey = await supabase
    .from("app_users")
    .select("id, full_name, username, role, role_key, created_at")
    .order("created_at", { ascending: false });

  const fallback =
    withRoleKey.error || !Array.isArray(withRoleKey.data)
      ? await supabase
          .from("app_users")
          .select("id, full_name, username, role, created_at")
          .order("created_at", { ascending: false })
      : null;

  const rows = !withRoleKey.error && Array.isArray(withRoleKey.data)
    ? (withRoleKey.data as AppUserRow[])
    : fallback && !fallback.error && Array.isArray(fallback.data)
      ? (fallback.data as AppUserRow[])
      : [];

  if (rows.length === 0) {
    return [];
  }

  const roleCatalog = await getRoleCatalog();
  const roleByKey = new Map(roleCatalog.map((role) => [role.key, role] as const));

  return rows.map((row) => {
    const roleDefinition =
      roleByKey.get(normalizeRoleKey(String(row.role_key ?? ""))) ||
      roleByKey.get(isAppRole(row.role) ? row.role : "viewer") ||
      getBuiltInRoleDefinition("viewer");

    return {
      id: row.id,
      fullName: row.full_name,
      username: row.username,
      role: roleDefinition.derivedRole,
      roleKey: roleDefinition.key,
      roleLabel: roleDefinition.name,
      permissions: clonePermissionMatrix(roleDefinition.permissions),
      isSystemRole: roleDefinition.isSystem,
      createdAt: row.created_at,
    } satisfies AppUser;
  });
}
