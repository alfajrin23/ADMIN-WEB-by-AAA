export const APP_ROLES = ["dev", "staff", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABEL: Record<AppRole, string> = {
  dev: "Developer",
  staff: "Staff",
  viewer: "Viewer",
};

export const PERMISSION_MODULES = [
  { value: "dashboard", label: "Ringkasan", description: "Halaman dashboard dan insight utama." },
  { value: "projects", label: "Biaya Proyek", description: "Data proyek, biaya, dan rekap transaksi." },
  { value: "attendance", label: "Absensi Harian", description: "Input dan rekap absensi pekerja." },
  { value: "reports", label: "Export Laporan", description: "Akses preview dan unduh laporan." },
  { value: "logs", label: "Log Input", description: "Riwayat aktivitas serta audit trail." },
  { value: "roles", label: "Role & Permission", description: "Kelola role, permission, dan assignment user." },
] as const;

export const PERMISSION_ACTIONS = [
  { value: "view", label: "View" },
  { value: "create", label: "Create" },
  { value: "edit", label: "Edit" },
  { value: "delete", label: "Delete" },
  { value: "import", label: "Import" },
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number]["value"];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]["value"];

export type AppPermissionMatrix = Record<PermissionModule, Record<PermissionAction, boolean>>;

export type RoleDefinition = {
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: AppPermissionMatrix;
  createdAt: string;
  userCount?: number;
  derivedRole: AppRole;
};

export function createEmptyPermissionMatrix(): AppPermissionMatrix {
  return Object.fromEntries(
    PERMISSION_MODULES.map((module) => [
      module.value,
      Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action.value, false])),
    ]),
  ) as AppPermissionMatrix;
}

export function clonePermissionMatrix(matrix?: Partial<AppPermissionMatrix> | null): AppPermissionMatrix {
  const base = createEmptyPermissionMatrix();
  for (const moduleDef of PERMISSION_MODULES) {
    const sourceModule = matrix?.[moduleDef.value];
    for (const action of PERMISSION_ACTIONS) {
      base[moduleDef.value][action.value] = Boolean(sourceModule?.[action.value]);
    }
  }
  return base;
}

function createPermissionMatrix(input: {
  dashboard?: Partial<Record<PermissionAction, boolean>>;
  projects?: Partial<Record<PermissionAction, boolean>>;
  attendance?: Partial<Record<PermissionAction, boolean>>;
  reports?: Partial<Record<PermissionAction, boolean>>;
  logs?: Partial<Record<PermissionAction, boolean>>;
  roles?: Partial<Record<PermissionAction, boolean>>;
}) {
  return clonePermissionMatrix(input as Partial<AppPermissionMatrix>);
}

export const BUILT_IN_ROLE_DEFINITIONS: Record<AppRole, RoleDefinition> = {
  dev: {
    key: "dev",
    name: ROLE_LABEL.dev,
    description: "Akses penuh ke seluruh modul, termasuk import, log, dan role management.",
    isSystem: true,
    permissions: createPermissionMatrix({
      dashboard: { view: true },
      projects: { view: true, create: true, edit: true, delete: true, import: true },
      attendance: { view: true, create: true, edit: true, delete: true, import: true },
      reports: { view: true, create: true, edit: true, delete: true, import: true },
      logs: { view: true, create: true, edit: true, delete: true, import: true },
      roles: { view: true, create: true, edit: true, delete: true, import: true },
    }),
    createdAt: "1970-01-01T00:00:00.000Z",
    derivedRole: "dev",
  },
  staff: {
    key: "staff",
    name: ROLE_LABEL.staff,
    description: "Kelola data proyek dan absensi tanpa akses log, import, atau role management.",
    isSystem: true,
    permissions: createPermissionMatrix({
      dashboard: { view: true },
      projects: { view: true, create: true, edit: true, delete: true },
      attendance: { view: true, create: true, edit: true, delete: true },
      reports: { view: true },
    }),
    createdAt: "1970-01-01T00:00:00.000Z",
    derivedRole: "staff",
  },
  viewer: {
    key: "viewer",
    name: ROLE_LABEL.viewer,
    description: "Akses ringkasan utama tanpa kemampuan kelola data.",
    isSystem: true,
    permissions: createPermissionMatrix({
      dashboard: { view: true },
    }),
    createdAt: "1970-01-01T00:00:00.000Z",
    derivedRole: "viewer",
  },
};

export function isAppRole(value: string): value is AppRole {
  return APP_ROLES.includes(value as AppRole);
}

export function normalizeRoleKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function getModuleLabel(module: PermissionModule) {
  return PERMISSION_MODULES.find((item) => item.value === module)?.label ?? module;
}

export function getActionLabel(action: PermissionAction) {
  return PERMISSION_ACTIONS.find((item) => item.value === action)?.label ?? action;
}

export function hasPermission(
  permissions: AppPermissionMatrix,
  module: PermissionModule,
  action: PermissionAction,
) {
  return Boolean(permissions[module]?.[action]);
}

export function hasAnyPermission(
  permissions: AppPermissionMatrix,
  module: PermissionModule,
  actions: PermissionAction[],
) {
  return actions.some((action) => hasPermission(permissions, module, action));
}

export function deriveLegacyRoleFromPermissions(permissions: AppPermissionMatrix): AppRole {
  if (
    hasAnyPermission(permissions, "roles", ["view", "create", "edit", "delete", "import"]) ||
    hasAnyPermission(permissions, "logs", ["view", "create", "edit", "delete", "import"]) ||
    hasPermission(permissions, "projects", "import") ||
    hasPermission(permissions, "attendance", "import") ||
    hasPermission(permissions, "reports", "import")
  ) {
    return "dev";
  }

  if (
    hasAnyPermission(permissions, "projects", ["create", "edit", "delete"]) ||
    hasAnyPermission(permissions, "attendance", ["create", "edit", "delete"]) ||
    hasAnyPermission(permissions, "reports", ["view", "create", "edit", "delete"])
  ) {
    return "staff";
  }

  return "viewer";
}

export function getBuiltInRoleDefinition(role: AppRole) {
  return BUILT_IN_ROLE_DEFINITIONS[role];
}

export function getBuiltInRoles(): RoleDefinition[] {
  return APP_ROLES.map((role) => BUILT_IN_ROLE_DEFINITIONS[role]);
}
