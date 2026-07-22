import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* One view per member per post per day; the count is real, not vanity math. */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ ok: true, counted: false });
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as { post_id?: string } | null;
  if (!body?.post_id) return json({ error: "bad request" }, 400);

  const { error } = await db.from("post_views").insert({
    post_id: body.post_id,
    viewer_id: profile.id,
  });
  if (!error) {
    const { data: post } = await db
      .from("posts")
      .select("view_count")
      .eq("id", body.post_id)
      .single();
    if (post)
      await db
        .from("posts")
        .update({ view_count: post.view_count + 1 })
        .eq("id", body.post_id);
  }
  return json({ ok: true, counted: !error });
}
