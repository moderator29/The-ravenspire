/* Calls V2 scoring (V2 section 9).

   Deliberately dependency free and side effect free, with no "server-only"
   import, so it can be unit tested directly and reused on the client to show a
   member how hard their Call is before they commit to it.

   The one idea underneath all of it: a Call is not scored on whether it was
   right, it is scored on how much better the member's stated confidence was
   than a baseline that already knew how hard the Call was. "BTC up 0.1% in 24h"
   and "a fresh memecoin up 40% in 24h" cannot score the same, and here they do
   not. */

/* Confidence is a slider, not three buttons. The floor exists because a Call
   below even odds is not a Call, and the ceiling exists because certainty is
   never real and an unbounded confidence would let one Call swing the season. */
export const CONFIDENCE_MIN = 0.55;
export const CONFIDENCE_MAX = 0.99;

/* Score bounds. One Call can move a member by at most a Knight's worth of
   Renown, in either direction on the Season Rating. */
export const SCORE_MIN = -100;
export const SCORE_MAX = 100;

/* pi_0 is a probability, and the score takes its logarithm, so it is held off
   both ends. A baseline of exactly 0 or 1 is a claim of certainty that trailing
   volatility cannot support. */
export const BASELINE_MIN = 0.001;
export const BASELINE_MAX = 0.999;

export type CallDirection = "up" | "down";

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/* Error function, Abramowitz and Stegun 7.1.26.

   Maximum absolute error 1.5e-7, which is several orders of magnitude finer
   than anything that matters to a score clamped at two significant figures.
   The series is only valid for x >= 0, so negative arguments use the identity
   erf(-x) = -erf(x). */
export function erf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : -1;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);

  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;

  const t = 1 / (1 + p * z);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  return sign * (1 - poly * Math.exp(-z * z));
}

