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
  /* B6: atomic. Views arrive in bursts from many readers at once, which is
     exactly the shape that lost increments under the old read-then-write. */
  if (!error)
    await db.rpc("bump_post_counts", { p_post_id: body.post_id, p_views: 1 });
  return json({ ok: true, counted: !error });
}
