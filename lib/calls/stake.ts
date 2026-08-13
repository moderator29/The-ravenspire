/* Staked Calls: the economics, pure (V2 sections 9 and 36.3).

   A Call already costs a scarce open-Call slot and pays Renown and Season
   Rating when it resolves. What it has never had is anything at risk. An
   economy that only ever adds is an economy where nothing is scarce, and after
   a year of it every number on a profile means the same thing: time served.

   A stake fixes that at the one surface where the realm already knows how hard
   a claim is. The member puts POINTS behind their Call. Right, and the stake
   comes back with a bonus scaled to the difficulty the scoring engine already
   computed. Wrong, and the stake burns.

   Deliberately dependency free and side effect free, with no "server-only"
   import, for the same reason lib/calls/scoring.ts is: the composer has to be
   able to show a member exactly what they stand to win and exactly what they
   stand to lose BEFORE they commit, and it has to be the same arithmetic the
   settlement job runs. A client side approximation of a payout is a lie with a
   rounding error in it.

   Nothing here is authoritative. Every number this file produces is recomputed
   on the server, and the escrow and the settlement both happen inside a single
   Postgres function that holds the member's profile row lock. See
   supabase/migrations/20260815120000_call_stakes_and_house_treasury.sql. */

import { SCORE_MAX, clamp } from "@/lib/calls/scoring";

/* ------------------------------------------------------------------
   Bounds
   ------------------------------------------------------------------ */

/* The smallest stake the realm will accept.

   Below this a stake is theatre. Sealing a Call already pays 8 points, and a
   resolved Call pays up to 40 more, so a stake of 5 is smaller than the reward
   for making the Call at all: the member risks nothing, the bonus rounds to
   nothing, and the ledger fills with rows that cost more to read than they
   carry. 25 is roughly what one well made Call pays out, so the smallest real
   stake is "one Call's worth", which is a thing a member can feel. */
export const MIN_STAKE = 25;

/* The largest stake the realm will accept, per Call.

   A stake that can be arbitrarily large turns the standings into a whale
   board: the member with the deepest balance wins the most points, and points
   are the balance every other sink in the realm will eventually spend. The
   ceiling is set against the two allowances that already exist. Social Renown
   is capped at 200 a day and the War at 1,500, so 1,000 is a little under a
   day's total honest earning at the very top end. With five open-Call slots a
   member can have 5,000 points at risk at once, which is weeks of play, and
   five maximum stakes all landing perfectly pays 5,000 points back, which is
   large but is not larger than a month of everything else combined.

   It is also a hard number rather than a fraction of the balance on purpose. A
   percentage cap sounds fairer and is worse: it scales with wealth, so the
   member with ten times the balance still moves ten times the points, which is
   the exact outcome the cap exists to prevent. */
export const MAX_STAKE = 1000;

/* The most a landed Call can pay back on top of the stake, as a multiple.

   1.0 means the best possible Call returns the stake and the stake again, and
   nothing in the realm returns more than double. The downside is already total
   (a missed Call burns the whole stake), so a maximum upside of one for one
   keeps the extreme of the bet symmetric, which is the shape a member can hold
   in their head without a table.

   The expected value falls out of the scoring rule and is worth writing down,
   because it is the reason this is not a faucet. On a landed Call the bonus
   rate is clamp(log2(p / pi_0), 0, 1), so a member whose stated confidence p
   is no better than the baseline pi_0 earns nothing extra and loses the whole
   stake when they miss. Working the arithmetic for a member with NO real edge,
   meaning their true hit rate is the baseline rather than their claim:

     pi_0 0.50, states 0.70  ->  0.50 * (1 + 0.485) - 1  =  -0.26 per point
     pi_0 0.10, states 0.70  ->  0.10 * (1 + 1.000) - 1  =  -0.80 per point

   and for a member who genuinely hits what they claim:

     pi_0 0.50, states 0.70, true 0.70  ->  +0.04 per point
     pi_0 0.10, states 0.70, true 0.70  ->  +0.40 per point

   So confidence without skill drains, and skill is paid. That is the whole
   design, and it means the average staked point is destroyed rather than
   minted, which is what makes this a sink rather than a second faucet. */
export const MAX_BONUS_RATE = 1;

/* What share of a burned stake reaches the staker's House treasury, in basis
   points. The rest is destroyed outright and leaves the realm forever.

   This is the decision the whole sink turns on, so it is worth being explicit.
   At 10,000 (all of it) the burn is not a burn at all, it is a transfer: the
   realm's point supply never falls and the House becomes a laundry that hands
   the points back through a perk. At 0 the burn is a pure contraction and
   Houses have no treasury, which leaves the second half of this work with
   nothing to fund. 5,000 splits it: half of every burned stake is destroyed
   and can never be earned again by anyone, and half is pooled under a banner
   where it can only be spent on something the whole House shares.

   A member with no House burns the whole stake. There is nowhere for the tithe
   to go, and inventing a realm-wide pot for it would be inventing a number. */
export const HOUSE_TITHE_BPS = 5000;

/* ------------------------------------------------------------------
   Validation
   ------------------------------------------------------------------ */

export type StakeCheck =
  | { ok: true; stake: number }
  | { ok: false; error: string };

/* Is this a stake the realm will take, given what the member actually holds.

   The balance test is here so the composer can refuse before the member spends
   a submission on it, and it is NOT the guarantee. Two Calls sealed in the same
   instant can both pass this and only one of them can pass the row lock in
   escrow_call_stake. The server is the authority; this is courtesy. */
