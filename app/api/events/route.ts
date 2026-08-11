import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getProfile, json } from "@/lib/auth/server";
import { EVENT_KINDS, type RealmEventRow } from "@/lib/realm/events";

/* The Realm Event Stream (V2 sections 4 and 6.1).

   The merged, paginated feed of everything that actually happened in the realm:
   Calls sealed and resolved, crests earned, duels opened, quests completed,
   Houses overtaking each other, seasons turning. The Ravenry renders this
   alongside posts, which is the change that turns a Twitter clone sitting next
   to a Bloomberg terminal into one product.

   Real data only. When nothing has happened yet, this returns an empty list and
   the surface says so honestly.

   AUDIENCE. Every row carries who it is for, and this route is the only place
   the narrower audiences are resolved, because it holds the service-role client
   and the database RLS policy exposes only audience = 'realm' to a browser.
   Applying it here rather than in SQL keeps one readable rule:

     realm      everyone, signed in or not
     house      members of the actor's House
     followers  the actor's followers, plus the actor
     actor      the actor alone

   Blocks and mutes are deliberately not applied here yet. The feed applies them
   in lib/social/queries.ts, which owns that policy, and duplicating it would
   mean two places to keep in step. */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/* Over-fetch, because audience filtering happens after the query and would
   otherwise return short pages. */
const FETCH_MULTIPLIER = 3;

export async function GET(req: NextRequest) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const url = new URL(req.url);
  const profile = await getProfile(req);

  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  /* Keyset pagination on created_at. An offset would skip or repeat rows as new
     events land, which on a live stream is guaranteed rather than unlikely. */
  const before = url.searchParams.get("before");

  /* Optional narrowing, all validated against the known sets so a caller cannot
     inject a filter. */
  const kindParam = url.searchParams.get("kind");
  const kinds = kindParam
    ? kindParam
        .split(",")
        .map((k) => k.trim())
        .filter((k) => (EVENT_KINDS as readonly string[]).includes(k))
    : [];
  const houseParam = url.searchParams.get("house");
  const actorParam = url.searchParams.get("actor");

  let q = db
    .from("realm_events")
    .select("id, kind, actor_id, subject_type, subject_id, house_slug, payload, audience, created_at")
    .order("created_at", { ascending: false })
    .limit(limit * FETCH_MULTIPLIER);

  if (kinds.length > 0) q = q.in("kind", kinds);
  if (houseParam) q = q.eq("house_slug", houseParam);
  if (actorParam) q = q.eq("actor_id", actorParam);
  if (before) {
    const cursor = new Date(before);
    if (!Number.isNaN(cursor.getTime())) q = q.lt("created_at", cursor.toISOString());
  }

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []) as RealmEventRow[];

  /* Who the viewer follows, fetched once and only when there is a
     followers-scoped row in the page that they do not already own. */
  let following: Set<string> | null = null;
  const needsFollows =
    !!profile &&
    rows.some((r) => r.audience === "followers" && r.actor_id !== profile.id);
  if (needsFollows && profile) {
    const { data: follows } = await db
      .from("follows")
      .select("followee_id")
      .eq("follower_id", profile.id);
    following = new Set((follows ?? []).map((f) => f.followee_id as string));
  }

  const visible = rows.filter((row) => {
    if (row.audience === "realm") return true;
    if (!profile) return false;
    if (row.actor_id === profile.id) return true;
    if (row.audience === "actor") return false;
    if (row.audience === "house") {
      return !!profile.house_slug && row.house_slug === profile.house_slug;
    }
    if (row.audience === "followers") {
      return !!row.actor_id && !!following?.has(row.actor_id);
    }
    return false;
  });

  const page = visible.slice(0, limit);

  /* Hydrate actors in one query so a card can render a name and a sigil without
     a round trip per row. */
  const actorIds = [...new Set(page.map((r) => r.actor_id).filter(Boolean))] as string[];
  const actors: Record<string, unknown> = {};
  if (actorIds.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, handle, display_name, avatar_url, house_slug, tier, is_agent, is_verified")
      .in("id", actorIds);
    for (const p of profiles ?? []) actors[p.id as string] = p;
  }

  /* The cursor is the last row we actually looked at, not the last one we
     returned, so audience-filtered rows are not walked again on the next page. */
  const lastSeen = rows[rows.length - 1];
  const more = rows.length >= limit * FETCH_MULTIPLIER;

  return json({
    events: page,
    actors,
    next_cursor: more && lastSeen ? lastSeen.created_at : null,
  });
}
