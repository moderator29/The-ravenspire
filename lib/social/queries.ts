"use client";

import { createClient } from "@/lib/supabase/client";
import { realmFetch } from "@/lib/auth/api";
import type { Post, PublicProfile } from "@/lib/social/types";

/* Reads for the social surface.
 *
 * C1: every read of a raven now goes through a token-authenticated server
 * route (/api/feed, /api/posts/[id]) rather than the browser's anon key. The
 * anon key ships inside the bundle, so audience selection built here was never
 * enforcement; the RLS policies now admit public ravens only and the server
 * decides who sees the rest. See lib/social/feed-server.ts.
 *
 * The reads that remain on the anon client below (profiles, follows, crests)
 * are genuinely public tables with no audience of their own. */

export type FeedTab = "foryou" | "following" | "houses" | "signal" | "latest";

/* One page of the Ravenry. Matches PAGE_SIZE in lib/social/feed-server.ts;
   the feed uses it to tell a full page from the last one. */
export const FEED_PAGE_SIZE = 30;

export async function fetchFeed(opts: {
  tab: FeedTab;
  before?: string;
  /* The House hall passes the slug of the House being read. Everything else
     about the reader (id, handle, own House, follow graph) is resolved from
     the bearer token server-side and is deliberately not accepted here. */
  houseSlug?: string | null;
}): Promise<Post[]> {
  const params = new URLSearchParams({ tab: opts.tab });
  if (opts.before) params.set("before", opts.before);
  if (opts.houseSlug) params.set("house", opts.houseSlug);
  const res = await realmFetch<{ posts?: Post[] }>(`/api/feed?${params}`);
  return res.data?.posts ?? [];
}

export async function fetchPost(id: string): Promise<Post | null> {
  const res = await realmFetch<{ post?: Post }>(
    `/api/posts/${encodeURIComponent(id)}`
  );
  return res.data?.post ?? null;
}

export async function fetchProfilePosts(profileId: string): Promise<Post[]> {
  const res = await realmFetch<{ posts?: Post[] }>(
    `/api/feed?author=${encodeURIComponent(profileId)}`
  );
  return res.data?.posts ?? [];
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

/* Realtime nudge only: a "new ravens have arrived" ping, never content. Under
   the tightened RLS the anon channel sees public inserts, which is all this
   needs to know. */
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
