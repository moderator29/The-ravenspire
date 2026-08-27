import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { uuid } from "@/lib/validate";

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
  /* The id is proven to be a uuid before it goes anywhere near a query. It
     used to be interpolated raw into an .or() filter string, where , ( ) and .
     are grammar, so a crafted "id" could rewrite the delete's scope. */
  if (!uuid(body?.profile_id)) return json({ error: "bad request" }, 400);
  if (body.profile_id === profile.id)
    return json({ error: "You cannot banish yourself from your own sight" }, 400);

  if (body.on) {
    await db
      .from("blocks")
      .upsert({ blocker_id: profile.id, blocked_id: body.profile_id });
    /* Blocking also severs the follow threads both ways: two deletes, each
       scoped by plain .eq() filters, so no client value ever rides inside
       filter grammar. */
    await db
      .from("follows")
      .delete()
      .eq("follower_id", profile.id)
      .eq("followee_id", body.profile_id);
    await db
      .from("follows")
      .delete()
      .eq("follower_id", body.profile_id)
      .eq("followee_id", profile.id);
  } else {
    await db
      .from("blocks")
      .delete()
      .eq("blocker_id", profile.id)
      .eq("blocked_id", body.profile_id);
  }
  return json({ ok: true });
}
