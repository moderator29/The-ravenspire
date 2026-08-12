import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import type { FeedViewer } from "@/lib/social/feed-server";
import { EVENT_KINDS, type RealmEventRow } from "@/lib/realm/events";

/* Reading the realm event spine, with its audience applied.
 *
 * This is the second half of lib/realm/events.ts: emit() writes, this reads.
 * It exists as its own module because two surfaces now need the same decision,
 * GET /api/events and the unified Ravenry in /api/feed, and a second copy of an
 * audience rule is a second place for it to drift open.
 *
 * The rule, unchanged from the route that used to own it:
 *
 *   realm      everyone, signed in or not
 *   house      members of the actor's House
 *   followers  the actor's followers, plus the actor
 *   actor      the actor alone
 *
 * The database backs this up rather than trusting it: the realm_events RLS
 * policy exposes only audience = 'realm' to the browser roles, so the narrower
 * audiences are readable solely through the service-role client held by a
 * server route. Nothing here accepts a viewer off the wire; the caller resolves
 * one from a verified token through resolveViewer().
 *
 * Blocks and mutes are deliberately not applied here. lib/social/queries.ts and
 * the Ravenry own that policy for ravens, and the same lists are applied to
 * event actors on the client beside them. */

type Db = NonNullable<ReturnType<typeof adminClient>>;

/* The kinds the Ravenry renders. A kind reaches this list only when it has a
   real producer somewhere in the product AND a card in the registry, so the
   feed can never surface a row it would draw as a blank.

   call.sealed is emitted and is deliberately absent: sealing a Call already
   writes the post that carries it, and the post is the richer card (chart,
   replies, the whole action bar). Rendering both would double every Call in
   the timeline. Dropping the event rather than the post is also the safe
   direction for audience, since a post can be narrower than its event.

   season.milestone and raven.chronicle are absent because nothing emits them
   yet. When a producer lands, it arrives with its card and one line here. */
export const FEED_EVENT_KINDS = [
  "call.resolved",
  "crest.earned",
  "house.overtake",
  "duel.opened",
  "quest.completed",
  "oath.sworn",
] as const;

/* Whether this reader is in the audience for one event. The authoritative
   decision; any SQL narrowing above it is an optimisation, never the gate. */
export function canViewEvent(row: RealmEventRow, viewer: FeedViewer): boolean {
  if (row.audience === "realm") return true;
  if (!viewer.id) return false;
  /* Your own acts always reach you, whatever they were scoped to. */
  if (row.actor_id === viewer.id) return true;
  if (row.audience === "actor") return false;
  if (row.audience === "house") {
    return Boolean(viewer.houseSlug && row.house_slug === viewer.houseSlug);
  }
  if (row.audience === "followers") {
    return Boolean(row.actor_id && viewer.followingIds.includes(row.actor_id));
  }
  /* An unknown audience is a closed one. */
  return false;
}

export interface EventQuery {
  /* Keyset cursor: return only events strictly older than this ISO time. */
  before?: string | null | undefined;
  /* Narrowing, each validated against a known set by the caller. */
  kinds?: readonly string[] | undefined;
  houseSlug?: string | null | undefined;
  actorIds?: readonly string[] | null | undefined;
  limit?: number | undefined;
}

/* Audience filtering happens after the query, so a page that asked for exactly
   its limit would come back short. Over-fetch and trim. */
const FETCH_MULTIPLIER = 3;

/* One window of the spine, newest first, with the audience already applied.
   Returns at most `limit` rows; the caller decides where the page ends. */
export async function loadRealmEvents(
  db: Db,
  viewer: FeedViewer,
  opts: EventQuery = {}
): Promise<RealmEventRow[]> {
  const limit = Math.max(1, opts.limit ?? 30);

  /* An empty actor list means "nobody", not "everybody". The Following tab
     relies on this: a member who follows no one sees no borrowed events. */
  if (opts.actorIds && opts.actorIds.length === 0) return [];

  let q = db
    .from("realm_events")
    .select(
      "id, kind, actor_id, subject_type, subject_id, house_slug, payload, audience, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit * FETCH_MULTIPLIER);

  const kinds = (opts.kinds ?? []).filter((k) =>
    (EVENT_KINDS as readonly string[]).includes(k)
  );
  if (kinds.length > 0) q = q.in("kind", kinds);
  if (opts.houseSlug) q = q.eq("house_slug", opts.houseSlug);
  if (opts.actorIds && opts.actorIds.length > 0)
    q = q.in("actor_id", opts.actorIds);
  if (opts.before) {
    const cursor = new Date(opts.before);
    if (!Number.isNaN(cursor.getTime()))
      q = q.lt("created_at", cursor.toISOString());
  }

  const { data, error } = await q;
  if (error) return [];

  return ((data ?? []) as RealmEventRow[])
    .filter((row) => canViewEvent(row, viewer))
    .slice(0, limit);
}

/* The actor as a card draws them. Same shape the feed already uses for a
   raven's author, so one Avatar and one name line serve both. */
export interface EventActor {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier: string;
  is_agent?: boolean;
}

/* Every actor in a page, in one query. A card must never fetch its own author:
   thirty cards would be thirty round trips on the highest traffic path in the
   product. */
export async function loadEventActors(
  db: Db,
  rows: RealmEventRow[]
): Promise<Record<string, EventActor>> {
  const ids = [
    ...new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[]),
  ];
  if (ids.length === 0) return {};
  const { data } = await db
    .from("profiles")
    .select("id, handle, display_name, avatar_url, house_slug, tier, is_agent")
    .in("id", ids);
  const actors: Record<string, EventActor> = {};
  for (const row of (data ?? []) as EventActor[]) actors[row.id] = row;
  return actors;
}
