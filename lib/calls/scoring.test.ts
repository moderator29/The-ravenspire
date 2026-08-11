import { describe, it, expect } from "vitest";
import {
  BASELINE_MAX,
  BASELINE_MIN,
  CONFIDENCE_MAX,
  CONFIDENCE_MIN,
  MIN_PEERS,
  SCORE_MAX,
  SCORE_MIN,
  callScore,
  clamp,
  currencySplit,
  difficultyWeight,
  erf,
  horizonYears,
  impliedBaseline,
  normalCdf,
  peerScore,
} from "@/lib/calls/scoring";

/* These numbers decide how much permanent Renown a Call mints. Renown never
   falls, so an error here cannot be undone by a later correction: it can only
   be inflated away. That is the reason this file exists. */

describe("erf", () => {
  it("is exactly zero at zero and odd about it", () => {
    /* Exactness at the origin is not cosmetic: it is what makes a threshold of
       zero produce a baseline of exactly one half, which is the coin flip every
       V1 Call in the database implicitly asked for. */
    expect(erf(0)).toBe(0);
    expect(erf(-1.3)).toBeCloseTo(-erf(1.3), 12);
  });

  it("matches known values within the Abramowitz-Stegun error bound", () => {
    /* Reference values, erf(x) to 9 decimal places. */
    const table: [number, number][] = [
      [0.1, 0.112462916],
      [0.5, 0.520499878],
      [1.0, 0.842700793],
      [1.5, 0.966105146],
      [2.0, 0.995322265],
      [3.0, 0.999977910],
    ];
    for (const [x, expected] of table) {
      expect(Math.abs(erf(x) - expected)).toBeLessThan(1.5e-7);
    }
  });

  it("saturates rather than overflowing", () => {
    expect(erf(40)).toBeCloseTo(1, 12);
    expect(erf(-40)).toBeCloseTo(-1, 12);
    expect(erf(Infinity)).toBe(1);
    expect(erf(-Infinity)).toBe(-1);
  });
});

describe("normalCdf", () => {
  it("is one half at the mean", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 12);
  });

  it("matches the standard normal table", () => {
    /* Phi(x) to 7 decimal places. */
    const table: [number, number][] = [
      [-3, 0.0013499],
      [-2, 0.0227501],
      [-1.959964, 0.025],
      [-1, 0.1586553],
      [-0.5, 0.3085375],
      [0.5, 0.6914625],
      [1, 0.8413447],
      [1.644854, 0.95],
      [2, 0.9772499],
      [3, 0.9986501],
    ];
    for (const [x, expected] of table) {
      expect(normalCdf(x)).toBeCloseTo(expected, 6);
    }
  });

  it("is symmetric", () => {
    for (const x of [0.25, 0.8, 1.7, 2.9]) {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 10);
    }
  });

  it("is monotonically increasing", () => {
    let previous = -1;
    for (let x = -4; x <= 4; x += 0.1) {
      const value = normalCdf(x);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });
});