export function checkStake(raw: unknown, balance: number): StakeCheck {
  if (raw === undefined || raw === null)
    return { ok: true, stake: 0 };
  if (typeof raw !== "number" || !Number.isFinite(raw))
    return { ok: false, error: "A stake has to be a number of POINTS." };

  const stake = Math.trunc(raw);
  if (stake === 0) return { ok: true, stake: 0 };
  if (stake < 0)
    return { ok: false, error: "A stake cannot be negative." };
  if (stake < MIN_STAKE)
    return {
      ok: false,
      error: `The smallest stake the realm takes is ${MIN_STAKE} POINTS.`,
    };
  if (stake > MAX_STAKE)
    return {
      ok: false,
      error: `The largest stake the realm takes on one Call is ${MAX_STAKE} POINTS.`,
    };
  if (stake > balance)
    return {
      ok: false,
      error: "You do not hold that many POINTS.",
    };
  return { ok: true, stake };
}

/* The largest stake this member could actually place right now. Zero when they
   cannot afford the minimum, which is an honest "not yet" rather than a slider
   that moves and then fails. */
export function maxStakeFor(balance: number): number {
  const affordable = Math.min(MAX_STAKE, Math.trunc(balance));
  return affordable >= MIN_STAKE ? affordable : 0;
}

/* ------------------------------------------------------------------
   Payout
   ------------------------------------------------------------------ */

/* The bonus a landed Call pays on top of the returned stake.

   Scaled by difficultyWeight, which is the difficulty measure the scoring
   engine already computes and the settlement job already uses to scale the
   flat participation award. Reusing it rather than deriving a second measure
   of difficulty is the point: a member reads one number on the composer that
   says how hard their Call is, and that same number decides Renown, the flat
   award and the stake bonus. Two difficulty scales that disagreed would be a
   bug nobody could see until it had paid out.

   A negative score means the member stated LESS confidence than the baseline
   and got lucky. difficultyWeight clamps that to zero, so the stake comes back
   and nothing is added. That is correct: they were paid in Renown and Season
   Rating for being better calibrated than the model, and the stake was a bet
   on the outcome, which they backed at worse than the coin's own odds.

   THE MULTIPLICATION ORDER IS LOAD BEARING. The obvious spelling,
   `stake * difficultyWeight(score)`, divides by 100 first and multiplies a
   binary float second, so a stake of 10 at a score of 15 computes
   1.4999999999999998 and rounds DOWN to 1, while the same expression in
   Postgres numeric computes exactly 1.50 and rounds UP to 2. The composer
   would then promise a member one number and the settlement job would pay
   another, on a payout, for no visible reason. Multiplying the two integers
   first keeps every intermediate exact (the largest possible product is
   1,000 * 100) and makes the two implementations agree by construction.
   `percent / SCORE_MAX` is difficultyWeight(score), reordered and nothing
   more. */
export function stakeBonus(stake: number, score: number): number {
  if (stake <= 0) return 0;
  const percent = clamp(Math.round(score), 0, SCORE_MAX);
  return Math.round((stake * MAX_BONUS_RATE * percent) / SCORE_MAX);
}

export interface StakeOutcome {
  /* POINTS paid back to the member. Stake plus bonus on a hit, zero on a miss,
     the bare stake on a void. */
  returned: number;
  /* The bonus alone, for the surfaces that want to name it. */
  bonus: number;
  /* POINTS that left the member and are not coming back. */
  burned: number;
  /* Of the burned amount, what reaches the House treasury. */
  tithe: number;
  /* Of the burned amount, what is destroyed and can never be earned again. */
  destroyed: number;
}

/* What a settled Call does to a stake.

   `verdict` is the realm's own verdict string, so this function reads the same
   three outcomes the settlement job does and cannot drift from it. A void is a
   Call the realm could not settle honestly, so the stake comes back whole with
   no bonus: the member is not punished for the realm's silence, and is not
   paid for a claim that never resolved. */
export function stakeOutcome(input: {
  stake: number;
  score: number;
  verdict: "hit" | "miss" | "void";
  /* False for a member sworn to no House. The tithe has nowhere to go and the
     whole burn is destroyed. */
  hasHouse: boolean;
}): StakeOutcome {
  const stake = Math.max(0, Math.trunc(input.stake));
  const none: StakeOutcome = {
    returned: 0,
    bonus: 0,
    burned: 0,
    tithe: 0,
    destroyed: 0,
  };
  if (stake === 0) return none;

  if (input.verdict === "void")
    return { ...none, returned: stake };

  if (input.verdict === "hit") {
    const bonus = stakeBonus(stake, input.score);
    return { ...none, returned: stake + bonus, bonus };
  }

  /* The burn. floor on the tithe and a subtraction for the remainder, never
     two independent roundings: the two halves have to add back to exactly the
     stake or the realm quietly mints or destroys a point per settlement. */
  const tithe = input.hasHouse
    ? Math.floor((stake * HOUSE_TITHE_BPS) / 10000)
    : 0;
  return { ...none, burned: stake, tithe, destroyed: stake - tithe };
}

/* Both sides of the bet, for the composer to show before the member commits.
   The score a hit would produce and the score a miss would produce are both
   known in advance from the frozen baseline, which is why this can be honest
   rather than indicative. */
export function stakeOutlook(input: {
  stake: number;
  scoreIfHit: number;
}): { ifHit: number; ifMiss: number } {
  const stake = Math.max(0, Math.trunc(input.stake));
  return {
    ifHit: stakeBonus(stake, input.scoreIfHit),
    /* Guarded rather than written as `-stake`, because negating zero in
       JavaScript produces -0, which formats as "-0" and would put a minus sign
       on a member risking nothing. */
    ifMiss: stake > 0 ? -stake : 0,
  };
}
