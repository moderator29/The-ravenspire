import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

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

/* Only images uploaded to our own public media shelf may travel in a whisper.
   Anything else (external URLs, other buckets) is rejected so a message can
   never be used to smuggle a foreign link dressed as an image.

   We match on the storage path segment rather than the full origin so a
   trailing slash, a custom storage domain, or any drift between the upload
   host and NEXT_PUBLIC_SUPABASE_URL cannot silently reject every image (the
   same bug that once left every post with media = []). The url must still be
   an absolute https URL that resolves to /storage/v1/object/public/media/. */
const MEDIA_PATH = "/storage/v1/object/public/media/";
function isOwnMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.pathname.startsWith(MEDIA_PATH);
  } catch {
    return false;
  }
}

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
  if (imageUrl && !isOwnMediaUrl(imageUrl))
    return json({ error: "That image is not from the realm" }, 400);
  if (!(await assertMember(db, body.conversation, profile.id)))
    return json({ error: "Not your whisper" }, 403);

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