describe("impliedBaseline (pi_0)", () => {
  const t24h = horizonYears("24h");

  it("is a coin flip when no move at all is required", () => {
    expect(
      impliedBaseline({ threshold: 0, horizonYears: t24h, sigma: 0.8, direction: "up" })
    ).toBeCloseTo(0.5, 6);
    expect(
      impliedBaseline({ threshold: 0, horizonYears: t24h, sigma: 0.8, direction: "down" })
    ).toBeCloseTo(0.5, 6);
  });

  it("prices a trivial move on a major as very close to a coin flip", () => {
    /* BTC at roughly 40% annualized volatility, asked to move 0.1% in a day.

       Section 9.1 illustrates this Call as getting "a pi_0 near 1". It does
       not, and the formula the same section specifies is the one that is right:
       on a driftless walk the chance of any upward move is a half, and a
       further 0.1% barely moves it. The property the document actually wants,
       that this Call cannot be worth much, holds for a different reason: a
       member cannot state a confidence far above a baseline that is already
       near a half without also risking the matching penalty. */
    const pi0 = impliedBaseline({
      threshold: 0.001,
      horizonYears: t24h,
      sigma: 0.4,
      direction: "up",
    });
    expect(pi0).toBeGreaterThan(0.47);
    expect(pi0).toBeLessThan(0.5);

    /* The confidence floor of 0.55 means a member cannot even state a baseline
       this low, so the least they can claim is already a small overstatement.
       Overstating barely pays, and a miss costs slightly more than a hit pays,
       so a member with no edge nets nothing across a run of them. */
    const landed = callScore({ confidence: 0.55, baseline: pi0, hit: true });
    const missed = callScore({ confidence: 0.55, baseline: pi0, hit: false });
    expect(landed).toBeLessThan(25);
    expect(landed + missed).toBeLessThan(0);
  });

  it("makes a large move on a volatile token rare", () => {
    /* A fresh memecoin at 300% annualized volatility asked for +40% in a day. */
    const pi0 = impliedBaseline({
      threshold: 0.4,
      horizonYears: t24h,
      sigma: 3,
      direction: "up",
    });
    expect(pi0).toBeGreaterThan(0);
    expect(pi0).toBeLessThan(0.05);
  });

  it("separates the same Call on tokens of different volatility", () => {
    const stable = impliedBaseline({
      threshold: 0.4,
      horizonYears: t24h,
      sigma: 0.4,
      direction: "up",
    });
    const wild = impliedBaseline({
      threshold: 0.4,
      horizonYears: t24h,
      sigma: 3,
      direction: "up",
    });
    /* Difficulty is graded with no crowd and no admin work: the same claim is
       far harder on the calm token. */
    expect(stable).toBeLessThan(wild);
  });

  it("falls as the required move grows and rises as the horizon lengthens", () => {
    const sigma = 1.2;
    let previous = 1;
    for (const threshold of [0.05, 0.1, 0.2, 0.4, 0.8]) {
      const pi0 = impliedBaseline({ threshold, horizonYears: t24h, sigma, direction: "up" });
      /* Not strictly decreasing at the tail: a 40% move in a day on a token at
         120% annualized volatility is already past the probability floor, and
         everything beyond it sits on the floor too. */
      expect(pi0).toBeLessThanOrEqual(previous);
      previous = pi0;
    }
    expect(
      impliedBaseline({ threshold: 0.05, horizonYears: t24h, sigma, direction: "up" })
    ).toBeGreaterThan(
      impliedBaseline({ threshold: 0.2, horizonYears: t24h, sigma, direction: "up" })
    );

    const day = impliedBaseline({ threshold: 0.2, horizonYears: t24h, sigma, direction: "up" });
    const week = impliedBaseline({
      threshold: 0.2,
      horizonYears: horizonYears("7d"),
      sigma,
      direction: "up",
    });
    const month = impliedBaseline({
      threshold: 0.2,
      horizonYears: horizonYears("30d"),
      sigma,
      direction: "up",
    });
    expect(week).toBeGreaterThan(day);
    expect(month).toBeGreaterThan(week);
  });

  it("treats a down Call as the mirror of an up Call in log space", () => {
    const sigma = 1.5;
    /* A 50% fall and a 100% rise are the same distance in log space, so they
       must carry the same baseline. */
    const down = impliedBaseline({
      threshold: 0.5,
      horizonYears: t24h,
      sigma,
      direction: "down",
    });
    const up = impliedBaseline({ threshold: 1, horizonYears: t24h, sigma, direction: "up" });
    expect(down).toBeCloseTo(up, 6);
  });

  it("holds a fall to zero at the floor rather than returning zero", () => {
    for (const threshold of [1, 1.5, 4]) {
      expect(
        impliedBaseline({ threshold, horizonYears: t24h, sigma: 2, direction: "down" })
      ).toBe(BASELINE_MIN);
    }
  });

  it("never leaves the probability band, across every plausible input", () => {
    for (const sigma of [0.05, 0.2, 0.5, 1, 2, 5, 20]) {
      for (const threshold of [0, 0.001, 0.01, 0.1, 0.5, 2, 10]) {
        for (const tf of ["24h", "7d", "30d"]) {
          for (const direction of ["up", "down"] as const) {
            const pi0 = impliedBaseline({
              threshold,
              horizonYears: horizonYears(tf),
              sigma,
              direction,
            });
            expect(Number.isFinite(pi0)).toBe(true);
            expect(pi0).toBeGreaterThanOrEqual(BASELINE_MIN);
            expect(pi0).toBeLessThanOrEqual(BASELINE_MAX);
          }
        }
      }
    }
  });

  it("refuses to rate a Call with no real volatility behind it", () => {
    /* There is no default sigma anywhere in the system. A missing or nonsense
       measurement has to surface as not-a-number so the Call is refused rather
       than sealed against an invented difficulty. */
    for (const sigma of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        Number.isNaN(
          impliedBaseline({ threshold: 0.1, horizonYears: 1 / 365, sigma, direction: "up" })
        )
      ).toBe(true);
    }
    expect(
      Number.isNaN(
        impliedBaseline({ threshold: 0.1, horizonYears: 0, sigma: 1, direction: "up" })
      )
    ).toBe(true);
    expect(
      Number.isNaN(
        impliedBaseline({ threshold: -0.1, horizonYears: 1 / 365, sigma: 1, direction: "up" })
      )
    ).toBe(true);
  });
});

