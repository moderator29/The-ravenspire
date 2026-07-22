import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { kindAllowedBySettings } from "@/lib/notification-prefs";

type Db = NonNullable<ReturnType<typeof adminClient>>;

/* Read the recipient's per-type notification toggles and decide whether a raven
   of this kind may be filed. Any read failure defaults to allowing the notice:
   a member should never miss a raven because a settings lookup hiccuped. */
async function kindAllowedForMember(
  db: Db,
  profileId: string,
  kind: string
): Promise<boolean> {
  try {
    const { data } = await db
      .from("profiles")
      .select("settings")
      .eq("id", profileId)
      .maybeSingle();
    return kindAllowedBySettings(data?.settings, kind);
  } catch {
    return true;
  }
}

/* The realm's notification kinds. Kept as a loose string on the wire so a new
   event can ship without a migration, but named here so callers stay honest. */
export type NotificationKind =
  | "like"
  | "reply"
  | "reraven"
  | "follow"
  | "tip"
  | "mention"
  | "whisper"
  | "raven_reply"
  | "duel_answered"
  | "duel_won"
  | "call_verdict"
  | "follow_trade"
  | "follow_call";

export interface CreateNotificationInput {
  /* Who receives the raven. */
  profile_id: string;
  kind: NotificationKind | (string & {});
  /* Who caused it (the follower, tipper, replier...). Optional for system
     notices. A self-notification (actor === recipient) is silently skipped. */
  actor_id?: string | null;
  body?: string | null;
  /* Where it points: a post id, comment id, conversation id, etc. Stored in
     the notifications.subject_id column. */
  ref?: string | null;
}

/* Fire a Supabase realtime broadcast to a member's private notification channel
   using the service role, mirroring the whispers broadcast pattern. The channel
   is keyed on the recipient's profile id; the client listens with the anon key
   and reacts by refreshing. Best effort: the row is already persisted and the
   center refetches on focus, so a broadcast failure never loses a notice. */
async function broadcastToMember(profileId: string): Promise<void> {
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
        messages: [
          {
            topic: `notifs:user:${profileId}`,
            event: "notification",
            payload: {},
            private: false,
          },
        ],
      }),
    });
  } catch {
    /* realtime is a nicety, never a requirement */
  }
}

/* Record a single notification for `profile_id`. Self-notifications (the actor
   is the recipient) are skipped so no one is ravened about their own action.
   Every step is best effort: a failure here must never break the main action
   that triggered it, so all errors are swallowed. */
export async function createNotification(
  db: Db,
  input: CreateNotificationInput
): Promise<void> {
  const { profile_id, kind, actor_id = null, body = null, ref = null } = input;
  if (!profile_id) return;
  if (actor_id && actor_id === profile_id) return;
  /* Honor the member's per-type toggles before writing anything. */
  if (!(await kindAllowedForMember(db, profile_id, kind))) return;
  try {
    const { error } = await db.from("notifications").insert({
      profile_id,
      kind,
      actor_id,
      subject_id: ref,
      body: body ? body.slice(0, 240) : null,
    });
    if (error) return;
    await broadcastToMember(profile_id);
  } catch {
    /* best effort */
  }
}

/* Fan a raven out to everyone who follows `actorId`: used for follow alerts
   when a member you follow makes a trade or seals a Call. Each recipient's
   per-type toggle is honored (createNotification checks it), and the actor is
   never notified about their own action. Capped so a very-followed member does
   not fan out unbounded. Best effort throughout. */
export async function notifyFollowers(
  db: Db,
  opts: {
    actorId: string;
    kind: NotificationKind | (string & {});
    body?: string | null;
    ref?: string | null;
  }
): Promise<void> {
  try {
    const { data } = await db
      .from("follows")
      .select("follower_id")
      .eq("followed_id", opts.actorId)
      .limit(1000);
    for (const row of data ?? []) {
      const recipient = row.follower_id as string;
      if (!recipient || recipient === opts.actorId) continue;
      await createNotification(db, {
        profile_id: recipient,
        kind: opts.kind,
        actor_id: opts.actorId,
        body: opts.body ?? null,
        ref: opts.ref ?? null,
      });
    }
  } catch {
    /* best effort */
  }
}

/* Handles are lowercase [a-z0-9_], 3-20 chars (see the onboard route). Pull the
   distinct @handles named in a body of text. "raven" is dropped: the Herald has
   its own inline reply flow and does not need a mention raven. */
export function parseHandles(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/@([a-z0-9_]{3,20})/gi)) {
    const h = m[1].toLowerCase();
    if (h !== "raven") seen.add(h);
  }
  return [...seen];
}

/* Resolve the @handles named in `text` to members and raven each of them once.
   `actorId` is never notified (you cannot mention yourself into a raven), and
   `excludeIds` lets a caller suppress people already notified for the same event
   (e.g. the post author who is getting a reply notice). Best effort throughout. */
export async function notifyMentions(
  db: Db,
  opts: {
    text: string;
    actorId: string;
    ref?: string | null;
    body?: string | null;
    excludeIds?: Iterable<string>;
  }
): Promise<void> {
  const handles = parseHandles(opts.text);
  if (!handles.length) return;
  const exclude = new Set<string>(opts.excludeIds ?? []);
  try {
    const { data } = await db
      .from("profiles")
      .select("id, handle")
      .in("handle", handles);
    for (const p of data ?? []) {
      const id = p.id as string;
      if (id === opts.actorId || exclude.has(id)) continue;
      exclude.add(id);
      await createNotification(db, {
        profile_id: id,
        kind: "mention",
        actor_id: opts.actorId,
        ref: opts.ref ?? null,
        body: opts.body ?? opts.text,
      });
    }
  } catch {
    /* best effort */
  }
}
