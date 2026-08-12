import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { settlementPrice } from "@/lib/calls/resolvers/price";
import { bucketKey, peerBaselineFor } from "@/lib/calls/peers";
import { normalizeCall, priceSubjectFor, type CallData } from "@/lib/calls/types";
import { HORIZON_DAYS, MIN_PEERS } from "@/lib/calls/scoring";
import { shrunkAccuracy, streaks } from "@/lib/calls/analytics";

/* One Call, with everything a spectator needs to judge it.

   The realm had no Call detail anywhere: a Call was a card in a list that
   linked to the raven it was attached to, so the difficulty the engine froze,
   the confidence the member staked, the crowd that disagreed and the score it
   finally settled at were all computed and none of them could be read.

   Everything below is real or absent. There is no fallback difficulty, no
   assumed price and no invented record: a Call whose subject cannot be priced
   right now simply carries no live line, and a caller with nothing settled has
   an empty record rather than a flattering one. */

export const dynamic = "force-dynamic";

const AUTHOR_SELECT =
  "author:profiles!posts_author_id_fkey (handle, display_name, avatar_url, house_slug, tier, is_agent)";

const DAY_MS = 24 * 60 * 60 * 1000;

interface Row {
  id: string;
  author_id: string;
  body: string;
  call: CallData | null;
  created_at: string;
  like_count: number;
  reply_count: number;
  view_count: number;
  house_slug: string | null;
  author: {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    house_slug: string | null;
    tier: string;
  } | null;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { id } = await ctx.params;
  if (!id) return json({ error: "bad request" }, 400);

  /* Who is reading, resolved from the verified bearer token rather than from
     anything the browser claims about itself. The page is told whether the
     viewer is the caller, and nothing else about them. */
  const viewer = await getProfile(req);

  const { data, error } = await db
    .from("posts")
    .select(
      `id, author_id, body, call, created_at, like_count, reply_count, view_count, house_slug, ${AUTHOR_SELECT}`
    )
    .eq("id", id)
    .eq("kind", "call")
    .eq("deleted", false)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  const row = data as unknown as Row | null;
  if (!row) return json({ error: "not found" }, 404);

  const call = normalizeCall(row.call);
  if (!call) return json({ error: "not found" }, 404);

  const days = HORIZON_DAYS[call.timeframe ?? "24h"] ?? 1;
  const closesAt = Date.parse(row.created_at) + days * DAY_MS;
  const open = call.verdict === "open";

  /* The live line (section 9.7). Only for an open price Call, and only when the
     realm can get a print it would actually settle against: settlementPrice is
     the same function the verdict job uses, liquidity floor included, so the
     number a spectator watches is the number that will decide it. */
  let live: { price: number; at: string } | null = null;
  if (open && call.resolver !== "internal") {
    const subject = priceSubjectFor(call);
    if (subject) {
      const price = await settlementPrice(subject);
      if (price !== null) live = { price, at: new Date().toISOString() };
    }
  }

  /* Community consensus. Two different numbers, kept apart deliberately.

     `independent` is the scoring number from lib/calls/peers.ts: it drops the
     caller's own Calls and every House-mate's, because a House is a pre-built
     collusion ring, and it is what decides whether this Call is scored against
     the crowd or against the volatility model.

     `callers` is everyone else who staked the same claim in the same window,
     House-mates included, because for a reader the question is who agreed and
     how strongly, not who is eligible to be a baseline. */
  const peers = await peerBaselineFor(db, {
    call,
    authorId: row.author_id,
    houseSlug: row.house_slug,
    createdAt: row.created_at,
  });
  const meanConfidence =
    peers.confidences.length > 0
      ? peers.confidences.reduce((a, b) => a + b, 0) / peers.confidences.length
      : null;

  const key = bucketKey(call);
  const windowMs = days * DAY_MS;
  const from = new Date(Date.parse(row.created_at) - windowMs / 2).toISOString();
  const to = new Date(Date.parse(row.created_at) + windowMs / 2).toISOString();
  const { data: sameClaim } = await db
    .from("posts")
    .select(`id, author_id, call, created_at, ${AUTHOR_SELECT}`)
    .eq("kind", "call")
    .eq("deleted", false)
    .gte("created_at", from)
    .lte("created_at", to)
    .limit(200);

  const seen = new Set<string>([row.author_id]);
  const callers: {
    id: string;
    confidence: number | null;
    verdict: string;
    author: Row["author"];
  }[] = [];
  for (const other of (sameClaim ?? []) as unknown as Row[]) {
    if (other.id === row.id) continue;
    if (seen.has(other.author_id)) continue;
    const theirs = normalizeCall(other.call);
    if (!theirs || !key || bucketKey(theirs) !== key) continue;
    seen.add(other.author_id);
    callers.push({
      id: other.id,
      confidence: typeof theirs.confidence === "number" ? theirs.confidence : null,
      verdict: theirs.verdict ?? "open",
      author: other.author,
    });
  }

  /* The caller's record, over every Call they have ever settled rather than a
     recent window, so the number on a Call detail page is the same number their
     prediction profile shows. */
  const { data: record } = await db
    .from("posts")
    .select("call, created_at")
    .eq("author_id", row.author_id)
    .eq("kind", "call")
    .eq("deleted", false)
    .neq("call->>verdict", "open")
    .order("created_at", { ascending: true })
    .limit(2000);

  let hits = 0;
  let total = 0;
  const settledForStreak: { score?: number | null; hit: boolean }[] = [];
  for (const r of (record ?? []) as unknown as { call: CallData | null }[]) {
    const c = normalizeCall(r.call);
    if (!c || (c.verdict !== "hit" && c.verdict !== "miss")) continue;
    total += 1;
    const hit = c.verdict === "hit";
    if (hit) hits += 1;
    settledForStreak.push({ score: c.score ?? null, hit });
  }
  const run = streaks(settledForStreak);

  return json({
    call: {
      id: row.id,
      body: row.body,
      created_at: row.created_at,
      closes_at: closesAt,
      like_count: row.like_count,
      reply_count: row.reply_count,
      view_count: row.view_count,
      author_id: row.author_id,
      author: row.author,
      /* Server resolved. The client never decides whose Call this is. */
      is_yours: viewer?.id === row.author_id,
      house_slug: row.house_slug,
      data: call,
      live,
      consensus: {
        independent: peers.confidences.length,
        eligible: peers.eligible,
        needed: MIN_PEERS,
        mean_confidence: meanConfidence,
        callers,
      },
      record: {
        hits,
        misses: total - hits,
        total,
        score: shrunkAccuracy(hits, total),
        hit_rate: total > 0 ? hits / total : 0,
        streak: run.current,
        best_streak: run.best,
      },
    },
  });
}
