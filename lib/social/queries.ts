"use client";

import { createClient } from "@/lib/supabase/client";
import { realmFetch } from "@/lib/auth/api";
import { fetchViewerId } from "@/lib/social/use-viewer";
import type { Post, Comment, PublicProfile } from "@/lib/social/types";

const AUTHOR_SELECT =
  "author:profiles!posts_author_id_fkey (handle, display_name, avatar_url, house_slug, tier, is_agent)";
const POST_SELECT = `id, author_id, kind, body, media, cashtags, call, poll, house_slug, visibility, mentions, like_count, reply_count, repost_count, view_count, created_at, ${AUTHOR_SELECT}`;
/* Same shape plus `deleted`, so re-ravens of removed posts can be dropped. */
const REPOST_POST_SELECT = `id, author_id, kind, body, media, cashtags, call, poll, house_slug, visibility, mentions, like_count, reply_count, repost_count, view_count, created_at, deleted, ${AUTHOR_SELECT}`;

export type FeedTab = "foryou" | "following" | "houses" | "signal" | "latest";

/* The reader, as far as audience gating is concerned. Undefined/empty fields
   mean a logged-out visitor, who may only ever see public ravens. */
export interface FeedViewer {
  viewerId?: string | null;
  viewerHandle?: string | null;
  houseSlug?: string | null;
  followingIds?: string[];
}

/* Audience fields ride alongside a Post but are not part of its public type. */
type Gated = { author_id: string; house_slug: string | null } & {
  visibility?: string | null;
  mentions?: string[] | null;
};

/* Whether this reader is allowed to see a raven of the given visibility.
   Public reaches everyone; the author always sees their own; the rest reach
   only the eligible circle. This mirrors the SQL `.or` filter below and also
   guards paths (re-ravens) the SQL filter cannot reach. */
function canView(p: Gated, v: FeedViewer): boolean {
  const vis = p.visibility ?? "public";
  if (vis === "public") return true;
  if (v.viewerId && p.author_id === v.viewerId) return true;
  switch (vis) {
    case "followers":
      return Boolean(v.followingIds?.includes(p.author_id));
    case "house":
      return Boolean(v.houseSlug && p.house_slug === v.houseSlug);
    case "mentions":
      return Boolean(
        v.viewerHandle && p.mentions?.includes(v.viewerHandle.toLowerCase())
      );
    default:
      return false;
  }
}

/* PostgREST `.or` clause that lets the database drop ravens this reader may
   not see, keeping restricted posts off the wire. Public is always allowed. */
function visibilityOrClause(v: FeedViewer): string {
  const parts = ["visibility.eq.public"];
  if (v.viewerId) parts.push(`author_id.eq.${v.viewerId}`);
  if (v.followingIds?.length)
    parts.push(
      `and(visibility.eq.followers,author_id.in.(${v.followingIds.join(",")}))`
    );
  if (v.houseSlug)
    parts.push(`and(visibility.eq.house,house_slug.eq.${v.houseSlug})`);
  if (v.viewerHandle)
    parts.push(
      `and(visibility.eq.mentions,mentions.cs.{${v.viewerHandle.toLowerCase()}})`
    );
  return parts.join(",");
}

/* Stamp each raven with the signed-in reader's own reaction state so a card
   opens showing its true like / repost / bookmark, and a returning member can
   never re-like or re-repost the same raven. Reactions and reposts are
   public-read, so they answer directly through the browser client; bookmarks
   are not client-readable (RLS), so their flags come through the token-auth
   /api/bookmarks probe. A logged-out reader has no reactions, so the posts are
   returned unchanged. */
