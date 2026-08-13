import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupToken } from "@/lib/data/tokens";
import {
  CONFIDENCE_MAX,
  CONFIDENCE_MIN,
  horizonYears,
  impliedBaseline,
} from "@/lib/calls/scoring";
import { normalizeSources } from "@/lib/calls/analytics";
import { checkStake } from "@/lib/calls/stake";
import { extraOpenCallSlots } from "@/lib/houses/treasury";
import { realizedVolatility } from "@/lib/calls/volatility";
import { pinSubject } from "@/lib/calls/resolvers/price";
import {
  evaluateInternalClaim,
  internalBaseline,
  parseInternalClaim,
} from "@/lib/calls/resolvers/internal";
import {
  CALL_CATEGORIES,
  CALL_TIMEFRAMES,
  IMPLEMENTED_RESOLVERS,
  type CallCategory,
  type CallData,
  type CallDirection,
  type CallResolver,
  type CallTimeframe,
} from "@/lib/calls/types";

/* Sealing a Call (V2 sections 6.3, 9.1 and 9.5).

   Everything a member cannot be trusted with happens here, on the server: the
   entry price, the difficulty baseline, and the count of how many Calls they
   already have running. The client supplies a claim and a confidence, nothing
   more. */

/* Anti-farming rule 2 of section 9.5. Without a ceiling a member fires off a
   hundred Calls, lets them all resolve, and shows the winners on their profile
   while the losers scroll away. Five running at once means every Call has to be
   worth a slot.

   A House may buy its members a sixth slot for a week (The Long Watch, see
   lib/houses/perks.ts). That is the only thing in the realm that moves this
   number, it is bought with points the House's own members burned, and it
   expires on its own. */
export const MAX_OPEN_CALLS = 5;

/* Rationale is prose on a card, not an essay. */
const RATIONALE_MAX = 280;

/* A threshold above this is not a forecast, it is a lottery ticket, and the
   baseline saturates at the floor long before it. */
const THRESHOLD_MAX = 10;

export interface CallInput {
  token?: string;
  stance?: CallDirection;
  timeframe?: string;
  category?: string;
  resolver?: string;
  confidence?: number;
  rationale?: string;
  threshold?: number;
  claim?: unknown;
  sources?: unknown;
  /* POINTS the member wants to put behind the Call. Optional: every existing
     client sends nothing and seals exactly the Call it always did. */
  stake?: number;
}

/* What sealing a Call needs to know about the member sealing it.

   The balance is here because a stake cannot be validated without it, and the
   House because the open-Call ceiling can be raised by a House perk. Both come
   from the session profile the route already holds, so this adds no read: the
   alternative, fetching the profile again inside prepareCall, would be a
   second query for figures the caller was handed at authentication. */
export interface CallAuthor {
  id: string;
  points: number;
  house_slug: string | null;
}

export type CallDraft =
  | { ok: true; call: CallData }
  | { ok: false; error: string; status: number };

function fail(error: string, status = 400): CallDraft {
  return { ok: false, error, status };
}

/* How many Calls this member already has running. */
export async function openCallCount(
  db: SupabaseClient,
  profileId: string
): Promise<number> {
  const { count } = await db
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", profileId)
    .eq("kind", "call")
    .eq("deleted", false)
    .filter("call->>verdict", "eq", "open");
  return count ?? 0;
}

/* Build the `call` jsonb for a new Call, or explain why it cannot be sealed.

   Nothing here is optimistic. If the realm cannot get a real price, or cannot
   measure a real trailing volatility, or cannot compute a real base rate, the
   Call is refused. A Call sealed against an invented difficulty would mint
   Renown out of nothing, and Renown is permanent. */
