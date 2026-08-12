import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import type { SessionProfile } from "@/lib/auth/server";
import type { Post } from "@/lib/social/types";
import { postFeedId } from "@/lib/feed/types";

/* C1: the single place where a raven's audience is decided.
 *
 * Audience selection used to be a client-built PostgREST filter under the anon
 * key, which meant it was advice rather than enforcement. The posts and
 * comments RLS policies now admit PUBLIC ravens only (see migration
 * 20260811120000), and every read of a restricted raven comes through here,
 * running with the service role behind a token-authenticated server route.
 *
 * Nothing in this module trusts a value that came off the wire: the viewer is
 * resolved from the verified Privy profile, and the follow graph is read from
 * the database, never accepted from the caller. */

type Db = NonNullable<ReturnType<typeof adminClient>>;

export type FeedTab = "foryou" | "following" | "houses" | "signal" | "latest";

export const FEED_TABS: FeedTab[] = [
  "foryou",
  "following",
  "houses",
  "signal",
  "latest",
];

/* One page of the Ravenry. Kept in one place so the route, the client and the
   "done" check in the feed all agree on what a full page looks like. */
export const PAGE_SIZE = 30;
/* Signal ranks by verified outcome rather than recency, so it pulls a wider
   window to rank across before trimming back to a page. */
const SIGNAL_WINDOW = 90;

const AUTHOR_SELECT =
  "author:profiles!posts_author_id_fkey (handle, display_name, avatar_url, house_slug, tier, is_agent)";
const POST_COLUMNS =
  "id, author_id, kind, body, media, cashtags, call, poll, house_slug, visibility, mentions, like_count, reply_count, repost_count, view_count, created_at";
const POST_SELECT = `${POST_COLUMNS}, ${AUTHOR_SELECT}`;
/* Same shape plus `deleted`, so re-ravens of removed ravens can be dropped. */
const REPOST_POST_SELECT = `${POST_COLUMNS}, deleted, ${AUTHOR_SELECT}`;

/* The reader, as far as audience gating is concerned. A null id is a
   logged-out visitor, who may only ever see public ravens. */
export interface FeedViewer {
  id: string | null;
  handle: string | null;
  houseSlug: string | null;
  /* Everyone this viewer follows. Read from the database, never from the
     client, because it decides who reaches the "followers" circle. */
  followingIds: string[];
}

export const ANON_VIEWER: FeedViewer = {
  id: null,
  handle: null,
  houseSlug: null,
  followingIds: [],
};

/* Audience fields ride alongside a Post but are not part of its public type. */
type Gated = {
  author_id: string;
  house_slug: string | null;
  visibility?: string | null;
  mentions?: string[] | null;
};

/* Turn a verified profile into a viewer, pulling the follow graph once. */
export async function resolveViewer(
  db: Db,
  profile: SessionProfile | null
): Promise<FeedViewer> {
  if (!profile) return ANON_VIEWER;
  const { data } = await db
    .from("follows")
    .select("followee_id")
    .eq("follower_id", profile.id)
    .limit(1000);
  return {
    id: profile.id,
    handle: profile.handle,
    houseSlug: profile.house_slug,
    followingIds: (data ?? []).map((r) => r.followee_id as string),
  };
}

/* Whether this reader is allowed to see a raven of the given visibility.
   Public reaches everyone; the author always sees their own; the rest reach
   only their circle. This is the authoritative decision. Any SQL narrowing
   below it is an optimisation, never the gate. */
export function canView(p: Gated, v: FeedViewer): boolean {
  const vis = p.visibility ?? "public";
  if (vis === "public") return true;
  if (v.id && p.author_id === v.id) return true;
  switch (vis) {
    case "followers":
      return v.followingIds.includes(p.author_id);
    case "house":
      return Boolean(v.houseSlug && p.house_slug === v.houseSlug);
    case "mentions":
      return Boolean(v.handle && p.mentions?.includes(v.handle.toLowerCase()));
    default:
      /* An unknown audience is a closed one. */
      return false;
  }
}

/* PostgREST reserves , ( ) and . inside an .or() string, so only values that
   cannot carry them are ever interpolated. Handles are [a-z0-9_] and ids are
   uuids by schema; these guards make that a property of this file rather than
   an assumption about a table three layers away. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE_RE = /^[a-z0-9_]{1,30}$/;

/* SQL narrowing that keeps ravens this reader may not see off the wire. Public
   is always allowed; every other branch mirrors canView above. */
