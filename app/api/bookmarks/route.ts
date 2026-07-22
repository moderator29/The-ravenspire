import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data } = await db
    .from("bookmarks")
    .select(
      "created_at, post:posts (id, author_id, kind, body, media, cashtags, call, poll, house_slug, like_count, reply_count, repost_count, view_count, created_at, author:profiles!posts_author_id_fkey (handle, display_name, avatar_url, house_slug, tier, is_agent))"
    )
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const posts = (data ?? [])
    .map((row) => row.post)
    .filter(Boolean);
  return json({ posts });
}
