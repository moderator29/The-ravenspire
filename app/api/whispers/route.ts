import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data: memberships } = await db
    .from("conversation_members")
    .select("conversation_id, last_read_at")
    .eq("profile_id", profile.id);
  const ids = (memberships ?? []).map((m) => m.conversation_id);
  if (!ids.length) return json({ me: profile.id, conversations: [] });
  const lastRead = new Map(
    (memberships ?? []).map((m) => [m.conversation_id, m.last_read_at])
  );

  const { data: convos } = await db
    .from("conversations")
    .select("id, kind, title, last_message_at")
    .in("id", ids)
    .order("last_message_at", { ascending: false })
    .limit(50);

  const { data: others } = await db
    .from("conversation_members")
    .select(
      "conversation_id, profile:profiles (id, handle, display_name, avatar_url)"
    )
    .in("conversation_id", ids)
    .neq("profile_id", profile.id);

  const otherBy = new Map(
    (others ?? []).map((o) => [o.conversation_id, o.profile])
  );

  const conversations = [];
  for (const c of convos ?? []) {
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", c.id)
      .neq("sender_id", profile.id)
      .gt("created_at", lastRead.get(c.id) ?? "1970-01-01");
    conversations.push({
      ...c,
      other: otherBy.get(c.id) ?? null,
      unread: count ?? 0,
    });
  }
  return json({ me: profile.id, conversations });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded) return json({ error: "Finish onboarding first" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as { with?: string } | null;
  if (!body?.with) return json({ error: "bad request" }, 400);
  if (body.with === profile.id)
    return json({ error: "Talking to yourself is what the Raven is for" }, 400);

  const { data: target } = await db
    .from("profiles")
    .select("id, is_agent")
    .eq("id", body.with)
    .maybeSingle();
  if (!target) return json({ error: "No such Keep" }, 404);
  if (target.is_agent)
    return json({ error: "The Herald prefers open court. Tag @raven instead." }, 400);

  /* Respect blocks in both directions. */
  const { data: blocked } = await db
    .from("blocks")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${profile.id},blocked_id.eq.${body.with}),and(blocker_id.eq.${body.with},blocked_id.eq.${profile.id})`
    )
    .limit(1);
  if (blocked?.length)
    return json({ error: "That door is closed." }, 403);

  /* Reuse an existing dm between the pair. */
  const { data: mine } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("profile_id", profile.id);
  const mineIds = (mine ?? []).map((m) => m.conversation_id);
  if (mineIds.length) {
    const { data: shared } = await db
      .from("conversation_members")
      .select("conversation_id, conversations!inner(kind)")
      .eq("profile_id", body.with)
      .in("conversation_id", mineIds)
      .limit(1);
    const existing = shared?.[0]?.conversation_id;
    if (existing) return json({ id: existing });
  }

  const { data: convo, error } = await db
    .from("conversations")
    .insert({ kind: "dm" })
    .select("id")
    .single();
  if (error || !convo) return json({ error: "Could not open the whisper" }, 500);
  await db.from("conversation_members").insert([
    { conversation_id: convo.id, profile_id: profile.id },
    { conversation_id: convo.id, profile_id: body.with },
  ]);
  return json({ id: convo.id });
}
