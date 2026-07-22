import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data } = await db
    .from("notifications")
    .select(
      "id, kind, body, read, created_at, subject_id, actor:actor_id (handle, display_name, avatar_url)"
    )
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);
  return json({ notifications: data ?? [] });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);
  await db
    .from("notifications")
    .update({ read: true })
    .eq("profile_id", profile.id)
    .eq("read", false);
  return json({ ok: true });
}