function visibilityOrClause(v: FeedViewer): string {
  const parts = ["visibility.eq.public"];
  const id = v.id && UUID_RE.test(v.id) ? v.id : null;
  const following = v.followingIds.filter((f) => UUID_RE.test(f));
  const handle =
    v.handle && HANDLE_RE.test(v.handle.toLowerCase())
      ? v.handle.toLowerCase()
      : null;
  const house =
    v.houseSlug && HANDLE_RE.test(v.houseSlug) ? v.houseSlug : null;

  if (id) parts.push(`author_id.eq.${id}`);
  if (following.length)
    parts.push(
      `and(visibility.eq.followers,author_id.in.(${following.join(",")}))`
    );
  if (house) parts.push(`and(visibility.eq.house,house_slug.eq.${house})`);
  if (handle) parts.push(`and(visibility.eq.mentions,mentions.cs.{${handle}})`);
  return parts.join(",");
}

/* Stamp each raven with the reader's own reaction state so a card opens
   showing its true like / re-raven / bookmark, and a returning member can
   never re-like the same raven. Resolved server-side in three queries rather
   than the three browser round trips this used to cost. */
async function attachViewerFlags(
  db: Db,
  posts: Post[],
  viewerId: string | null
): Promise<Post[]> {
  if (!viewerId || posts.length === 0) return posts;
  const ids = [...new Set(posts.map((p) => p.id))];

  const [reactions, reposts, bookmarks] = await Promise.all([
    db
      .from("reactions")
      .select("subject_id")
      .eq("profile_id", viewerId)
      .eq("subject_type", "post")
      .in("subject_id", ids),
    db
      .from("reposts")
      .select("post_id")
      .eq("profile_id", viewerId)
      .in("post_id", ids),
    db
      .from("bookmarks")
      .select("post_id")
      .eq("profile_id", viewerId)
      .in("post_id", ids),
  ]);

  const liked = new Set(
    (reactions.data ?? []).map((r) => r.subject_id as string)
  );
  const reposted = new Set((reposts.data ?? []).map((r) => r.post_id as string));
  const bookmarked = new Set(
    (bookmarks.data ?? []).map((r) => r.post_id as string)
  );

  return posts.map((p) => ({
    ...p,
    viewer_liked: liked.has(p.id),
    viewer_reposted: reposted.has(p.id),
    viewer_bookmarked: bookmarked.has(p.id),
  }));
}

/* Tabs where a re-raven earns distribution alongside original ravens. */
const REPOST_TABS: FeedTab[] = ["foryou", "latest", "following"];

function feedTime(p: Post): number {
  return Date.parse(p.effectiveTime ?? p.created_at);
}

/* Re-ravens as feed items: the original raven and author, tagged with who
   re-ravened it and when. A re-raven can never widen a raven's audience. */
async function loadReposts(
  db: Db,
  viewer: FeedViewer,
  opts: { tab: FeedTab; before?: string; inclusive?: boolean }
): Promise<Post[]> {
  let q = db
    .from("reposts")
    .select(
      `created_at, quote, reposter:profiles!reposts_profile_id_fkey (handle, display_name), post:posts!reposts_post_id_fkey (${REPOST_POST_SELECT})`
    )
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (opts.before)
    q = opts.inclusive
      ? q.lte("created_at", opts.before)
      : q.lt("created_at", opts.before);
  if (opts.tab === "following") {
    if (!viewer.followingIds.length) return [];
    q = q.in("profile_id", viewer.followingIds);
  }
  const { data } = await q;

  type RepostRow = {
    created_at: string;
    quote: string | null;
    reposter: { handle: string | null; display_name: string | null } | null;
    post: (Post & Gated & { deleted?: boolean }) | null;
  };

  return ((data ?? []) as unknown as RepostRow[])
    .filter((r) => Boolean(r.post) && !r.post!.deleted)
    .filter((r) => canView(r.post as Gated, viewer))
    .map((r) => {
      const { deleted: _deleted, ...post } = r.post as Post & {
        deleted?: boolean;
      };
      return {
        ...(post as Post),
        repostedBy: r.reposter
          ? { handle: r.reposter.handle, display_name: r.reposter.display_name }
          : undefined,
        quote: r.quote,
        effectiveTime: r.created_at,
      };
    });
}

/* One page of the Ravenry for this viewer, audience already applied.
 *
 * `before` is the keyset cursor. On its own it means strictly older; paired
 * with `exclude` it means the instant itself is read again with those feed ids
 * dropped, so a page boundary landing inside a group of rows stamped the same
 * instant does not lose the rest of the group. lib/feed/compose.ts is what
 * builds the pair. */