async function attachViewerFlags(posts: Post[]): Promise<Post[]> {
  if (posts.length === 0) return posts;
  const viewerId = await fetchViewerId();
  if (!viewerId) return posts;

  const ids = [...new Set(posts.map((p) => p.id))];
  const db = createClient();

  const [reactionsRes, repostsRes, bookmarkRes] = await Promise.all([
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
    realmFetch<{ bookmarked?: string[] }>(
      `/api/bookmarks?ids=${encodeURIComponent(ids.join(","))}`
    ),
  ]);

  const liked = new Set(
    (reactionsRes.data ?? []).map((r) => (r as { subject_id: string }).subject_id)
  );
  const reposted = new Set(
    (repostsRes.data ?? []).map((r) => (r as { post_id: string }).post_id)
  );
  const bookmarked = new Set(bookmarkRes.data?.bookmarked ?? []);

  return posts.map((p) => ({
    ...p,
    viewer_liked: liked.has(p.id),
    viewer_reposted: reposted.has(p.id),
    viewer_bookmarked: bookmarked.has(p.id),
  }));
}

/* Tabs where a re-raven earns distribution alongside original posts. */
const REPOST_TABS: FeedTab[] = ["foryou", "latest", "following"];

function feedTime(p: Post): number {
  return Date.parse(p.effectiveTime ?? p.created_at);
}

export async function fetchFeed(opts: {
  tab: FeedTab;
  before?: string;
  followingIds?: string[];
  houseSlug?: string | null;
  viewerId?: string | null;
  viewerHandle?: string | null;
}): Promise<Post[]> {
  const db = createClient();
  const viewer: FeedViewer = {
    viewerId: opts.viewerId ?? null,
    viewerHandle: opts.viewerHandle ?? null,
    houseSlug: opts.houseSlug ?? null,
    followingIds: opts.followingIds ?? [],
  };
  /* Signal ranks by VERIFIED OUTCOME, not recency, so it pulls a wider window
     to rank across (hits lead, then live calls, misses sink). Other tabs read
     a single page ordered by recency. */
  const isSignal = opts.tab === "signal";
  let q = db
    .from("posts")
    .select(POST_SELECT)
    .eq("deleted", false)
    /* Only ravens whose audience includes this reader. */
    .or(visibilityOrClause(viewer))
    .order("created_at", { ascending: false })
    .limit(isSignal ? 90 : 30);
  if (opts.before) q = q.lt("created_at", opts.before);
  if (isSignal) q = q.eq("kind", "call");
  if (opts.tab === "houses" && opts.houseSlug)
    q = q.eq("house_slug", opts.houseSlug);
  if (opts.tab === "following") {
    if (!opts.followingIds?.length) return [];
    q = q.in("author_id", opts.followingIds);
  }
  const { data } = await q;
  const posts: Post[] = ((data ?? []) as unknown as (Post & Gated)[])
    .filter((p) => canView(p, viewer))
    .map((p) => ({
      ...p,
      effectiveTime: p.created_at,
    }));

  /* Signal = top by verified outcome. Rank hits first (proven right), then
     still-open calls (live claims), then misses; ties break on recency. This
     is the honest ranking the brief asks for, replacing the old recency-only
     order that mixed misses and unsettled calls in equally. */
  if (isSignal) {
    const rank = (p: Post): number => {
      const v = p.call?.verdict;
      if (v === "hit") return 0;
      if (v === "open" || v == null) return 1;
      return 2; // miss
    };
    const ranked = posts
      .sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return feedTime(b) - feedTime(a);
      })
      .slice(0, 30);
    return attachViewerFlags(ranked);
  }

  if (!REPOST_TABS.includes(opts.tab)) return attachViewerFlags(posts);

  const reposts = await fetchReposts({
    tab: opts.tab,
    before: opts.before,
    followingIds: opts.followingIds,
    viewer,
  });
  /* Merge and order by feed time so re-ravens surface at their re-raven
     moment; cap to a single page's worth. */
  const merged = [...posts, ...reposts]
    .sort((a, b) => feedTime(b) - feedTime(a))
    .slice(0, 30);
  return attachViewerFlags(merged);
}

/* Re-ravens as feed items: the original post and author, tagged with who
   re-ravened it and when. Ordered newest re-raven first. */
