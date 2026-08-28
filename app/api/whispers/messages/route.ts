import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { isRealmMediaUrl } from "@/lib/social/media-url";
import { uuid } from "@/lib/validate";

type Db = NonNullable<ReturnType<typeof adminClient>>;

interface WhisperMessage {
  id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
}

async function assertMember(
  db: Db,
  conversationId: string,
  profileId: string
) {
  const { data } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profileId)
    .maybeSingle();
  return Boolean(data);
}

/* True when this send must be refused because one of the two members has
   blocked the other. Answers false for anything that is not a pair, and false
   when the lookup itself fails: a blocks table that cannot be read must not
   silence a conversation, and the door is still closed at creation time. Both
   ids are proven uuids before they reach the .or() filter, where , ( ) and .
   are grammar a crafted value could otherwise rewrite (lib/validate.ts). */
async function blockedBetween(
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

/* Only images uploaded to our own public media shelf may travel in a whisper.
   Anything else (external URLs, other buckets) is rejected so a message can
   never be used to smuggle a foreign link dressed as an image. The predicate
   itself is lib/social/media-url.ts, shared with the posts and profile routes
   so the four places that accept an image URL cannot drift apart again; the
   path-segment matching it does is the version this file already used.

   BLOCKS ARE RE-CHECKED ON EVERY SEND, not only when the conversation was
   opened. /api/whispers refuses to create a dm across a block in either
   direction, and that used to be the whole of it: a thread opened before
   either member blocked the other stayed open forever, so the block that a
   member expected to close a door left it exactly as wide as it was. Only
   two-member threads are judged, because a block between two people in a room
   of six is not a reason to silence one of them for everybody. */

/* Fire a realtime broadcast through Supabase's HTTP endpoint using the service
   role. Topics are keyed on the secret conversation id (a v4 UUID only the two
   participants ever receive), so no message content is exposed through the
   public anon key the way an RLS-open table would be. Best effort: the message
   is already persisted, and the client polls as a fallback, so a broadcast
   failure never loses a whisper. */
async function broadcast(
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

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const conversation = new URL(req.url).searchParams.get("conversation");
  if (!conversation) return json({ error: "bad request" }, 400);
  if (!(await assertMember(db, conversation, profile.id)))
    return json({ error: "Not your whisper" }, 403);

  const { data: messages } = await db
    .from("messages")
    .select("id, sender_id, body, image_url, created_at")
    .eq("conversation_id", conversation)
    .order("created_at", { ascending: true })
    .limit(200);

  await db
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversation)
    .eq("profile_id", profile.id);

  return json({ me: profile.id, messages: (messages ?? []) as WhisperMessage[] });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* C4: a whisper writes a row, a broadcast per participant and a notification
     per participant, so a script in a group thread multiplies every send. Set
     above a fast real conversation rather than at it: two messages a minute,
     sustained for an hour, is a lively exchange and nowhere near this. */
  const rl = await rateLimit(profileKey("whispers", profile.id), 120, 3600);
  if (!rl.ok)
    return json(
      {
        error: "You have whispered enough for one hour. Take a breath.",
        retryAfter: rl.retryAfter,
      },
      429
    );

  const body = (await req.json().catch(() => null)) as {
    conversation?: string;
    body?: string;
    imageUrl?: string;
  } | null;

  const text = body?.body?.trim() ?? "";
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl : null;

  if (!body?.conversation) return json({ error: "bad request" }, 400);
  if (!text && !imageUrl) return json({ error: "bad request" }, 400);
  if (text.length > 1000) return json({ error: "Too long for one breath" }, 400);
  if (imageUrl && !isRealmMediaUrl(imageUrl))
    return json({ error: "That image is not from the realm" }, 400);
  if (!(await assertMember(db, body.conversation, profile.id)))
    return json({ error: "Not your whisper" }, 403);
  /* C10: the same refusal, in the same words, that /api/whispers gives when a
     blocked pair try to open a thread. */
  if (await blockedBetween(db, body.conversation, profile.id))
    return json({ error: "That door is closed." }, 403);

  const { data: created, error } = await db
    .from("messages")
    .insert({
      conversation_id: body.conversation,
      sender_id: profile.id,
      body: text || null,
      image_url: imageUrl,
    })
    .select("id, sender_id, body, image_url, created_at")
    .single();
  if (error || !created) return json({ error: "The whisper was lost" }, 500);

  const now = new Date().toISOString();
  await db
    .from("conversations")
    .update({ last_message_at: now })
    .eq("id", body.conversation);

  const message = created as WhisperMessage;

  /* Notify the open thread instantly, then nudge every other participant's
     personal channel so their conversation corridor reorders and lights up
     even when they do not have this thread open. */
  await broadcast(`whispers:conv:${body.conversation}`, "message", { message });

  const { data: members } = await db
    .from("conversation_members")
    .select("profile_id")
    .eq("conversation_id", body.conversation)
    .neq("profile_id", profile.id);
  const preview = text ? text.slice(0, 120) : "sent you an image";
  await Promise.all(
    (members ?? []).flatMap((m) => [
      broadcast(`whispers:user:${m.profile_id}`, "bump", {
        conversation: body.conversation,
      }),
      /* A new whisper also lands in the recipient's ravens. Best effort; the
         conversation id rides as the ref so the center links to the thread. */
      createNotification(db, {
        profile_id: m.profile_id as string,
        kind: "whisper",
        actor_id: profile.id,
        ref: body.conversation,
        body: preview,
      }),
    ])
  );

  return json({ ok: true, message });
}
