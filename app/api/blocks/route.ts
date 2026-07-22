import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ blocked: [] });
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);
  const { data } = await db
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", profile.id);
  return json({ blocked: (data ?? []).map((r) => r.blocked_id) });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    profile_id?: string;
    on?: boolean;
  } | null;
  if (!body?.profile_id) return json({ error: "bad request" }, 400);
  if (body.profile_id === profile.id)
    return json({ error: "You cannot banish yourself from your own sight" }, 400);

  if (body.on) {
    await db
      .from("blocks")
      .upsert({ blocker_id: profile.id, blocked_id: body.profile_id });
    /* Blocking also severs the follow threads both ways. */
    await db
      .from("follows")
      .delete()
      .or(
        `and(follower_id.eq.${profile.id},followee_id.eq.${body.profile_id}),and(follower_id.eq.${body.profile_id},followee_id.eq.${profile.id})`
      );
  } else {
    await db
      .from("blocks")
      .delete()
      .eq("blocker_id", profile.id)
      .eq("blocked_id", body.profile_id);
  }
  return json({ ok: true });
}
