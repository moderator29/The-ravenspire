import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Lightweight unread poll for the realtime bell badge and in-app toasts. Returns
   the unread count and the single newest unread raven (with its actor) so the
   provider can raise a toast without a second round trip. Scoped to the caller
   by profile id; the service-role client bypasses RLS and the route is the only
   door in. */
export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const [countRes, latestRes] = await Promise.all([
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .eq("read", false),
    db
      .from("notifications")
      .select(
        "id, kind, body, created_at, subject_id, actor:actor_id (handle, display_name, avatar_url)"
      )
      .eq("profile_id", profile.id)
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return json({
    count: countRes.count ?? 0,
    latest: latestRes.data ?? null,
  });
}
