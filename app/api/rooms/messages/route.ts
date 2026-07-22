import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Realtime chat and reactions for a live court. Chat is persisted in
   room_messages and read back on open (and by a polling fallback); every send
   also fires a service-role broadcast on the court channel so open room views
   receive it instantly. Reactions are ephemeral: broadcast only, never stored,
   so the floor can light up without filling the ledger. Mirrors the whispers
   broadcast approach so RLS never blocks the anon client from seeing chat. */

type Db = NonNullable<ReturnType<typeof adminClient>>;

type SenderRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

interface RoomMessage {
  id: string;
  profile_id: string;
  body: string | null;
  created_at: string;
  sender: {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

/* Reaction keys map to existing Icon names on the client; the server only
   guards the allowlist so a broadcast can never carry an arbitrary token. */
const REACTIONS = new Set([
  "heart",
  "flame",
  "crown",
  "swords",
  "medal",
  "shield",
]);

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

async function roomExists(db: Db, id: string): Promise<boolean> {
  const { data } = await db
    .from("rooms")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const room = new URL(req.url).searchParams.get("room");
  if (!room) return json({ error: "bad request" }, 400);
  if (!(await roomExists(db, room)))
    return json({ error: "No such court." }, 404);

  const { data: rows } = await db
    .from("room_messages")
    .select("id, profile_id, body, created_at")
    .eq("room_id", room)
    .eq("kind", "chat")
    .order("created_at", { ascending: true })
    .limit(150);

  const list = rows ?? [];
  const senderIds = [...new Set(list.map((m) => m.profile_id as string))];
  const { data: senders } = senderIds.length
    ? await db
        .from("profiles")
        .select("id, handle, display_name, avatar_url")
        .in("id", senderIds)
    : { data: [] as SenderRow[] };

  const map = new Map<string, SenderRow>();
  for (const s of (senders ?? []) as SenderRow[]) map.set(s.id, s);

  const messages: RoomMessage[] = list.map((m) => {
    const s = map.get(m.profile_id as string);
    return {
      id: m.id as string,
      profile_id: m.profile_id as string,
      body: m.body as string | null,
      created_at: m.created_at as string,
      sender: s
        ? {
            handle: s.handle,
            display_name: s.display_name,
            avatar_url: s.avatar_url,
          }
        : null,
    };
  });

  return json({ me: profile.id, messages });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    room?: string;
    body?: string;
    reaction?: string;
  } | null;
  if (!body?.room) return json({ error: "bad request" }, 400);

  const { data: room } = await db
    .from("rooms")
    .select("id, status")
    .eq("id", body.room)
    .maybeSingle();
  if (!room) return json({ error: "No such court." }, 404);
  if (room.status === "ended")
    return json({ error: "That court has adjourned." }, 409);

  const topic = `rooms:court:${body.room}`;

  /* Ephemeral reaction: broadcast a floating mark, store nothing. */
  if (body.reaction) {
    if (!REACTIONS.has(body.reaction))
      return json({ error: "Unknown reaction." }, 400);
    await broadcast(topic, "reaction", {
      reaction: body.reaction,
      profile_id: profile.id,
      handle: profile.handle,
      at: Date.now(),
    });
    return json({ ok: true });
  }

  const text = body.body?.trim() ?? "";
  if (!text) return json({ error: "bad request" }, 400);
  if (text.length > 500)
    return json({ error: "Too many words for one breath." }, 400);

  const { data: created, error } = await db
    .from("room_messages")
    .insert({
      room_id: body.room,
      profile_id: profile.id,
      kind: "chat",
      body: text,
    })
    .select("id, profile_id, body, created_at")
    .single();
  if (error || !created) return json({ error: "The word was lost." }, 500);

  const message: RoomMessage = {
    id: created.id as string,
    profile_id: created.profile_id as string,
    body: created.body as string | null,
    created_at: created.created_at as string,
    sender: {
      handle: profile.handle,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    },
  };

  await broadcast(topic, "message", { message });
  return json({ ok: true, message });
}
