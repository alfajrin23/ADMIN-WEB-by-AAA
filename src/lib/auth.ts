import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase";

export const APP_ROLES = ["dev", "staff", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type AppUser = {
  id: string;
  fullName: string;
  username: string;
  role: AppRole;
  createdAt: string;
};

export const ROLE_LABEL: Record<AppRole, string> = {
  dev: "Developer",
  staff: "Staff",
  viewer: "Viewer",
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
  created_at: string;
};

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

function isAppRoleValue(value: string): value is AppRole {
  return APP_ROLES.includes(value as AppRole);
}

function mapAppUser(row: AppUserRow): AppUser {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    role: isAppRoleValue(row.role) ? row.role : "viewer",
    createdAt: row.created_at,
  };
}

export function isAppRole(value: string): value is AppRole {
  return isAppRoleValue(value);
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

export function canManageData(role: AppRole) {
  return role === "dev" || role === "staff";
}

export function canExportReports(role: AppRole) {
  return canManageData(role);
}

export function canImportData(role: AppRole) {
  return role === "dev";
}

export function canViewLogs(role: AppRole) {
  return role === "dev";
}

async function findUserById(id: string): Promise<AppUser | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("app_users")
    .select("id, full_name, username, role, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return mapAppUser(data as AppUserRow);
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = parseSessionToken(sessionToken);
  if (!payload) {
    return null;
  }

  return findUserById(payload.userId);
}

export async function requireAuthUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireEditorUser() {
  const user = await requireAuthUser();
  if (!canManageData(user.role)) {
    redirect("/");
  }
  return user;
}

export async function requireDevUser() {
  const user = await requireAuthUser();
  if (!canViewLogs(user.role)) {
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

  const { data } = await supabase
    .from("app_users")
    .select("id, full_name, username, role, created_at")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => mapAppUser(row as AppUserRow));
}
