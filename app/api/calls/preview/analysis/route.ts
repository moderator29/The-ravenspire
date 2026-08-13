import { MODEL_REASONING, heraldAvailable, heraldProse } from "@/lib/ai/herald";
import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { prepareCall, MAX_OPEN_CALLS, type CallInput } from "@/lib/calls/create";
import { peerBaselineFor } from "@/lib/calls/peers";
import { callerRecordFor } from "@/lib/calls/record";
import { discussionFor, similarCalls } from "@/lib/calls/similar";
import { difficultyBand, scoreOutlook } from "@/lib/calls/analytics";

/* The Herald reads a Call before it is sealed (V2 section 10, the row reading
   "Analyse a Call before publishing: build first, highest value per call").

   This is the highest value paid surface in the realm because it is the only
   moment where a reading can still change what a member does. Afterwards it is
   commentary; here it is a mirror held up to a claim they have not yet put
   their name to.

   Every figure in the prompt is read rather than asked for:

     the live entry price and the real trailing volatility, from prepareCall,
       which is the same server path that seals the Call, so the difficulty the
       Herald reasons over is the difficulty the Call would be frozen with
     the member's own record and their measured calibration in the band they
       are stating, counted from Calls they already settled
     the independent peer consensus on the same claim
     the Calls already standing on the same subject
     how much the realm has said about the subject lately

   The model is handed all of it and is told, in the system prompt, that it may
   state no number that is not in the list. It has no room to invent because it
   is never asked to produce a figure at all.

   No key configured is an honest 503 the composer degrades on. There is no
   canned reading and no stub, because a member cannot tell a fake Herald from a
   real one and would trust it.

   Two spend caps, both through the shared Supabase limiter so they hold across
   instances. Per member per hour, because a composer is iterative and a member
   redrafting a Call must not be able to spend the realm's day. Per realm per
   day, because that is the actual budget line. */

export const dynamic = "force-dynamic";

/* A member can hold five Calls open at once, so six readings an hour is more
   than one for every Call they could possibly seal in that hour. */
const PER_MEMBER_HOURLY = 6;
/* The realm's whole daily allowance for pre-seal readings. */
const REALM_DAILY = 200;

const SYSTEM = `You are @raven, the Herald of The Ravenspire, reading a member's draft Call back to them before they seal it.

A Call is a public, timestamped prediction with a stated confidence, sealed against a difficulty the realm froze from real trailing volatility. Once sealed it cannot be edited, it costs the member score if it misses, and the realm settles it automatically. Your job is to make sure the member knows exactly what they are about to put their name to.

Rules, all absolute:
- Reason ONLY over the figures you are given. Never state a number that is not in them, and never estimate one.
- Never give financial advice. Never tell anyone to buy, sell, hold, or copy a Call. The Ravenspire is a game of judgment, not a brokerage.
- Never predict the outcome and never say whether the claim is right. You do not know, and pretending to would be the worst thing you could do here.
- Never tell the member to raise or lower their confidence, to change the Call, or to seal it. You may state what their own record shows at the confidence they have chosen and leave the decision entirely to them.
- If their measured record contradicts their stated confidence, say so plainly and without softening it. If it supports it, say that too. If they have no record at that confidence, say there is nothing to compare against rather than filling the silence.
- No em dashes, ever. Use a comma, a period, or restructure.
- No emoji, no hashtags, no headings, no lists, no preamble. Three or four sentences of plain prose, under 110 words.
- Address the member directly as you.`;

