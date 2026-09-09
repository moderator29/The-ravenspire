import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { isRealmMediaUrl } from "@/lib/social/media-url";
import { assertMember, blockedBetween, broadcast } from "@/lib/whispers/guard";

interface WhisperMessage {
  id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  /* Every reaction currently standing on this message, at most one per
     member (see lib/whispers/guard.ts's neighbour, the react route). */
  reactions: { profile_id: string; reaction: string }[];
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

  const ids = (messages ?? []).map((m) => m.id as string);
  const { data: reactionRows } = ids.length
    ? await db
        .from("message_reactions")
        .select("message_id, profile_id, reaction")
        .in("message_id", ids)
    : { data: [] as { message_id: string; profile_id: string; reaction: string }[] };

  const reactionsByMessage = new Map<
    string,
    { profile_id: string; reaction: string }[]
  >();
  for (const row of (reactionRows ?? []) as {
    message_id: string;
    profile_id: string;
    reaction: string;
  }[]) {
    const list = reactionsByMessage.get(row.message_id);
    const entry = { profile_id: row.profile_id, reaction: row.reaction };
    if (list) list.push(entry);
    else reactionsByMessage.set(row.message_id, [entry]);
  }
  const withReactions: WhisperMessage[] = (messages ?? []).map((m) => ({
    ...(m as Omit<WhisperMessage, "reactions">),
    reactions: reactionsByMessage.get(m.id as string) ?? [],
  }));

  /* The other participant's own last_read_at, read before this member's write
     below overwrites the row that matters, so a thread opened after the other
     side already read it shows the receipt immediately rather than waiting on
     a broadcast that already happened while nobody was listening. */
  const { data: otherMember } = await db
    .from("conversation_members")
    .select("last_read_at")
    .eq("conversation_id", conversation)
    .neq("profile_id", profile.id)
    .maybeSingle();

  const now = new Date().toISOString();
  await db
    .from("conversation_members")
    .update({ last_read_at: now })
    .eq("conversation_id", conversation)
    .eq("profile_id", profile.id);

  /* A real read, not a guess: this member has genuinely just loaded the
     thread. The other participant, if present in the same conversation
     channel right now, sees the receipt land on their own last message
     without needing to reload. Best effort, same as every other broadcast in
     this file: the read is already persisted above either way. */
  await broadcast(`whispers:conv:${conversation}`, "read", {
    reader: profile.id,
    at: now,
  });

  return json({
    me: profile.id,
    messages: withReactions,
    otherReadAt: (otherMember?.last_read_at as string | null) ?? null,
  });
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

  const message: WhisperMessage = {
    ...(created as Omit<WhisperMessage, "reactions">),
    reactions: [],
  };

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
