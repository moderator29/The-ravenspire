import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { uuid } from "@/lib/validate";

export type Db = NonNullable<ReturnType<typeof adminClient>>;

/* Shared between every route that touches a whisper thread: who may read or
   write it, and how a change reaches the open thread live. Extracted rather
   than duplicated once a second route (the reaction toggle) needed the exact
   same membership and block checks app/api/whispers/messages/route.ts already
   carried. */

export async function assertMember(
  db: Db,
  conversationId: string,
  profileId: string
): Promise<boolean> {
  const { data } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profileId)
    .maybeSingle();
  return Boolean(data);
}

/* True when this action must be refused because one of the two members has
   blocked the other. Answers false for anything that is not a pair, and false
   when the lookup itself fails: a blocks table that cannot be read must not
   silence a conversation, and the door is still closed at creation time. Both
   ids are proven uuids before they reach the .or() filter, where , ( ) and .
   are grammar a crafted value could otherwise rewrite.

   The pair check is not a defensive fallback for a case that cannot happen;
   it is the actual shape of every whisper. Whispers is dm only by decision,
   not by accident (the 20260908160000 migration constrains
   conversations.kind to 'dm' at the database level). */
export async function blockedBetween(
  db: Db,
  conversationId: string,
  profileId: string
): Promise<boolean> {
  const { data: members } = await db
    .from("conversation_members")
    .select("profile_id")
    .eq("conversation_id", conversationId)
    .limit(3);
  const ids = (members ?? []).map((m) => m.profile_id as string);
  if (ids.length !== 2) return false;
  const other = ids.find((id) => id !== profileId);
  if (!other || !uuid(other) || !uuid(profileId)) return false;
  const { data: blocked } = await db
    .from("blocks")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${profileId},blocked_id.eq.${other}),and(blocker_id.eq.${other},blocked_id.eq.${profileId})`
    )
    .limit(1);
  return Boolean(blocked?.length);
}

/* Fire a realtime broadcast through Supabase's HTTP endpoint using the service
   role. Topics are keyed on the secret conversation id (a v4 UUID only the two
   participants ever receive), so no message content is exposed through the
   public anon key the way an RLS-open table would be. Best effort: whatever
   this announces is already persisted, and the open thread polls as a
   fallback, so a broadcast failure never loses a whisper or a reaction. */
export async function broadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return;
  try {
    await fetch(`${base}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload, private: false }],
      }),
    });
  } catch {
    /* realtime is a nicety, never a requirement */
  }
}