describe("callScore (S)", () => {
  it("scores nothing for stating what the baseline already said", () => {
    for (const p of [0.55, 0.7, 0.9, 0.99]) {
      expect(callScore({ confidence: p, baseline: p, hit: true })).toBeCloseTo(0, 10);
      expect(callScore({ confidence: p, baseline: p, hit: false })).toBeCloseTo(0, 10);
    }
  });

  it("reproduces the worked examples in section 9.2", () => {
    expect(callScore({ confidence: 0.7, baseline: 0.5, hit: true })).toBeCloseTo(48.54, 2);
    expect(callScore({ confidence: 0.7, baseline: 0.5, hit: false })).toBeCloseTo(-73.7, 1);
    expect(callScore({ confidence: 0.99, baseline: 0.99, hit: true })).toBeCloseTo(0, 10);
  });

  it("does NOT pay for being wrong about a hard Call", () => {
    /* The regression this whole correction exists for. Section 9.2 written
       literally divides by pi_0 rather than the baseline probability of the
       realized outcome, which scores 100 * log2(0.3 / 0.1) = +158 for missing,
       clamps it to the maximum, and makes losing an absurd Call the single most
       profitable action in the realm. */
    const missed = callScore({ confidence: 0.7, baseline: 0.1, hit: false });
    expect(missed).toBeLessThan(0);
    expect(missed).toBe(SCORE_MIN);

    const landed = callScore({ confidence: 0.7, baseline: 0.1, hit: true });
    expect(landed).toBe(SCORE_MAX);
  });

  it("is always worse to miss than to land, whenever the member backed their Call", () => {
    /* "Backed" means stated more confidence than the baseline, which is the
       only case in which a Call is a claim at all. A member who states LESS
       than the baseline is betting against their own Call, and the score
       correctly rewards them for being wrong, because they were closer to the
       truth than the baseline was. */
    for (let baseline = 0.02; baseline < 0.99; baseline += 0.02) {
      for (const confidence of [0.55, 0.7, 0.85, 0.99]) {
        if (confidence <= baseline) continue;
        const landed = callScore({ confidence, baseline, hit: true });
        const missed = callScore({ confidence, baseline, hit: false });
        expect(missed).toBeLessThan(landed);
      }
    }
  });

  it("pays more for the same outcome when the Call was harder", () => {
    let previous = -Infinity;
    for (const baseline of [0.9, 0.7, 0.5, 0.3, 0.15]) {
      const score = callScore({ confidence: 0.8, baseline, hit: true });
      /* Not strictly increasing once the clamp is reached, which is the clamp
         working rather than a flat spot in the maths. */
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
    expect(callScore({ confidence: 0.8, baseline: 0.3, hit: true })).toBeGreaterThan(
      callScore({ confidence: 0.8, baseline: 0.7, hit: true })
    );
  });

  it("clamps at both bounds and never escapes them", () => {
    expect(callScore({ confidence: 0.99, baseline: BASELINE_MIN, hit: true })).toBe(SCORE_MAX);
    /* Near-certainty about something the baseline called impossible, which then
       fails, is the worst outcome available. */
    expect(callScore({ confidence: 0.99, baseline: BASELINE_MIN, hit: false })).toBe(SCORE_MIN);
    /* Agreeing with a baseline that was already near-certain pays almost
       nothing when it lands, which is the whole point of a difficulty
       baseline. */
    expect(callScore({ confidence: 0.99, baseline: BASELINE_MAX, hit: true })).toBeCloseTo(
      100 * Math.log2(0.99 / BASELINE_MAX),
      6
    );

    for (let baseline = BASELINE_MIN; baseline < 1; baseline += 0.011) {
      for (let confidence = CONFIDENCE_MIN; confidence <= CONFIDENCE_MAX; confidence += 0.02) {
        for (const hit of [true, false]) {
          const score = callScore({ confidence, baseline, hit });
          expect(score).toBeGreaterThanOrEqual(SCORE_MIN);
          expect(score).toBeLessThanOrEqual(SCORE_MAX);
          expect(Number.isFinite(score)).toBe(true);
        }
      }
    }
  });

  it("does not spare an 85% Call from the floor, contrary to section 9.3", () => {
    /* Section 9.3 claims "a member who never exceeds 85% confidence cannot
       approach the floor". That is not true of the formula the same section
       specifies: 85% confidence against an even baseline is
       100 * log2(0.15 / 0.5) = -174, which the clamp takes to the floor exactly.

       The claim is wrong, the behaviour is right, and the clamp is what makes
       it safe: no single Call can cost more than one Call's worth of Season
       Rating, and Renown is untouched either way. Asserted here so that if
       anyone later tunes the bounds to make 9.3's sentence true, they do it on
       purpose. */
    expect(callScore({ confidence: 0.85, baseline: 0.5, hit: false })).toBe(SCORE_MIN);
    /* The confidence floor is what genuinely limits exposure: the least
       confident Call available loses well under half the maximum. */
    expect(callScore({ confidence: CONFIDENCE_MIN, baseline: 0.5, hit: false })).toBeGreaterThan(
      SCORE_MIN / 2
    );
  });

  it("clamps an out-of-band confidence rather than trusting it", () => {
    /* Creation rejects these; the scorer must not amplify one that reaches it
       through a hand-edited row. */
    expect(callScore({ confidence: 1, baseline: 0.5, hit: true })).toBe(
      callScore({ confidence: CONFIDENCE_MAX, baseline: 0.5, hit: true })
    );
    expect(callScore({ confidence: 0, baseline: 0.5, hit: true })).toBe(
      callScore({ confidence: CONFIDENCE_MIN, baseline: 0.5, hit: true })
    );
  });

  it("returns a neutral score for an unscoreable Call", () => {
    expect(callScore({ confidence: Number.NaN, baseline: 0.5, hit: true })).toBe(0);
    expect(callScore({ confidence: 0.7, baseline: Number.NaN, hit: true })).toBe(0);
  });
});

describe("peerScore", () => {
  it("needs a crowd, not a conversation", () => {
    expect(
      Number.isNaN(peerScore({ confidence: 0.8, peerConfidences: [0.6, 0.7], hit: true }))
    ).toBe(true);
    expect(
      Number.isFinite(
        peerScore({ confidence: 0.8, peerConfidences: [0.6, 0.7, 0.65], hit: true })
      )
    ).toBe(true);
    expect(MIN_PEERS).toBe(3);
  });

  it("scores nothing for agreeing exactly with the crowd", () => {
    expect(
      peerScore({ confidence: 0.7, peerConfidences: [0.7, 0.7, 0.7], hit: true })
    ).toBeCloseTo(0, 10);
    expect(
      peerScore({ confidence: 0.7, peerConfidences: [0.7, 0.7, 0.7], hit: false })
    ).toBeCloseTo(0, 10);
  });

  it("rewards the member who was more right than the crowd", () => {
    const bolder = peerScore({
      confidence: 0.9,
      peerConfidences: [0.6, 0.6, 0.6],
      hit: true,
    });
    expect(bolder).toBeGreaterThan(0);
    /* And punishes the same boldness when it does not land. */
    expect(
      peerScore({ confidence: 0.9, peerConfidences: [0.6, 0.6, 0.6], hit: false })
    ).toBeLessThan(0);
  });

  it("stays inside the score bounds", () => {
    const extreme = peerScore({
      confidence: 0.99,
      peerConfidences: [0.99, 0.99, 0.99, 0.99],
      hit: false,
    });
    expect(extreme).toBeGreaterThanOrEqual(SCORE_MIN);
    expect(extreme).toBeLessThanOrEqual(SCORE_MAX);
  });
});

describe("currencySplit: the two currencies", () => {
  it("never lets Renown fall", () => {
    for (let score = SCORE_MIN; score <= SCORE_MAX; score += 1) {
      expect(currencySplit(score).renown).toBeGreaterThanOrEqual(0);
    }
  });

  it("lets Season Rating go negative", () => {
    expect(currencySplit(-40).seasonRating).toBe(-40);
    expect(currencySplit(-40).renown).toBe(0);
  });

  it("pays both currencies equally on a win", () => {
    expect(currencySplit(63)).toEqual({ renown: 63, seasonRating: 63 });
  });

  it("clamps and rounds whatever it is handed", () => {
    expect(currencySplit(1000)).toEqual({ renown: 100, seasonRating: 100 });
    expect(currencySplit(-1000)).toEqual({ renown: 0, seasonRating: -100 });
    expect(currencySplit(48.6)).toEqual({ renown: 49, seasonRating: 49 });
  });

  it("means a bad month can never erase a good year", () => {
    /* Ten maximal losses in a row cost the whole season rating and not one
       point of Renown. This is the property section 9.3 is built around. */
    let renown = 500;
    let rating = 500;
    for (let i = 0; i < 10; i++) {
      const split = currencySplit(SCORE_MIN);
      renown += split.renown;
      rating += split.seasonRating;
    }
    expect(renown).toBe(500);
    expect(rating).toBe(-500);
  });
});

describe("difficultyWeight", () => {
  it("pays nothing flat for a coin-flip Call and full for a maximal one", () => {
    expect(difficultyWeight(0)).toBe(0);
    expect(difficultyWeight(-50)).toBe(0);
    expect(difficultyWeight(SCORE_MAX)).toBe(1);
    expect(difficultyWeight(50)).toBeCloseTo(0.5, 10);
  });
});

describe("clamp and horizons", () => {
  it("clamps, including the not-a-number case", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 0, 10)).toBe(0);
  });

  it("converts the realm's three windows to years", () => {
    expect(horizonYears("24h")).toBeCloseTo(1 / 365, 12);
    expect(horizonYears("7d")).toBeCloseTo(7 / 365, 12);
    expect(horizonYears("30d")).toBeCloseTo(30 / 365, 12);
    /* An unknown window falls back to the shortest, which is the most
       conservative choice: it makes the Call look harder, not easier. */
    expect(horizonYears("nonsense")).toBeCloseTo(1 / 365, 12);
  });
});