/* Standard normal cumulative distribution, Phi. */
export function normalCdf(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export interface BaselineInput {
  /* The threshold move required for the Call to land, as a positive fraction.
     0.4 means a 40% move. Zero means "any move at all in the stated direction",
     which correctly lands on a coin flip. */
  threshold: number;
  /* Horizon in years. 24h is 1/365. */
  horizonYears: number;
  /* Trailing realized volatility, annualized. Must come from real price
     history; there is no default, because inventing one would invent the
     difficulty of every Call made against it. */
  sigma: number;
  direction: CallDirection;
}

/* pi_0, the difficulty baseline (section 9.1).

     pi_0 = Phi( -ln(1 + k) / (sigma * sqrt(t)) )

   For a driftless lognormal walk this is the chance the token clears a move of
   k over horizon t on its own, with no skill involved. The exact form carries a
   sigma^2 * t / 2 drift term; the simplified version is accurate enough for
   scoring and far easier to explain to a member.

   A down Call is the exact mirror in log space, ln(1 - k) rather than
   -ln(1 + k), so that a 40% fall is measured as the 40% fall it is rather than
   as a 40% rise wearing a minus sign. Both forms agree at k = 0, where the
   baseline is 0.5 and a Call scores nothing on its own.

   This value is frozen at Call creation and stored on the call, because the
   member has to be able to see how hard their Call is before committing, and
   because a baseline that drifted afterwards would be scoring them against a
   world that did not exist when they made the claim. */
export function impliedBaseline(input: BaselineInput): number {
  const { threshold, horizonYears, sigma, direction } = input;
  if (!Number.isFinite(threshold) || threshold < 0) return Number.NaN;
  if (!Number.isFinite(horizonYears) || horizonYears <= 0) return Number.NaN;
  if (!Number.isFinite(sigma) || sigma <= 0) return Number.NaN;

  const spread = sigma * Math.sqrt(horizonYears);

  /* A down Call that needs a fall of 100% or more needs the token to reach
     zero, which the lognormal walk reaches only in the limit. */
  if (direction === "down" && threshold >= 1) return BASELINE_MIN;

  const z =
    direction === "up"
      ? -Math.log(1 + threshold) / spread
      : Math.log(1 - threshold) / spread;

  return clamp(normalCdf(z), BASELINE_MIN, BASELINE_MAX);
}

export interface ScoreInput {
  /* The member's stated confidence, in [0.55, 0.99]. */
  confidence: number;
  /* pi_0 as frozen at Call creation. */
  baseline: number;
  /* Did the Call land. */
  hit: boolean;
}

/* S, the Call score (section 9.2).

     S = clamp( 100 * log2( p_o / pi_o ), -100, +100 )

   where p_o is the member's probability for the outcome that actually happened
   (p when the Call lands, 1 - p when it does not).

   CORRECTION TO SECTION 9.2, deliberate and load bearing. The document writes
   the denominator as pi_0 rather than pi_o. Taken literally that is a minting
   bug: with a hard Call, pi_0 = 0.1 and p = 0.7, landing scores
   100 * log2(0.7 / 0.1) = +281 and missing scores 100 * log2(0.3 / 0.1) = +158.
   Both clamp to +100, so being wrong about a hard Call would pay the maximum
   Renown in the realm, and the way to farm it would be to make the most absurd
   Call possible and lose. Comparing like with like, the member's probability
   for the realized outcome against the baseline's probability for that same
   outcome, is what a log score against a baseline means and is plainly what
   9.1 intends when it says a forecast is scored against a baseline probability.
   The corrected form is identical whenever the Call lands, so the numbers in
   the document that motivate the design are unchanged, and every property it
   claims now actually holds:

     baseline 0.99, confidence 0.99, lands      ->    0, the 0.1% BTC Call
     baseline 0.50, confidence 0.70, lands      -> +49
     baseline 0.50, confidence 0.70, misses     -> -74
     baseline 0.10, confidence 0.70, lands      -> +100, capped
     baseline 0.10, confidence 0.70, misses     -> -100, capped

   Section 9.2 has been amended to match. */
export function callScore(input: ScoreInput): number {
  const { confidence, baseline, hit } = input;
  if (!Number.isFinite(confidence) || !Number.isFinite(baseline)) return 0;

  const p = clamp(confidence, CONFIDENCE_MIN, CONFIDENCE_MAX);
  const pi = clamp(baseline, BASELINE_MIN, BASELINE_MAX);

  const outcomeP = hit ? p : 1 - p;
  const outcomeBaseline = hit ? pi : 1 - pi;

  const raw = 100 * Math.log2(outcomeP / outcomeBaseline);
  return clamp(raw, SCORE_MIN, SCORE_MAX);
}

/* Fewer than this and it is not a crowd, it is a conversation. */
export const MIN_PEERS = 3;

/* The peer score (section 9.2). When at least three independent members have
   Called the same bucket, the crowd is a better baseline than the volatility
   model, because it sums to zero across participants and is therefore immune to
   difficulty by construction.

   The document writes this with a natural logarithm; it is expressed in log2
   here so that a peer score and a baseline score land on the same scale and can
   be clamped by the same bounds. Independence is enforced by the caller: see
   eligiblePeers in lib/calls/peers.ts, which drops the member's own Calls and
   every House-mate's, because six people in one House agreeing is not a crowd. */
export function peerScore(input: {
  confidence: number;
  peerConfidences: number[];
  hit: boolean;
}): number {
  const { confidence, peerConfidences, hit } = input;
  if (peerConfidences.length < MIN_PEERS) return Number.NaN;

  const p = clamp(confidence, CONFIDENCE_MIN, CONFIDENCE_MAX);
  const outcomeP = hit ? p : 1 - p;

  /* Geometric mean of the peers' probabilities for the realized outcome, taken
     in log space so a long list cannot underflow to zero. */
  let logSum = 0;
  for (const q of peerConfidences) {
    const qc = clamp(q, CONFIDENCE_MIN, CONFIDENCE_MAX);
    logSum += Math.log2(hit ? qc : 1 - qc);
  }
  const logGeoMean = logSum / peerConfidences.length;

  return clamp(100 * (Math.log2(outcomeP) - logGeoMean), SCORE_MIN, SCORE_MAX);
}

export interface CurrencySplit {
  /* Renown += max(0, S). Monotonic, permanent, unlocks capabilities. */
  renown: number;
  /* Season Rating += S. Signed, resets each season, drives standings. */
  seasonRating: number;
}

/* The two currencies (section 9.3).

   This is the whole answer to "should being wrong cost you": yes, but not from
   the same pot. Renown is a permanent legacy that can never be taken away, so
   the system stays safe to play and a bad month cannot erase a good year.
   Season Rating carries the real stakes, so a Call still means something.

   Renown must never fall. If this function ever returns a negative renown the
   ladder is broken, which is why it is asserted here and in the SQL: the
   apply_call_score function takes greatest(p_score, 0) independently. */
export function currencySplit(score: number): CurrencySplit {
  const s = clamp(Math.round(score), SCORE_MIN, SCORE_MAX);
  return { renown: Math.max(0, s), seasonRating: s };
}

/* Horizon in years for the realm's three Call windows. Used both to freeze
   pi_0 at creation and to decide when a Call has matured. */
export const HORIZON_DAYS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
};

export function horizonYears(timeframe: string): number {
  const days = HORIZON_DAYS[timeframe] ?? HORIZON_DAYS["24h"];
  return days / 365;
}

/* The share of the flat participation award a resolved Call keeps.

   The existing economy pays a flat 40 points and 25 glory for any Call that
   lands, which is exactly the low-information spam that section 9.5 wants
   nullified: five trivially easy Calls a day, uncapped, is a farm. Scaling the
   flat award by the difficulty the Call actually carried leaves a hard, well
   called win paying what it always did and drops a coin-flip win to nearly
   nothing, with no intent detection required. */
export function difficultyWeight(score: number): number {
  return clamp(score, 0, SCORE_MAX) / SCORE_MAX;
}
