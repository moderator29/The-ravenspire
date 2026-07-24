"use client";

import { createClient } from "@/lib/supabase/client";

/* Discovery queries for the Crossroads (Explore). All tables read here are
   public-read, so the anon client serves them directly. Owned by the
   Profiles + Explore surface. */

export interface Cashtag {
  tag: string;
  count: number;
}

export interface PersonHit {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier: string;
  renown: number;
}

export interface HouseStat {
  member_count: number;
  glory: number;
}

/* Cashtags mentioned across ravens in the last week, ranked by how often
   the realm is talking about them. Aggregated client-side from real posts. */
export async function fetchTrendingCashtags(): Promise<Cashtag[]> {
  const db = createClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("posts")
    .select("cashtags")
    .eq("deleted", false)
    .gte("created_at", since)
    .not("cashtags", "is", null)
    .limit(500);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { cashtags: string[] | null }[]) {
    for (const raw of row.cashtags ?? []) {
      const tag = raw.replace(/^\$/, "").toUpperCase().trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

/* The realm's most renowned citizens, a starting point for who to follow.
   Excludes the viewer when their id is known. */
export async function fetchTopPeople(excludeId?: string): Promise<PersonHit[]> {
  const db = createClient();
  const { data } = await db
    .from("profiles")
    .select("id, handle, display_name, avatar_url, house_slug, tier, renown")
    .not("handle", "is", null)
    /* Exclude only the explicitly banned. `is_banned` is null for most members,
       and `.eq(false)` would drop every one of them (NULL never equals false),
       which is why the Crossroads and the follow rails came back empty. */
    .not("is_banned", "is", true)
    .order("renown", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(9);
  const people = (data ?? []) as PersonHit[];
  return people.filter((p) => p.id !== excludeId).slice(0, 8);
}

/* Live member and glory tallies per House, keyed by slug, to enrich the
   static House banners with real numbers. */
export async function fetchHouseStats(): Promise<Record<string, HouseStat>> {
  const db = createClient();
  const { data } = await db.from("houses").select("slug, member_count, glory");
  const map: Record<string, HouseStat> = {};
  for (const h of (data ?? []) as (HouseStat & { slug: string })[]) {
    map[h.slug] = { member_count: h.member_count ?? 0, glory: h.glory ?? 0 };
  }
  return map;
}
