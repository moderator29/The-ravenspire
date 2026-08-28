import { MODEL_REASONING, heraldAvailable, heraldProse } from "@/lib/ai/herald";
import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { settlementPrice } from "@/lib/calls/resolvers/price";
import { peerBaselineFor } from "@/lib/calls/peers";
import { normalizeCall, priceSubjectFor, type CallData } from "@/lib/calls/types";
import { HORIZON_DAYS } from "@/lib/calls/scoring";
import { callProgress, difficultyBand, scoreOutlook } from "@/lib/calls/analytics";

/* The Herald's read on a Call (V2 section 10, house rule 5).

   Every AI surface in this realm is a real Anthropic call reasoning over real
   data, and this is no exception. Everything in the prompt below is read from
   the stored Call, the live price the settlement job would use, and the real
   peer counts: nothing is invented here and the model is given no room to
   invent either, because it is handed the numbers rather than asked for them.

   Without a key the route says so honestly and the panel degrades to nothing.
   There is no canned analysis and no stub. A fake Herald would be worse than
   no Herald, because a member cannot tell the difference and would trust it.

   Two spend caps, because this is the only paid call in the Calls surface:
   one per member per hour, and one across the whole realm per day. Both are
   enforced by the shared Supabase limiter, so they hold across instances. */

export const dynamic = "force-dynamic";

/* One member cannot burn the realm's daily allowance on their own. */
const PER_MEMBER_HOURLY = 10;
/* The realm's whole daily allowance for this surface. */
const REALM_DAILY = 300;

