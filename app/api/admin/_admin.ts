import type { SupabaseClient } from "@supabase/supabase-js";
import { requireProfile, json, type SessionProfile } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Shared admin gate. Copies the requireProfile + is_admin + adminClient pattern
   every admin route already uses, in one place. Returns either a ready context
   or the Response to return early. */
export type AdminContext = { profile: SessionProfile; db: SupabaseClient };

export async function requireAdmin(
  req: Request
): Promise<AdminContext | Response> {
  const profile = await requireProfile(req);
  if (!profile?.is_admin) return json({ error: "forbidden" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);
  return { profile, db };
}

export function isResponse(x: AdminContext | Response): x is Response {
  return x instanceof Response;
}

/* Record a privileged action. Best effort: a failed insert never blocks the
   action it describes, but the common path always leaves a trail. */
export async function logAdminAction(
  db: SupabaseClient,
  actorId: string,
  action: string,
  opts?: {
    targetType?: string | null;
    targetId?: string | number | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db.from("admin_audit_log").insert({
      actor_id: actorId,
      action,
      target_type: opts?.targetType ?? null,
      target_id: opts?.targetId != null ? String(opts.targetId) : null,
      payload: opts?.payload ?? {},
    });
  } catch {
    /* audit is best effort; never throw into the caller */
  }
}