export async function fetchReposts(opts: {
  tab?: FeedTab;
  before?: string;
  followingIds?: string[];
  viewer?: FeedViewer;
}): Promise<Post[]> {
  const db = createClient();
  let q = db
    .from("reposts")
    .select(
      `created_at, quote, reposter:profiles!reposts_profile_id_fkey (handle, display_name), post:posts!reposts_post_id_fkey (${REPOST_POST_SELECT})`
    )
    .order("created_at", { ascending: false })
    .limit(30);
  if (opts.before) q = q.lt("created_at", opts.before);
  if (opts.tab === "following") {
    if (!opts.followingIds?.length) return [];
    q = q.in("profile_id", opts.followingIds);
  }
  const { data } = await q;

  type RepostRow = {
    created_at: string;
    quote: string | null;
    reposter: { handle: string | null; display_name: string | null } | null;
    post: (Post & { deleted?: boolean }) | null;
  };

  const viewer = opts.viewer ?? {};
  return ((data ?? []) as unknown as RepostRow[])
    .filter((r): r is RepostRow & { post: Post & { deleted?: boolean } } =>
      Boolean(r.post) && !r.post!.deleted
    )
    /* A re-raven cannot widen a raven's audience: the original post's
       visibility still governs who may see it. */
    .filter((r) => canView(r.post as unknown as Gated, viewer))
    .map((r) => {
      const { deleted: _deleted, ...post } = r.post;
      return {
        ...(post as Post),
        repostedBy: r.reposter
          ? {
              handle: r.reposter.handle,
              display_name: r.reposter.display_name,
            }
          : undefined,
        quote: r.quote,
        effectiveTime: r.created_at,
      };
    });
}

export async function fetchPost(id: string): Promise<Post | null> {
  const db = createClient();
  const { data } = await db
    .from("posts")
    .select(POST_SELECT)
    .eq("id", id)
    .maybeSingle();
  const post = (data as unknown as Post) ?? null;
  if (!post) return null;
  const [withFlags] = await attachViewerFlags([post]);
  return withFlags;
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const db = createClient();
  const { data } = await db
    .from("comments")
    .select(
      "id, post_id, parent_id, body, like_count, created_at, author:profiles!comments_author_id_fkey (handle, display_name, avatar_url, house_slug, tier, is_agent)"
    )
    .eq("post_id", postId)
    .eq("deleted", false)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []) as unknown as Comment[];
}

export async function fetchProfile(handle: string): Promise<PublicProfile | null> {
  const db = createClient();
  const { data } = await db
    .from("profiles")
    .select(
      "id, handle, display_name, avatar_url, banner_url, bio, links, house_slug, tier, renown, points, glory, x_handle, is_agent, created_at"
    )
    .ilike("handle", handle)
    .maybeSingle();
  return (data as unknown as PublicProfile) ?? null;
}

export async function fetchProfilePosts(profileId: string): Promise<Post[]> {
  const db = createClient();
  const { data } = await db
    .from("posts")
    .select(POST_SELECT)
    .eq("author_id", profileId)
    .eq("deleted", false)
    .order("created_at", { ascending: false })
    .limit(50);
  return attachViewerFlags((data ?? []) as unknown as Post[]);
}

export async function fetchFollowCounts(profileId: string) {
  const db = createClient();
  const [followers, following] = await Promise.all([
    db
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("followee_id", profileId),
    db
      .from("follows")
      .select("followee_id", { count: "exact", head: true })
      .eq("follower_id", profileId),
  ]);
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

export async function fetchFollowingIds(profileId: string): Promise<string[]> {
  const db = createClient();
  const { data } = await db
    .from("follows")
    .select("followee_id")
    .eq("follower_id", profileId)
    .limit(1000);
  return (data ?? []).map((r) => r.followee_id as string);
}

export async function fetchUserCrests(profileId: string): Promise<string[]> {
  const db = createClient();
  const { data } = await db
    .from("user_crests")
    .select("crest_slug")
    .eq("profile_id", profileId);
  return (data ?? []).map((r) => r.crest_slug as string);
}

export function subscribeToFeed(onInsert: () => void) {
  const db = createClient();
  const channel = db
    .channel("ravenry")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "posts" },
      onInsert
    )
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}
