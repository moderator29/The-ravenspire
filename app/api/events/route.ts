import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getProfile, json } from "@/lib/auth/server";
import { ANON_VIEWER, resolveViewer } from "@/lib/social/feed-server";
import { loadEventActors, loadRealmEvents } from "@/lib/realm/feed-events";
import { EVENT_KINDS } from "@/lib/realm/events";

/* The Realm Event Stream (V2 sections 4 and 6.1).

   The merged, paginated feed of everything that actually happened in the realm:
   Calls sealed and resolved, crests earned, duels opened, quests completed,
   Houses overtaking each other, seasons turning.

   The Ravenry no longer reads this route: /api/feed interleaves the same spine
   with ravens through lib/feed/compose.ts, which is what turns a Twitter clone
   sitting next to a Bloomberg terminal into one product. This stays as the
   single-source view of the spine, for a House hall, an actor's own history,
   or anything that wants events without ravens around them.

   Real data only. When nothing has happened yet, this returns an empty list and
   the surface says so honestly.

   AUDIENCE. Every row carries who it is for, and the decision now lives in
   lib/realm/feed-events.ts so this route and the Ravenry cannot drift apart.

   Blocks and mutes are deliberately not applied here. The feed applies them in
   lib/social/queries.ts, which owns that policy, and duplicating it would mean
   two places to keep in step. */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const url = new URL(req.url);
  const profile = await getProfile(req);
  const viewer = profile ? await resolveViewer(db, profile) : ANON_VIEWER;

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
  const actor = url.searchParams.get("actor");

  const events = await loadRealmEvents(db, viewer, {
    before,
    kinds,
    houseSlug: url.searchParams.get("house"),
    actorIds: actor ? [actor] : null,
    limit,
  });

  const actors = await loadEventActors(db, events);

  /* The cursor is the oldest row actually returned. Taking it from the wider
     over-fetched window instead, as this route once did, silently skipped every
     visible row past the page boundary. */
  const last = events[events.length - 1];

  return json({
    events,
    actors,
    next_cursor: events.length >= limit && last ? last.created_at : null,
  });
}
