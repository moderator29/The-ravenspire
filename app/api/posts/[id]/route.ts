import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { ANON_VIEWER, loadPost, resolveViewer } from "@/lib/social/feed-server";

/* GET /api/posts/[id]
 *
 * A single raven, gated by its audience. The anon key can no longer read a
 * restricted raven (see migration 20260811120000), so the raven page reads
 * through here instead of querying posts from the browser.
 *
 * A raven the reader is not admitted to answers 404, not 403: the existence of
 * a "Followers only" raven is itself part of what its author restricted. */

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { id } = await ctx.params;
  if (!id) return json({ error: "bad request" }, 400);

  const profile = await getProfile(req);
  const viewer = profile ? await resolveViewer(db, profile) : ANON_VIEWER;

  const post = await loadPost(db, viewer, id);
  if (!post) return json({ error: "not found" }, 404);
  return json({ post });
}
