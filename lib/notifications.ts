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

/* How many ids ride in one PostgREST `in` filter, and how many rows in one
   insert. Both are URL and statement size guards rather than policy: a
   thousand ids in a single query string is how a fan-out starts failing for
   the most-followed members and nobody else. */
const READ_CHUNK = 200;
const INSERT_CHUNK = 500;

/* How many broadcasts are in flight at once. Concurrent, because a thousand
   sequential HTTP calls is what made this fan-out take minutes; bounded,
   because a thousand at once is a burst against the realtime endpoint that
   would be throttled and drop notices the rows already promised. */
const BROADCAST_CONCURRENCY = 16;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* Run `task` over every id, at most `limit` at a time. Failures are the
   caller's to swallow; nothing here throws. */
async function pooled(
  ids: string[],
  limit: number,
  task: (id: string) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, ids.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= ids.length) return;
      await task(ids[i]);
    }
  });
  await Promise.all(workers);
}

/* Fan a raven out to everyone who follows `actorId`: used for follow alerts
   when a member you follow makes a trade or seals a Call. Each recipient's
   per-type toggle is honored, and the actor is never notified about their own
   action. Capped so a very-followed member does not fan out unbounded. Best
   effort throughout.

   BATCHED, and that is the whole of what changed. This used to call
   createNotification in a loop, which meant a settings SELECT, an INSERT and a
   broadcast per follower, one after another, up to a thousand times: three
   thousand round trips on the tail of a single Call, inside `after`, where a
   serverless function is still being paid for and can be cut off before the
   last follower is reached. The work is identical now and the shape is not:
   one read of the followers, one read of their settings, one insert per batch,
   and the broadcasts concurrent behind a small pool. Per-type toggles are
   still honored, the actor is still skipped, and a member whose settings row
   cannot be read is still notified rather than silently dropped. */
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
    /* C3: this filtered `followed_id`, a column that does not exist. PostgREST
       answered with an error, the catch swallowed it, and so every follower
       fan-out (follow_call, follow_trade) has silently never fired. The column
       is followee_id. */
    const { data } = await db
      .from("follows")
      .select("follower_id")
      .eq("followee_id", opts.actorId)
      .limit(1000);

    const followers = [
      ...new Set(
        (data ?? [])
          .map((row) => row.follower_id as string)
          .filter((id) => id && id !== opts.actorId)
      ),
    ];
    if (!followers.length) return;

    /* Everyone's toggles in one pass. A follower whose row does not come back
       keeps the default the single-notice path uses: allowed. */
    const settingsById = new Map<string, unknown>();
    for (const ids of chunk(followers, READ_CHUNK)) {
      const { data: rows } = await db
        .from("profiles")
        .select("id, settings")
        .in("id", ids);
      for (const row of rows ?? [])
        settingsById.set(row.id as string, row.settings);
    }

    const recipients = followers.filter((id) =>
      settingsById.has(id)
        ? kindAllowedBySettings(settingsById.get(id), opts.kind)
        : true
    );
    if (!recipients.length) return;

    const body = opts.body ? opts.body.slice(0, 240) : null;
    const delivered: string[] = [];
    for (const ids of chunk(recipients, INSERT_CHUNK)) {
      const { error } = await db.from("notifications").insert(
        ids.map((id) => ({
          profile_id: id,
          kind: opts.kind,
          actor_id: opts.actorId,
          subject_id: opts.ref ?? null,
          body,
        }))
      );
      /* Only broadcast what actually landed. A refresh nudge for a notice that
         was never written sends a member to an empty center. */
      if (!error) delivered.push(...ids);
    }

    await pooled(delivered, BROADCAST_CONCURRENCY, broadcastToMember);
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
