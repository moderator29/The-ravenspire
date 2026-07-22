"use client";

import { createClient } from "@/lib/supabase/client";
import { realmFetch } from "@/lib/auth/api";

/* Helpers owned by the Profiles + Explore surface. Kept separate from
   lib/social/queries.ts so this surface can evolve without touching the
   shared feed queries. */

export interface Viewer {
  id: string;
  handle: string | null;
  onboarded?: boolean;
}

/* The signed-in member, resolved through the token-authenticated /api/me
   route. Returns null when no one is signed in. */
export async function fetchViewer(): Promise<Viewer | null> {
  const res = await realmFetch<{ profile?: Viewer }>("/api/me", {
    method: "POST",
  });
  return res.data?.profile ?? null;
}

/* Whether `viewerId` currently follows `targetId`. The follows table is
   public-read, so the anon client answers this directly. */
export async function fetchIsFollowing(
  viewerId: string,
  targetId: string
): Promise<boolean> {
  const db = createClient();
  const { data } = await db
    .from("follows")
    .select("follower_id")
    .eq("follower_id", viewerId)
    .eq("followee_id", targetId)
    .maybeSingle();
  return Boolean(data);
}

/* People the viewer already follows who also follow this member: the mutual
   connections shown on a Keep ("followed by ... whom you follow"). */
export interface Mutuals {
  count: number;
  preview: { handle: string | null; display_name: string | null; avatar_url: string | null }[];
}
export async function fetchMutuals(
  viewerId: string,
  targetId: string
): Promise<Mutuals> {
  const db = createClient();
  const [{ data: targetFollowers }, { data: myFollowing }] = await Promise.all([
    db.from("follows").select("follower_id").eq("followee_id", targetId),
    db.from("follows").select("followee_id").eq("follower_id", viewerId),
  ]);
  const mine = new Set(
    (myFollowing ?? []).map((r) => (r as { followee_id: string }).followee_id)
  );
  const mutualIds = (targetFollowers ?? [])
    .map((r) => (r as { follower_id: string }).follower_id)
    .filter((id) => mine.has(id));
  if (!mutualIds.length) return { count: 0, preview: [] };
  const { data: profs } = await db
    .from("profiles")
    .select("handle, display_name, avatar_url")
    .in("id", mutualIds)
    .limit(5);
  return { count: mutualIds.length, preview: profs ?? [] };
}

/* Count of Calls this member sealed that landed as hits. */
export async function fetchCrestCount(profileId: string): Promise<number> {
  const db = createClient();
  const { count } = await db
    .from("user_crests")
    .select("crest_slug", { count: "exact", head: true })
    .eq("profile_id", profileId);
  return count ?? 0;
}
