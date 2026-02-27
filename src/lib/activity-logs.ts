import "server-only";

import type { AppRole, AppUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

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

type CreateActivityLogInput = {
  actor: AppUser;
  actionType: string;
  module: string;
  entityId?: string | null;
  entityName?: string | null;
  description: string;
  payload?: Record<string, unknown> | null;
};

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

export async function getActivityLogs(limit = 200): Promise<ActivityLog[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("activity_logs")
    .select(
      "id, actor_id, actor_name, actor_username, actor_role, action_type, module, entity_id, entity_name, description, payload, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => mapActivityLogRow(row as Record<string, unknown>));
}