export async function prepareCall(
  db: SupabaseClient,
  author: CallAuthor,
  input: CallInput
): Promise<CallDraft> {
  const [open, extraSlots] = await Promise.all([
    openCallCount(db, author.id),
    extraOpenCallSlots(db, author.house_slug),
  ]);
  const ceiling = MAX_OPEN_CALLS + extraSlots;
  if (open >= ceiling) {
    return fail(
      `You already have ${ceiling} Calls running. Let one resolve before sealing another.`,
      429
    );
  }

  /* The stake. Refused rather than clamped, for the same reason an
     out-of-band confidence is refused: silently turning a stated 5,000 into
     1,000 would take four times what the member meant to risk, and silently
     turning it into 0 would seal a Call they thought they had backed.

     The balance test here is courtesy, not the guarantee. Two Calls sealed in
     the same instant can both pass it and only one can pass the profile row
     lock inside escrow_call_stake, which is the authority. */
  const staked = checkStake(input.stake, author.points);
  if (!staked.ok) return fail(staked.error);

  const category: CallCategory = (CALL_CATEGORIES as readonly string[]).includes(
    input.category ?? ""
  )
    ? (input.category as CallCategory)
    : "markets";

  /* An unstated resolver follows the category: realm claims resolve from our
     own rows, everything else from the market. This is what makes every
     existing client, which sends neither field, keep working unchanged. */
  const requested = input.resolver ?? (category === "realm" ? "internal" : "price");
  if (!IMPLEMENTED_RESOLVERS.includes(requested as CallResolver)) {
    return fail("That kind of Call cannot be resolved yet.");
  }
  const resolver = requested as CallResolver;

  const timeframe: CallTimeframe = (CALL_TIMEFRAMES as readonly string[]).includes(
    input.timeframe ?? ""
  )
    ? (input.timeframe as CallTimeframe)
    : "24h";

  /* Confidence. A missing value is the one place a default is honest: every
     existing client sends no confidence at all, and the bottom of the band is
     the least the member could possibly have meant, so it can never inflate a
     score. An out-of-band value is a rejection, not a clamp, because silently
     turning a stated 0.999 into 0.99 misreports what the member claimed. */
  let confidence = CONFIDENCE_MIN;
  if (input.confidence !== undefined) {
    if (
      typeof input.confidence !== "number" ||
      !Number.isFinite(input.confidence) ||
      input.confidence < CONFIDENCE_MIN ||
      input.confidence > CONFIDENCE_MAX
    ) {
      return fail(
        `Confidence must be between ${CONFIDENCE_MIN} and ${CONFIDENCE_MAX}. Certainty is never real.`
      );
    }
    confidence = input.confidence;
  }

  const rationale =
    typeof input.rationale === "string"
      ? input.rationale.trim().slice(0, RATIONALE_MAX) || undefined
      : undefined;

  const rawThreshold = input.threshold;
  if (
    rawThreshold !== undefined &&
    (typeof rawThreshold !== "number" ||
      !Number.isFinite(rawThreshold) ||
      rawThreshold < 0 ||
      rawThreshold > THRESHOLD_MAX)
  ) {
    return fail("That threshold is not a move any token could make.");
  }
  const threshold = rawThreshold ?? 0;

  /* Evidence. Only absolute https links survive, at most three, because the
     realm renders these and a link is the one part of a Call a reader can check
     for themselves. An empty list is stored as nothing at all. */
  const sources = normalizeSources(input.sources);

  const base = {
    category,
    resolver,
    timeframe,
    confidence,
    rationale,
    threshold,
    ...(sources.length > 0 ? { sources } : {}),
    /* Written into the jsonb only when there is one, so an unstaked Call reads
       exactly as it did before staking existed. */
    ...(staked.stake > 0 ? { stake: staked.stake } : {}),
    verdict: "open" as const,
  };

  if (resolver === "internal") {
    const claim = parseInternalClaim(input.claim);
    if (!claim) return fail("That realm claim is not one the realm can settle.");

    /* Predicting something that is already true is not a prediction. */
    const already = await evaluateInternalClaim(db, claim);
    if (already === null)
      return fail("The realm cannot read that claim right now.", 503);
    if (already)
      return fail("That is already true. A Call has to be about what is not yet.");

    const baseline = await internalBaseline(db, claim);
    if (baseline === null) {
      return fail(
        "The realm is not yet large enough to say how hard that claim is, so it cannot be sealed."
      );
    }

    return {
      ok: true,
      call: { ...base, claim, pi_0: baseline, stance: "up" },
    };
  }

  /* The price resolver. */
  const query = input.token?.trim();
  if (!query) return fail("A Call needs a token.");
  const stance: CallDirection = input.stance === "down" ? "down" : "up";

  /* A Call locks the REAL entry price at creation; the verdict settles later
     against real data. No price, no Call. */
  const card = await lookupToken(query);
  if (!card || card.priceUsd === null) {
    return fail(
      "No live price found for that token, the Call cannot be sealed"
    );
  }

  const subject = pinSubject(card);
  if (!subject) {
    return fail(
      "That token has no identity the realm can settle against, so the Call cannot be sealed"
    );
  }

  const volatility = await realizedVolatility(subject);
  if (!volatility) {
    return fail(
      "The realm cannot measure that token's volatility yet, so it cannot say how hard the Call is"
    );
  }

  /* pi_0, frozen here and never recomputed. The member is shown it before they
     commit, so it has to be the number they were shown. */
  const pi0 = impliedBaseline({
    threshold,
    horizonYears: horizonYears(timeframe),
    sigma: volatility.sigma,
    direction: stance,
  });
  if (!Number.isFinite(pi0)) {
    return fail("The realm could not rate the difficulty of that Call.");
  }

  return {
    ok: true,
    call: {
      ...base,
      token: card.symbol,
      address: card.address,
      chain: card.chain,
      stance,
      entry_price: card.priceUsd,
      subject,
      sigma: volatility.sigma,
      pi_0: pi0,
    },
  };
}