const SYSTEM = `You are @raven, the Herald of The Ravenspire, reading a member's Call for the realm to watch.

A Call is a public, timestamped prediction with a stated confidence, sealed against a difficulty the realm froze from real trailing volatility. Your job is to make the Call worth watching for a spectator who did not make it.

Rules, all absolute:
- Reason ONLY over the figures you are given. Never state a number that is not in them, and never estimate one.
- Never give financial advice. Never tell anyone to buy, sell, hold, or copy a Call. The Ravenspire is a game of judgment, not a brokerage.
- Never predict the outcome yourself and never say whether the caller is right. Say what would have to be true for the Call to land, and what the stated confidence is claiming against the baseline.
- No em dashes, ever. Use a comma, a period, or restructure.
- No emoji, no hashtags, no headings, no lists, no preamble. Two or three sentences of plain prose, under 90 words.
- Write for a reader watching a contest, not for the caller.`;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded) return json({ error: "Finish onboarding first" }, 403);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  if (!heraldAvailable()) {
    return json(
      {
        error:
          "The Herald is not in the rookery. This realm has no Anthropic key configured, so there is no reading to give.",
      },
      503
    );
  }

  const { id } = await ctx.params;
  if (!id) return json({ error: "bad request" }, 400);

  const mine = await rateLimit(
    profileKey("call-analysis", profile.id),
    PER_MEMBER_HOURLY,
    3600
  );
  if (!mine.ok) {
    return json(
      {
        error: "The Herald has read enough for you this hour.",
        retryAfter: mine.retryAfter,
      },
      429
    );
  }

  /* B5: fails closed, like every other realm-wide ceiling over a paid
     Anthropic call. This is the only limit standing between a limiter outage
     and an unbounded bill, and a limiter that waves everything through when
     the store is unreachable is not that limit. The per-member ceiling above
     stays fail-open: it protects the realm's budget only through this one. */
  const realm = await rateLimit("call-analysis:realm", REALM_DAILY, 86400, {
    failClosed: true,
  });
  if (!realm.ok) {
    return json(
      {
        error: "The Herald has spent the realm's voice for today.",
        retryAfter: realm.retryAfter,
      },
      429
    );
  }

  const { data } = await db
    .from("posts")
    .select("id, author_id, body, call, created_at, house_slug")
    .eq("id", id)
    .eq("kind", "call")
    .eq("deleted", false)
    .maybeSingle();

  const row = data as unknown as {
    id: string;
    author_id: string;
    body: string;
    call: CallData | null;
    created_at: string;
    house_slug: string | null;
  } | null;
  if (!row) return json({ error: "not found" }, 404);

  const call = normalizeCall(row.call);
  if (!call) return json({ error: "not found" }, 404);

  /* Real figures only, all of them read rather than guessed. */
  const facts: string[] = [];
  const timeframe = call.timeframe ?? "24h";
  facts.push(`Category: ${call.category ?? "markets"}.`);
  facts.push(`Window: ${timeframe}.`);
  facts.push(`Sealed at: ${row.created_at}.`);
  facts.push(`Verdict so far: ${call.verdict ?? "open"}.`);

  if (call.resolver === "internal" && call.claim) {
    facts.push(`Claim about the realm itself: ${JSON.stringify(call.claim)}.`);
  } else {
    facts.push(`Subject: $${call.token ?? "unknown"}.`);
    facts.push(`Direction: ${call.stance === "down" ? "falls" : "rises"}.`);
    facts.push(
      call.threshold && call.threshold > 0
        ? `Move required: ${(call.threshold * 100).toFixed(1)} percent.`
        : "Move required: any move in the stated direction."
    );
    if (typeof call.entry_price === "number") {
      facts.push(`Price sealed at: ${call.entry_price} USD.`);
    }
    if (typeof call.sigma === "number") {
      facts.push(
        `Trailing annualized volatility measured from real prices: ${(call.sigma * 100).toFixed(0)} percent, which is about ${((call.sigma / Math.sqrt(365)) * 100).toFixed(1)} percent on a typical day.`
      );
    }
  }

  if (typeof call.confidence === "number") {
    facts.push(
      `Caller's stated confidence: ${Math.round(call.confidence * 100)} percent.`
    );
  }
  if (typeof call.pi_0 === "number") {
    const band = difficultyBand(call.pi_0);
    facts.push(
      `Frozen difficulty: this lands on its own about ${Math.round(call.pi_0 * 100)} times in 100, rated ${band.label}.`
    );
    if (typeof call.confidence === "number") {
      const outlook = scoreOutlook(call.confidence, call.pi_0);
      facts.push(
        `Score at stake: ${outlook.ifHit} if it lands, ${outlook.ifMiss} if it misses.`
      );
    }
  }
  if (call.rationale) {
    facts.push(`The caller's stated reasoning: "${call.rationale}"`);
  }

  /* The live price the settlement job would actually use, and how far the Call
     has travelled against it. Absent when the realm has no trustworthy print,
     in which case the Herald is told that rather than given a number. */
  if (call.verdict === "open" && call.resolver !== "internal") {
    const subject = priceSubjectFor(call);
    const price = subject ? await settlementPrice(subject) : null;
    if (price !== null && typeof call.entry_price === "number") {
      facts.push(`Latest trustworthy price: ${price} USD.`);
      const progress = callProgress({
        entry: call.entry_price,
        current: price,
        threshold: call.threshold ?? 0,
        direction: call.stance === "down" ? "down" : "up",
      });
      if (progress) {
        facts.push(
          `Move since sealing: ${(progress.move * 100).toFixed(2)} percent, which is ${Math.round(progress.fraction * 100)} percent of the move the Call needs.`
        );
      }
      const closes =
        Date.parse(row.created_at) +
        (HORIZON_DAYS[timeframe] ?? 1) * 24 * 60 * 60 * 1000;
      const hoursLeft = (closes - Date.now()) / 3600000;
      if (hoursLeft > 0) {
        facts.push(`Hours left in the window: ${hoursLeft.toFixed(1)}.`);
      }
    } else {
      facts.push(
        "The realm has no trustworthy live price for this subject right now."
      );
    }
  }

  const peers = await peerBaselineFor(db, {
    call,
    authorId: row.author_id,
    houseSlug: row.house_slug,
    createdAt: row.created_at,
  });
  facts.push(
    peers.confidences.length > 0
      ? `Independent members who Called the same claim: ${peers.confidences.length}, averaging ${Math.round((peers.confidences.reduce((a, b) => a + b, 0) / peers.confidences.length) * 100)} percent confidence.`
      : "No independent member has Called this same claim in this window."
  );

  if (typeof call.score === "number" && call.verdict !== "open") {
    facts.push(
      `Settled score: ${call.score}, taken from the ${call.score_basis ?? "baseline"} baseline.`
    );
  }

  const text = await heraldProse({
    model: MODEL_REASONING,
    system: SYSTEM,
    user: `Read this Call for the realm. Here is everything the realm knows about it, and it is all you may use:\n\n${facts.join("\n")}`,
    maxTokens: 400,
    effort: "low",
  });
  if (!text) return json({ error: "The Herald had nothing to say." }, 502);
  return json({ ok: true, text });
}
