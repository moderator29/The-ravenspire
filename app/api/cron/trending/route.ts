import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { emit } from "@/lib/realm/events";
import { realmDay } from "@/lib/realm/period";
import {
  WINDOW_HOURS,
  trendingNow,
  type TrendingCandidate,
} from "@/lib/feed/trending";

/* What the realm is arguing about (V2 section 8, "Trending discussions").
 *
 * The one queued card that is derived rather than caused: nothing in the
 * product "does" a trending discussion, so this job looks at what the realm
 * already wrote and names the raven the realm is actually on about.
 *
 * The maths, the weights and the floors are in lib/feed/trending.ts with their
 * own tests. This route is the boring half: who is eligible, and when to write.
 *
 * Eligibility, and every clause is doing real work:
 *
 *   visibility = 'public'   a followers-only or House-only raven has a narrower
 *                           audience than this card's, and a realm-wide card
 *                           pointing at it would leak both its existence and
 *                           its author to everyone.
 *   reply_to is null        a reply is not a discussion, the raven it answers
 *                           is. Surfacing the reply would send a reader into
 *                           the middle of a thread.
 *   not deleted             obvious, and still worth stating.
 *   author not banned       a banned member's raven is not the realm's
 *                           discussion.
 *   author not an agent     the Herald's own posts do not get to be what the
 *                           realm is arguing about.
 *
 * One card a day, keyed on the UTC day, made idempotent by the unique index
 * rather than by a read-then-write that a re-run would race. And no card at all
 * on a quiet day: an empty realm shows an empty Ravenry, which is rule 4 and is
 * the whole reason the floors in lib/feed/trending.ts are absolute rather than
 * "whatever is highest". */

export const dynamic = "force-dynamic";

/* Enough to hold every candidate in a realm this size without paging. The
   window is 48 hours and the floor is four replies, so the eligible set is
   small by construction; the limit is a guard, not a page. */
const CANDIDATE_LIMIT = 500;

interface Row extends TrendingCandidate {
  body: string | null;
  author: {
    handle: string | null;
    display_name: string | null;
    is_banned: boolean | null;
    is_agent: boolean | null;
  } | null;
}

/* A card renders from its payload alone, never from a second round trip, so
   the raven's own words travel with the event. Trimmed hard: this is a pointer
   to a discussion, not a copy of it, and a card that reproduces a whole raven
   competes with the raven itself two rows below.

   Denormalised means frozen. If the author edits the raven afterwards the card
   still shows what the realm was arguing about at the time, which is the
   honest thing for a record of a day to do. */
const EXCERPT_CHARS = 160;

function excerpt(body: string | null): string | null {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= EXCERPT_CHARS) return text;
  /* Cut on a word boundary so the tail is not half a word. */
  const cut = text.slice(0, EXCERPT_CHARS);
  const space = cut.lastIndexOf(" ");
  return (space > EXCERPT_CHARS * 0.6 ? cut.slice(0, space) : cut).trimEnd();
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return json({ error: "forbidden" }, 403);
  } else if (process.env.NODE_ENV === "production") {
    return json({ error: "cron secret not configured" }, 503);
  }

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const day = realmDay();
  const subjectId = `trending:${day}`;

  /* Checked before the scan, because the cheapest query is the one never run.
     The unique index is still the guarantee; this is the fast path. */
  const { data: already } = await db
    .from("realm_events")
    .select("id")
    .eq("kind", "discussion.trending")
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (already) return json({ ok: true, skipped: "already written", day });

  const from = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

  const { data, error } = await db
    .from("posts")
    .select(
      "id, author_id, body, created_at, reply_count, like_count, author:profiles!posts_author_id_fkey (handle, display_name, is_banned, is_agent)"
    )
    .eq("deleted", false)
    .eq("visibility", "public")
    .is("reply_to", null)
    .gte("created_at", from)
    .order("reply_count", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (error) return json({ error: "query_failed" }, 500);

  const eligible = ((data ?? []) as unknown as Row[]).filter(
    (row) => row.author && !row.author.is_banned && !row.author.is_agent
  );

  const byId = new Map(eligible.map((row) => [row.id, row]));
  const top = trendingNow(eligible);
  if (!top) {
    return json({
      ok: true,
      skipped: "nothing is trending",
      day,
      candidates: eligible.length,
    });
  }

  /* The same raven leading three days running is one discussion, not three
     cards. The index cannot see this because the day makes each key unique, so
     it is checked here. A race writes at worst one extra card, which the day
     key then caps. */
  const { data: previous } = await db
    .from("realm_events")
    .select("payload")
    .eq("kind", "discussion.trending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastId =
    previous && typeof previous.payload === "object" && previous.payload
      ? (previous.payload as Record<string, unknown>)["post_id"]
      : null;
  if (lastId === top.id) {
    return json({ ok: true, skipped: "same raven as last time", day });
  }

  await emit(db, {
    kind: "discussion.trending",
    /* No actor. The card is the realm noticing, not the author posting, and
       attributing it to the author would read as them announcing themselves.
       The raven's own author line is on the card through post_id. */
    actorId: null,
    subjectType: "post",
    subjectId,
    payload: {
      v: 1,
      day,
      post_id: top.id,
      author_id: top.author_id,
      author_handle: byId.get(top.id)?.author?.handle ?? null,
      author_name: byId.get(top.id)?.author?.display_name ?? null,
      excerpt: excerpt(byId.get(top.id)?.body ?? null),
      replies: top.reply_count,
      reactions: top.like_count,
      window_hours: WINDOW_HOURS,
    },
  });

  return json({
    ok: true,
    day,
    post_id: top.id,
    replies: top.reply_count,
    reactions: top.like_count,
    candidates: eligible.length,
  });
}
