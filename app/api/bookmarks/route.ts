import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* Lightweight probe: ?ids=a,b,c returns just the subset of those post ids the
     viewer has bookmarked. The bookmarks table is not client-readable (RLS), so
     the feed/profile queries resolve the viewer's bookmark flags through here
     rather than the browser Supabase client. */
  const idsParam = new URL(req.url).searchParams.get("ids");
  if (idsParam !== null) {
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    if (ids.length === 0) return json({ bookmarked: [] });
    const { data: rows } = await db
      .from("bookmarks")
      .select("post_id")
      .eq("profile_id", profile.id)
      .in("post_id", ids);
    const bookmarked = (rows ?? []).map((r) => r.post_id as string);
    return json({ bookmarked });
  }

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