export async function loadFeed(
  db: Db,
  viewer: FeedViewer,
  opts: {
    tab: FeedTab;
    before?: string;
    exclude?: readonly string[];
    houseSlug?: string | null;
  }
): Promise<Post[]> {
  const isSignal = opts.tab === "signal";
  /* The House hall passes its own slug (any House page is readable); every
     other tab reads the viewer's own House. */
  const houseSlug =
    opts.tab === "houses" ? (opts.houseSlug ?? viewer.houseSlug) : null;

  if (opts.tab === "houses" && !houseSlug) return [];
  if (opts.tab === "following" && !viewer.followingIds.length) return [];

  const exclude = new Set(opts.exclude ?? []);
  let q = db
    .from("posts")
    .select(POST_SELECT)
    .eq("deleted", false)
    .or(visibilityOrClause(viewer))
    .order("created_at", { ascending: false })
    .limit(isSignal ? SIGNAL_WINDOW : PAGE_SIZE);
  if (opts.before)
    q =
      exclude.size > 0
        ? q.lte("created_at", opts.before)
        : q.lt("created_at", opts.before);
  if (isSignal) q = q.eq("kind", "call");
  if (houseSlug) q = q.eq("house_slug", houseSlug);
  if (opts.tab === "following") q = q.in("author_id", viewer.followingIds);

  const { data } = await q;
  const posts: Post[] = ((data ?? []) as unknown as (Post & Gated)[])
    .filter((p) => canView(p, viewer))
    .map((p) => ({ ...p, effectiveTime: p.created_at }))
    .filter((p) => !exclude.has(postFeedId(p)));

  /* Signal = top by verified outcome. Hits lead (proven right), then still
     open calls (live claims), then misses; ties break on recency. */
  if (isSignal) {
    const rank = (p: Post): number => {
      const v = p.call?.verdict;
      if (v === "hit") return 0;
      if (v === "open" || v == null) return 1;
      return 2;
    };
    const ranked = posts
      .sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return feedTime(b) - feedTime(a);
      })
      .slice(0, PAGE_SIZE);
    return attachViewerFlags(db, ranked, viewer.id);
  }

  if (!REPOST_TABS.includes(opts.tab))
    return attachViewerFlags(db, posts, viewer.id);

  const reposts = (
    await loadReposts(db, viewer, {
      tab: opts.tab,
      before: opts.before,
      inclusive: exclude.size > 0,
    })
  ).filter((p) => !exclude.has(postFeedId(p)));
  /* Merge and order by feed time so re-ravens surface at their re-raven
     moment; cap to a single page's worth. */
  const merged = [...posts, ...reposts]
    .sort((a, b) => feedTime(b) - feedTime(a))
    .slice(0, PAGE_SIZE);
  return attachViewerFlags(db, merged, viewer.id);
}

/* One member's ravens for their Keep. The author sees their own restricted
   ravens; everyone else sees only what their audience admits them to. */
export async function loadAuthorPosts(
  db: Db,
  viewer: FeedViewer,
  authorId: string,
  limit = 50
): Promise<Post[]> {
  const { data } = await db
    .from("posts")
    .select(POST_SELECT)
    .eq("author_id", authorId)
    .eq("deleted", false)
    .or(visibilityOrClause(viewer))
    .order("created_at", { ascending: false })
    .limit(limit);
  const posts = ((data ?? []) as unknown as (Post & Gated)[]).filter((p) =>
    canView(p, viewer)
  );
  return attachViewerFlags(db, posts as Post[], viewer.id);
}

/* A single raven, or null when it does not exist, was removed, or this reader
   is not in its audience. Not-in-audience deliberately reads as "not found":
   the existence of a restricted raven is itself part of what is restricted. */
export async function loadPost(
  db: Db,
  viewer: FeedViewer,
  id: string
): Promise<Post | null> {
  const { data } = await db
    .from("posts")
    .select(`${POST_SELECT}, deleted`)
    .eq("id", id)
    .maybeSingle();
  const row = (data as unknown as (Post & Gated & { deleted?: boolean })) ?? null;
  if (!row || row.deleted) return null;
  if (!canView(row, viewer)) return null;
  const { deleted: _deleted, ...post } = row;
  const [withFlags] = await attachViewerFlags(db, [post as Post], viewer.id);
  return withFlags;
}

/* Whether this reader may read the thread hanging off a raven. Comments
   inherit their raven's audience, so this is the gate /api/comments uses. */
export async function canViewPost(
  db: Db,
  viewer: FeedViewer,
  postId: string
): Promise<boolean> {
  const { data } = await db
    .from("posts")
    .select("author_id, house_slug, visibility, mentions, deleted")
    .eq("id", postId)
    .maybeSingle();
  const row = (data as (Gated & { deleted?: boolean }) | null) ?? null;
  if (!row || row.deleted) return false;
  return canView(row, viewer);
}
