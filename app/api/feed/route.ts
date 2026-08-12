import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  ANON_VIEWER,
  FEED_TABS,
  PAGE_SIZE,
  loadAuthorPosts,
  loadFeed,
  resolveViewer,
  type FeedTab,
  type FeedViewer,
} from "@/lib/social/feed-server";
import {
  FEED_EVENT_KINDS,
  loadEventActors,
  loadRealmEvents,
} from "@/lib/realm/feed-events";
import {
  composeFeed,
  decodeFeedCursor,
  encodeFeedCursor,
} from "@/lib/feed/compose";
import { eventItem, postItem, type FeedEvent, type FeedItem } from "@/lib/feed/types";

/* GET /api/feed
 *
 * The Ravenry, read server-side, and now the whole realm rather than only its
 * ravens. One request returns members' ravens interleaved with the realm event
 * spine (Calls resolving, crests earned, Houses overtaking, duels opened,
 * quests completed, oaths sworn), ordered by time under one cursor.
 *
 * Two reasons this is a server route rather than two client fetches:
 *
 * AUDIENCE. A raven's audience cannot be enforced in the browser, because the
 * anon key ships in the bundle and a client-built filter is a suggestion. The
 * viewer is resolved from the verified Privy bearer token, the follow graph is
 * read from the database, and both sources apply their own audience rule
 * before anything is returned: lib/social/feed-server.ts for ravens, and
 * lib/realm/feed-events.ts for the spine. See migration 20260811120000 for the
 * RLS floor underneath both.
 *
 * PAGING. Interleaving two time ordered sources is where a page boundary eats
 * a row. lib/feed/compose.ts owns that, with tests.
 *
 * Query:
 *   tab    foryou | following | houses | signal | latest   (default foryou)
 *   before the cursor from the previous page, opaque, per source
 *   house  House slug, when reading a specific House hall
 *   author profile id, when reading one member's Keep
 *
 * Signed out is a first-class case: it resolves to the anonymous viewer, who
 * sees public ravens and realm-scoped events only. */

export const dynamic = "force-dynamic";

/* Which realm events belong beside which tab.
 *
 *   foryou / latest   the whole realm the viewer is admitted to
 *   following         only the members they follow, and themselves
 *   houses            only what happened under that banner
 *   signal            none. Signal ranks Calls by verified outcome rather than
 *                     by time, and a stream of events cannot be ranked by a
 *                     Call's verdict without inventing one. */
function eventScope(
  tab: FeedTab,
  viewer: FeedViewer,
  houseSlug: string | null
): { enabled: boolean; actorIds?: string[]; houseSlug?: string | null } {
  if (tab === "signal") return { enabled: false };
  /* A House hall with no House is not the realm. A member who has not sworn
     yet sees an empty hall and an invitation to swear, never every event in
     the realm because the filter had nothing to narrow with. */
  if (tab === "houses")
    return houseSlug ? { enabled: true, houseSlug } : { enabled: false };
  if (tab === "following") {
    const actorIds = viewer.id
      ? [...viewer.followingIds, viewer.id]
      : viewer.followingIds;
    return { enabled: true, actorIds };
  }
  return { enabled: true };
}

export async function GET(req: Request) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* getProfile, not requireProfile: reading the feed must never create a
     profile row, and a bad token simply reads as a logged-out visitor. */
  const profile = await getProfile(req);
  const viewer = profile ? await resolveViewer(db, profile) : ANON_VIEWER;

  const params = new URL(req.url).searchParams;

  /* A Keep reads one member's own ravens, which is a profile, not a timeline.
     It keeps its posts-only shape. */
  const author = params.get("author");
  if (author) {
    const posts = await loadAuthorPosts(db, viewer, author);
    return json({ posts });
  }

  const rawTab = params.get("tab") ?? "foryou";
  const requested = (FEED_TABS as string[]).includes(rawTab)
    ? (rawTab as FeedTab)
    : "foryou";
  const houseSlug = params.get("house");
  const tab: FeedTab = houseSlug ? "houses" : requested;
  const cursor = decodeFeedCursor(params.get("before"));

  const scope = eventScope(tab, viewer, houseSlug ?? viewer.houseSlug);

  /* Both windows in parallel. Each is at most one page wide, so a feed page
     costs two source queries plus the batched hydration below, whatever the
     mix of cards turns out to be. */
  const [posts, events] = await Promise.all([
    loadFeed(db, viewer, {
      tab,
      ...(cursor.posts.at ? { before: cursor.posts.at } : {}),
      ...(cursor.posts.seen.length ? { exclude: cursor.posts.seen } : {}),
      houseSlug,
    }),
    scope.enabled
      ? loadRealmEvents(db, viewer, {
          before: cursor.events.at,
          exclude: cursor.events.seen,
          kinds: FEED_EVENT_KINDS,
          houseSlug: scope.houseSlug ?? null,
          actorIds: scope.actorIds ?? null,
          limit: PAGE_SIZE,
        })
      : Promise.resolve([]),
  ]);

  /* One query for every actor on the page, never one per card. */
  const actors = await loadEventActors(db, events);

  const composed = composeFeed({
    posts: posts.map(postItem),
    events: events.map((row) => {
      const actor = row.actor_id ? actors[row.actor_id] : undefined;
      const event: FeedEvent = {
        id: row.id,
        kind: row.kind,
        actor_id: row.actor_id,
        subject_type: row.subject_type,
        subject_id: row.subject_id,
        house_slug: row.house_slug,
        payload: row.payload ?? {},
        created_at: row.created_at,
        actor: actor ?? null,
      };
      return eventItem(event);
    }),
    limit: PAGE_SIZE,
    morePosts: posts.length >= PAGE_SIZE,
    moreEvents: events.length >= PAGE_SIZE,
    cursor,
  });

  /* `posts` stays in the response for the surfaces that read ravens alone, the
     House hall among them, so adding events to the Ravenry did not have to
     change every caller at once. */
  const items: FeedItem[] = composed.items;
  return json({
    items,
    posts: items.flatMap((item) => (item.type === "post" ? [item.post] : [])),
    next_cursor: composed.hasMore ? encodeFeedCursor(composed.cursor) : null,
    has_more: composed.hasMore,
  });
}
