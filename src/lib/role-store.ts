import "server-only";

import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  clonePermissionMatrix,
  createEmptyPermissionMatrix,
  deriveLegacyRoleFromPermissions,
  getBuiltInRoles,
  isAppRole,
  normalizeRoleKey,
  type AppPermissionMatrix,
  type PermissionModule,
  type RoleDefinition,
} from "@/lib/roles";

type AppRoleRow = {
  role_key: string;
  name: string;
  description: string | null;
  created_at: string;
};

type RolePermissionRow = {
  role_key: string;
  module: string;
  can_view: boolean | null;
  can_create: boolean | null;
  can_edit: boolean | null;
  can_delete: boolean | null;
  can_import: boolean | null;
};

type RoleAssignmentRow = {
  role_key?: string | null;
  role?: string | null;
};

type CachedRolePayload = {
  roleRows: AppRoleRow[];
  permissionRows: RolePermissionRow[];
  assignmentRows: RoleAssignmentRow[];
};

const EMPTY_ROLE_PAYLOAD: CachedRolePayload = {
  roleRows: [],
  permissionRows: [],
  assignmentRows: [],
};

async function getRoleAssignmentRows(): Promise<RoleAssignmentRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const withRoleKey = await supabase.from("app_users").select("role_key, role");
  if (!withRoleKey.error && Array.isArray(withRoleKey.data)) {
    return withRoleKey.data as RoleAssignmentRow[];
  }

  const fallback = await supabase.from("app_users").select("role");
  return !fallback.error && Array.isArray(fallback.data)
    ? (fallback.data as RoleAssignmentRow[])
    : [];
}

const getCachedRolePayload = unstable_cache(
  async (): Promise<CachedRolePayload> => {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return EMPTY_ROLE_PAYLOAD;
    }

    const [roleResult, permissionResult, assignmentRows] = await Promise.all([
      supabase.from("app_roles").select("role_key, name, description, created_at").order("name"),
      supabase
        .from("role_permissions")
        .select("role_key, module, can_view, can_create, can_edit, can_delete, can_import"),
      getRoleAssignmentRows(),
    ]);

    return {
      roleRows: !roleResult.error && Array.isArray(roleResult.data)
        ? (roleResult.data as AppRoleRow[])
        : [],
      permissionRows: !permissionResult.error && Array.isArray(permissionResult.data)
        ? (permissionResult.data as RolePermissionRow[])
        : [],
      assignmentRows,
    };
  },
  ["role-payload"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.roles, CACHE_TAGS.users],
  },
);

function isPermissionModule(value: string): value is PermissionModule {
  return (
    value === "dashboard" ||
    value === "projects" ||
    value === "attendance" ||
    value === "reports" ||
    value === "logs" ||
    value === "roles"
  );
}

function buildPermissionMatrixForRole(
  roleKey: string,
  permissionRows: RolePermissionRow[],
): AppPermissionMatrix {
  const matrix = createEmptyPermissionMatrix();
  for (const row of permissionRows) {
    const normalizedRoleKey = normalizeRoleKey(String(row.role_key ?? ""));
    if (!normalizedRoleKey || normalizedRoleKey !== roleKey) {
      continue;
    }
    const moduleKey = String(row.module ?? "");
    if (!isPermissionModule(moduleKey)) {
      continue;
    }
    matrix[moduleKey] = {
      view: Boolean(row.can_view),
      create: Boolean(row.can_create),
      edit: Boolean(row.can_edit),
      delete: Boolean(row.can_delete),
      import: Boolean(row.can_import),
    };
  }
  return matrix;
}

export async function getRoleCatalog(): Promise<RoleDefinition[]> {
  const payload = await getCachedRolePayload();
  const countsByKey = new Map<string, number>();

  for (const assignment of payload.assignmentRows) {
    const explicitRoleKey = normalizeRoleKey(String(assignment.role_key ?? ""));
    const fallbackRole = String(assignment.role ?? "");
    const assignmentKey =
      explicitRoleKey || (isAppRole(fallbackRole) ? fallbackRole : "");
    if (!assignmentKey) {
      continue;
    }
    countsByKey.set(assignmentKey, (countsByKey.get(assignmentKey) ?? 0) + 1);
  }

  const builtIns = getBuiltInRoles().map((role) => ({
    ...role,
    permissions: clonePermissionMatrix(role.permissions),
    userCount: countsByKey.get(role.key) ?? 0,
  }));

  const customRoles: RoleDefinition[] = payload.roleRows
    .map((row) => {
      const key = normalizeRoleKey(String(row.role_key ?? ""));
      if (!key || isAppRole(key)) {
        return null;
      }
      const permissions = buildPermissionMatrixForRole(key, payload.permissionRows);
      return {
        key,
        name: String(row.name ?? key),
        description: typeof row.description === "string" ? row.description : null,
        isSystem: false,
        permissions,
        createdAt: String(row.created_at ?? new Date().toISOString()),
        userCount: countsByKey.get(key) ?? 0,
        derivedRole: deriveLegacyRoleFromPermissions(permissions),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "id-ID"));

  return [...builtIns, ...customRoles];
}

export async function getRoleDefinitionByKey(
  roleKey: string | null | undefined,
  fallbackRole?: string | null,
): Promise<RoleDefinition> {
  const normalizedRoleKey = normalizeRoleKey(roleKey ?? "");
  if (normalizedRoleKey && isAppRole(normalizedRoleKey)) {
    return cloneRoleDefinition(
      getBuiltInRoles().find((role) => role.key === normalizedRoleKey) ?? getBuiltInRoles()[2],
    );
  }

  const catalog = await getRoleCatalog();
  const matchedRole = catalog.find((role) => role.key === normalizedRoleKey);
  if (matchedRole) {
    return cloneRoleDefinition(matchedRole);
  }

  const fallback = typeof fallbackRole === "string" && isAppRole(fallbackRole) ? fallbackRole : "viewer";
  const builtInFallback = catalog.find((role) => role.key === fallback) ?? getBuiltInRoles()[2];
  return cloneRoleDefinition(builtInFallback);
}

function cloneRoleDefinition(role: RoleDefinition): RoleDefinition {
  return {
    ...role,
    permissions: clonePermissionMatrix(role.permissions),
  };
}