function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)} percent`;
}

export async function POST(req: Request) {
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

  const mine = await rateLimit(
    profileKey("call-draft-analysis", profile.id),
    PER_MEMBER_HOURLY,
    3600
  );
  if (!mine.ok) {
    return json(
      {
        error: "The Herald has read enough drafts for you this hour.",
        retryAfter: mine.retryAfter,
      },
      429
    );
  }

  const realm = await rateLimit("call-draft-analysis:realm", REALM_DAILY, 86400);
  if (!realm.ok) {
    return json(
      {
        error: "The Herald has spent the realm's voice for today.",
        retryAfter: realm.retryAfter,
      },
      429
    );
  }

  const body = (await req.json().catch(() => null)) as CallInput | null;
  if (!body) return json({ error: "bad request" }, 400);

  /* The same server path that seals the Call. A client side approximation would
     hand the Herald a difficulty the member is never scored against. */
  const draft = await prepareCall(
    db,
    { id: profile.id, points: profile.points, house_slug: profile.house_slug },
    body
  );
  if (!draft.ok) return json({ error: draft.error }, draft.status);
  const call = draft.call;

  const [peers, record, similar, discussion] = await Promise.all([
    peerBaselineFor(db, {
      call,
      authorId: profile.id,
      houseSlug: profile.house_slug,
      createdAt: new Date().toISOString(),
    }),
    callerRecordFor(db, { authorId: profile.id, call }),
    similarCalls(db, { call, viewerId: profile.id, limit: 6 }),
    discussionFor(db, call.token),
  ]);

  const facts: string[] = [];
  const timeframe = call.timeframe ?? "24h";
  facts.push(`Category: ${call.category ?? "markets"}.`);
  facts.push(`Window: ${timeframe}.`);

  if (call.resolver === "internal" && call.claim) {
    facts.push(`Claim about the realm itself: ${JSON.stringify(call.claim)}.`);
  } else {
    facts.push(`Subject: $${call.token ?? "unknown"}.`);
    facts.push(`Direction: ${call.stance === "down" ? "falls" : "rises"}.`);
    facts.push(
      call.threshold && call.threshold > 0
        ? `Move required: ${pct(call.threshold, 1)}.`
        : "Move required: any move in the stated direction."
    );
    if (typeof call.entry_price === "number") {
      facts.push(`Live price it would seal at: ${call.entry_price} USD.`);
    }
    if (typeof call.sigma === "number") {
      facts.push(
        `Trailing annualized volatility measured from real prices: ${pct(call.sigma)}, which is about ${pct(call.sigma / Math.sqrt(365), 1)} on a typical day.`
      );
    }
  }

  const confidence = call.confidence;
  if (typeof confidence === "number") {
    facts.push(`Confidence the member has chosen: ${pct(confidence)}.`);
  }

  if (typeof call.pi_0 === "number") {
    const band = difficultyBand(call.pi_0);
    facts.push(
      `Frozen difficulty: this lands on its own about ${Math.round(call.pi_0 * 100)} times in 100, rated ${band.label}.`
    );
    if (typeof confidence === "number") {
      const outlook = scoreOutlook(confidence, call.pi_0);
      facts.push(
        `Score at stake at that confidence: ${outlook.ifHit} if it lands, ${outlook.ifMiss} if it misses.`
      );
    }
  }

  if (call.rationale) {
    facts.push(`The member's own stated reasoning: "${call.rationale}"`);
  }

  /* The member's record. Counted, never estimated, and absent rather than
     softened when there is nothing to count. */
  if (record.settled.total > 0 && record.settled.hitRate !== null) {
    facts.push(
      `The member's record: ${record.settled.hits} of ${record.settled.total} settled Calls landed, which is ${pct(record.settled.hitRate)}.`
    );
  } else {
    facts.push("The member has never had a Call settle. They have no record yet.");
  }
  if (record.category.total > 0 && record.category.hitRate !== null) {
    facts.push(
      `In this category: ${record.category.hits} of ${record.category.total} landed.`
    );
  }
  if (record.subject.total > 0 && record.subject.hitRate !== null) {
    facts.push(
      `On this same subject: ${record.subject.hits} of ${record.subject.total} landed.`
    );
  }
  if (record.claim.total > 0) {
    facts.push(
      `They have made this exact claim before: ${record.claim.hits} of ${record.claim.total} landed.`
    );
  }
  if (record.confidence) {
    const check = record.confidence;
    facts.push(
      `Their calibration in the confidence band they are stating: across ${check.total} settled ${check.total === 1 ? "Call" : "Calls"} between ${pct(check.from)} and ${pct(check.to)}, they stated ${pct(check.stated)} on average and landed ${pct(check.realized)}. The gap is ${pct(Math.abs(check.gap))} ${check.gap > 0 ? "of overconfidence" : "in their favour"}.`
    );
  } else if (typeof confidence === "number") {
    facts.push(
      "They have never settled a Call at this confidence, so there is nothing to compare this confidence against."
    );
  }
  facts.push(
    `Calls they already have running: ${record.open} of a maximum ${MAX_OPEN_CALLS}.`
  );

  facts.push(
    peers.confidences.length > 0
      ? `Independent members who have already Called this same claim: ${peers.confidences.length}, averaging ${pct(peers.confidences.reduce((a, b) => a + b, 0) / peers.confidences.length)} confidence.${peers.eligible ? " That is enough of a crowd that the Call would be scored against them rather than against the volatility model." : ""}`
      : "No independent member has Called this same claim in this window."
  );

  const against = similar.filter((s) => s.relation === "same-subject").length;
  facts.push(
    similar.length > 0
      ? `Calls standing on this subject in the last 30 days: ${similar.length}, of which ${against} call it the other way.`
      : "Nobody has Called this subject in the last 30 days."
  );

  if (discussion) {
    facts.push(
      `Posts mentioning this subject in the last ${discussion.windowHours} hours: ${discussion.posts}.`
    );
  }

  const text = await heraldProse({
    model: MODEL_REASONING,
    system: SYSTEM,
    user: `Read this member's draft Call back to them before they seal it. Here is everything the realm knows about it, and it is all you may use:\n\n${facts.join("\n")}`,
    maxTokens: 450,
    effort: "low",
  });
  if (!text) return json({ error: "The Herald had nothing to say." }, 502);
  return json({ ok: true, text });
}
