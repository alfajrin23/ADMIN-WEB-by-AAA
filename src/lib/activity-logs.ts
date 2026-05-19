import "server-only";

import { after } from "next/server";
import type { AppRole, AppUser } from "@/lib/auth";
import { getSupabaseServerClient, isSupabaseWriteConfigured } from "@/lib/supabase";

export type ActivityLog = {
  id: string;
  actorId: string | null;
  actorName: string;
  actorUsername: string | null;
  actorRole: AppRole;
  actionType: string;
  module: string;
  entityId: string | null;
  entityName: string | null;
  description: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export type CreateActivityLogInput = {
  actor: Pick<AppUser, "id" | "fullName" | "username" | "role" | "createdAt">;
  actionType: string;
  module: string;
  entityId?: string | null;
  entityName?: string | null;
  description: string;
  payload?: Record<string, unknown> | null;
};

export type ActivityLogReadResult = {
  logs: ActivityLog[];
  errorMessage: string;
  isWriteConfigured: boolean;
};

export const SUPABASE_ACTIVITY_LOG_CONFIG_MESSAGE =
  "SUPABASE_SERVICE_ROLE_KEY belum diset. Logs input dan operasi tambah/edit/hapus Supabase membutuhkan service role key server-side.";

function mapActivityLogRow(row: Record<string, unknown>): ActivityLog {
  const actorRoleRaw = String(row.actor_role ?? "");
  const actorRole: AppRole =
    actorRoleRaw === "dev" || actorRoleRaw === "staff" || actorRoleRaw === "viewer"
      ? actorRoleRaw
      : "viewer";

  return {
    id: String(row.id ?? ""),
    actorId: row.actor_id ? String(row.actor_id) : null,
    actorName: String(row.actor_name ?? "-"),
    actorUsername: row.actor_username ? String(row.actor_username) : null,
    actorRole,
    actionType: String(row.action_type ?? ""),
    module: String(row.module ?? ""),
    entityId: row.entity_id ? String(row.entity_id) : null,
    entityName: row.entity_name ? String(row.entity_name) : null,
    description: String(row.description ?? ""),
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function createActivityLog(input: CreateActivityLogInput) {
  if (!isSupabaseWriteConfigured) {
    console.warn("[activity-log] SUPABASE_SERVICE_ROLE_KEY belum diset, log tidak ditulis.");
    return;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("activity_logs").insert({
    actor_id: input.actor.id,
    actor_name: input.actor.fullName,
    actor_username: input.actor.username,
    actor_role: input.actor.role,
    action_type: input.actionType,
    module: input.module,
    entity_id: input.entityId ?? null,
    entity_name: input.entityName ?? null,
    description: input.description,
    payload: input.payload ?? null,
  });

  if (error) {
    console.warn("[activity-log] gagal menulis log.", error.message);
  }
}

export function queueActivityLog(input: CreateActivityLogInput) {
  after(async () => {
    await createActivityLog(input);
  });
}

export async function getActivityLogReadResult(limit = 200): Promise<ActivityLogReadResult> {
  if (!isSupabaseWriteConfigured) {
    return {
      logs: [],
      errorMessage: SUPABASE_ACTIVITY_LOG_CONFIG_MESSAGE,
      isWriteConfigured: false,
    };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return {
      logs: [],
      errorMessage: "Supabase belum terkonfigurasi.",
      isWriteConfigured: false,
    };
  }

  const { data, error } = await supabase
    .from("activity_logs")
    .select(
      "id, actor_id, actor_name, actor_username, actor_role, action_type, module, entity_id, entity_name, description, payload, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      logs: [],
      errorMessage: `Gagal membaca logs input dari Supabase: ${error.message}`,
      isWriteConfigured: true,
    };
  }

  return {
    logs: (data ?? []).map((row) => mapActivityLogRow(row as Record<string, unknown>)),
    errorMessage: "",
    isWriteConfigured: true,
  };
}

export async function getActivityLogs(limit = 200): Promise<ActivityLog[]> {
  return (await getActivityLogReadResult(limit)).logs;
}
