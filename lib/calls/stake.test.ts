import { describe, it, expect } from "vitest";
import {
  HOUSE_TITHE_BPS,
  MAX_BONUS_RATE,
  MAX_STAKE,
  MIN_STAKE,
  checkStake,
  maxStakeFor,
  stakeBonus,
  stakeOutcome,
  stakeOutlook,
} from "@/lib/calls/stake";
import { callScore } from "@/lib/calls/scoring";

/* A stake is a member's real balance leaving their account on a promise. Every
   test here is a way that promise could be broken: a payout that does not match
   what the composer showed, a burn that quietly mints points somewhere, a bound
   that lets one Call move more than the realm can absorb, or a settlement that
   pays twice. None of it can be walked back once it has run, which is why the
   arithmetic is pinned this hard. */

describe("stake bounds", () => {
  it("refuses a stake below the floor rather than rounding it up", () => {
    /* Rounding up would take more than the member asked to risk. Rounding down
       to zero would seal a Call they believe they backed. Both are worse than
       a refusal they can see and correct. */
    const result = checkStake(MIN_STAKE - 1, 100_000);
    expect(result.ok).toBe(false);
  });

  it("refuses a stake above the ceiling rather than clamping it", () => {
    /* The clamp is the dangerous version: a member typing 5,000 who is silently
       charged 1,000 has had a number changed under them on a money movement. */
    const result = checkStake(MAX_STAKE + 1, 100_000);
    expect(result.ok).toBe(false);
  });

  it("refuses a stake larger than the balance", () => {
    expect(checkStake(500, 499).ok).toBe(false);
    expect(checkStake(500, 500)).toEqual({ ok: true, stake: 500 });
  });

  it("treats no stake at all as a valid unstaked Call", () => {
    /* Every client shipping today sends no stake, and must keep sealing
       exactly the Call it always did. */
    expect(checkStake(undefined, 0)).toEqual({ ok: true, stake: 0 });
    expect(checkStake(null, 0)).toEqual({ ok: true, stake: 0 });
    expect(checkStake(0, 0)).toEqual({ ok: true, stake: 0 });
  });

  it("refuses anything that is not a finite number", () => {
    /* The stake arrives as JSON from a client. A NaN reaching the escrow would
       become a NULL or a zero in Postgres depending on the driver, and either
       one seals a Call whose stake nobody can account for. */
    for (const bad of ["100", NaN, Infinity, -Infinity, {}, []]) {
      expect(checkStake(bad, 100_000).ok).toBe(false);
    }
  });

  it("refuses a negative stake, which would pay the member to make a Call", () => {
    expect(checkStake(-100, 100_000).ok).toBe(false);
  });

  it("truncates a fractional stake rather than storing one", () => {
    /* POINTS are integers everywhere else in the realm. A fractional stake
       would be the only non-integer balance movement in the product and would
       violate the call_stakes integer column. */
    expect(checkStake(100.9, 100_000)).toEqual({ ok: true, stake: 100 });
  });

  it("keeps the ceiling well under a day of honest earning at the top end", () => {
    /* The point of a ceiling is that the leaderboard cannot be bought by
       whoever has the deepest balance. If this ever rises past the realm's
       daily allowances combined, one Call starts outweighing a day of play. */
    expect(MAX_STAKE).toBeGreaterThan(MIN_STAKE * 10);
    expect(MAX_STAKE).toBeLessThanOrEqual(1000);
  });

  it("offers no stake at all to a member who cannot afford the floor", () => {
    /* Zero is an honest "not yet". A ceiling of 24 would render a slider that
       moves and then has every position refused by the server. */
    expect(maxStakeFor(MIN_STAKE - 1)).toBe(0);
    expect(maxStakeFor(MIN_STAKE)).toBe(MIN_STAKE);
    expect(maxStakeFor(10_000)).toBe(MAX_STAKE);
    expect(maxStakeFor(0)).toBe(0);
  });
});

describe("stakeBonus", () => {
  it("pays nothing at all for a Call that beat no baseline", () => {
    /* A score of zero means the member stated exactly what the model already
       said. There is no skill in it and it must not pay. */
    expect(stakeBonus(1000, 0)).toBe(0);
  });

  it("pays nothing for a negative score, even though the Call landed", () => {
    /* A member who states less confidence than the baseline and then gets
       lucky has not out-forecast anything. Renown and Season Rating already
       reward the calibration; the stake was a bet on the outcome backed at
       worse than the coin's own odds, so it comes back bare. */
    expect(stakeBonus(1000, -60)).toBe(0);
  });

  it("returns the stake again at the very top and never more", () => {
    expect(stakeBonus(1000, 100)).toBe(1000);
    /* The score is already clamped to 100 upstream. If a caller ever passes a
       raw unclamped score, the payout must not follow it. */
    expect(stakeBonus(1000, 100_000)).toBe(1000);
    expect(MAX_BONUS_RATE).toBe(1);
  });

  it("agrees with Postgres numeric on the halves, which floats do not", () => {
    /* THE BUG THIS EXISTS TO CATCH. Writing the bonus as
       `stake * difficultyWeight(score)` divides by 100 first, so a stake of 10
       at a score of 15 computes 1.4999999999999998 in a double and rounds DOWN
       to 1, while `round(10 * 15 / 100)` in Postgres numeric computes exactly
       1.50 and rounds UP to 2. The composer would promise one number and the
       settlement job would pay another, on a payout, with no visible cause.
       Every case below is a value where the two spellings disagree. */
    const halves: [number, number, number][] = [
      [10, 15, 2],
      [10, 35, 4],
      [30, 45, 14],
      [70, 45, 32],
      [10, 55, 6],
    ];
    for (const [stake, score, expected] of halves) {
      expect(stakeBonus(stake, score)).toBe(expected);
      /* And the value Postgres will compute, spelled the way the SQL does. */
      expect(Math.round((stake * score) / 100)).toBe(expected);
    }
  });

  it("scales linearly in the stake", () => {
    expect(stakeBonus(100, 50)).toBe(50);
    expect(stakeBonus(200, 50)).toBe(100);
    expect(stakeBonus(400, 50)).toBe(200);
  });

  it("pays nothing on a zero stake whatever the score", () => {
    expect(stakeBonus(0, 100)).toBe(0);
  });
});

describe("stakeOutcome", () => {
  it("returns the stake and the bonus when the Call lands", () => {
    const out = stakeOutcome({
      stake: 500,
      score: 60,
      verdict: "hit",
      hasHouse: true,
    });
    expect(out).toEqual({
      returned: 800,
      bonus: 300,
      burned: 0,
      tithe: 0,
      destroyed: 0,
    });
  });

  it("burns the whole stake when the Call misses, and returns nothing", () => {
    /* If `returned` were ever non-zero on a miss the sink would not be a sink,
       and the composer's "this is what you lose" would be a lie. */
    const out = stakeOutcome({
      stake: 500,
      score: -80,
      verdict: "miss",
      hasHouse: true,
    });
    expect(out.returned).toBe(0);
    expect(out.bonus).toBe(0);
    expect(out.burned).toBe(500);
  });

  it("destroys the half of a burn that does not reach the House", () => {
    /* This is the test that says a burn is genuinely a burn. The tithe and the
       destroyed remainder have to add back to exactly the stake: any other sum
       means the realm minted points at settlement or lost track of them. */
    for (const stake of [25, 33, 100, 999, 1000]) {
      const out = stakeOutcome({
        stake,
        score: -100,
        verdict: "miss",
        hasHouse: true,
      });
      expect(out.tithe + out.destroyed).toBe(stake);
      expect(out.destroyed).toBeGreaterThan(0);
      expect(out.tithe).toBeLessThan(stake);
    }
  });

  it("destroys the entire burn for a member sworn to no House", () => {
    /* There is nowhere for the tithe to go, and inventing a realm-wide pot to
       catch it would be inventing a number. */
    const out = stakeOutcome({
      stake: 400,
      score: -100,
      verdict: "miss",
      hasHouse: false,
    });
    expect(out.tithe).toBe(0);
    expect(out.destroyed).toBe(400);
  });

  it("splits exactly half at the declared tithe rate", () => {
    expect(HOUSE_TITHE_BPS).toBe(5000);
    const out = stakeOutcome({
      stake: 1000,
      score: -100,
      verdict: "miss",
      hasHouse: true,
    });
    expect(out.tithe).toBe(500);
    expect(out.destroyed).toBe(500);
  });

  it("returns the bare stake on a void, with no bonus and no burn", () => {
    /* A void is the realm failing to settle, not the member being wrong. They
       are neither punished for the silence nor paid for a claim that never
       resolved. */
    const out = stakeOutcome({
      stake: 300,
      score: 100,
      verdict: "void",
      hasHouse: true,
    });
    expect(out).toEqual({
      returned: 300,
      bonus: 0,
      burned: 0,
      tithe: 0,
      destroyed: 0,
    });
  });

  it("does nothing at all for an unstaked Call", () => {
    for (const verdict of ["hit", "miss", "void"] as const) {
      expect(
        stakeOutcome({ stake: 0, score: 100, verdict, hasHouse: true })
      ).toEqual({ returned: 0, bonus: 0, burned: 0, tithe: 0, destroyed: 0 });
    }
  });

  it("never returns and burns the same stake", () => {
    /* Belt and braces on the one invariant a settlement bug would break most
       expensively: the same points cannot both come back and be destroyed. */
    for (const verdict of ["hit", "miss", "void"] as const) {
      const out = stakeOutcome({ stake: 700, score: 40, verdict, hasHouse: true });
      expect(out.returned > 0 && out.burned > 0).toBe(false);
    }
  });
});

describe("the expected value of staking", () => {
  /* The reason a stake is a sink and not a second faucet. A member with no
     real edge, whose true hit rate is the baseline rather than their claim,
     must lose points on average. If this ever turns positive, staking becomes
     a way to farm POINTS by making confident claims about anything. */
  const evPerPoint = (baseline: number, stated: number, truth: number) => {
    const score = callScore({ confidence: stated, baseline, hit: true });
    const bonus = stakeBonus(1000, score) / 1000;
    return truth * (1 + bonus) - 1;
  };

  it("drains a member who states more than they can deliver", () => {
    /* Baseline 0.5, states 0.7, actually hits 0.5 of the time. */
    expect(evPerPoint(0.5, 0.7, 0.5)).toBeLessThan(0);
    /* Baseline 0.1, states 0.7, actually hits 0.1 of the time. The harder the
       claim, the more brutally overconfidence is punished. */
    expect(evPerPoint(0.1, 0.7, 0.1)).toBeLessThan(-0.5);
  });

  it("pays a member who genuinely hits what they claim", () => {
    expect(evPerPoint(0.5, 0.7, 0.7)).toBeGreaterThan(0);
    expect(evPerPoint(0.1, 0.7, 0.7)).toBeGreaterThan(0.3);
  });

  it("pays nothing extra for restating the baseline", () => {
    /* Stating exactly what the model says earns a score of zero, so the bet is
       a straight coin flip on the outcome with no bonus, which is strictly
       negative expected value. Nobody should stake on a claim they have no
       read on, and the arithmetic says so. */
    expect(evPerPoint(0.7, 0.7, 0.7)).toBeCloseTo(-0.3, 10);
  });
});

describe("stakeOutlook", () => {
  it("shows the member both sides before they commit", () => {
    const out = stakeOutlook({ stake: 200, scoreIfHit: 50 });
    expect(out).toEqual({ ifHit: 100, ifMiss: -200 });
  });

  it("shows nothing at risk when nothing is staked", () => {
    expect(stakeOutlook({ stake: 0, scoreIfHit: 100 })).toEqual({
      ifHit: 0,
      ifMiss: 0,
    });
  });

  it("never shows a gain larger than the loss", () => {
    /* The bet is symmetric at its extreme by design. A composer that could
       show "+2,000 if it lands, -1,000 if it misses" would be advertising a
       free lunch that the scoring rule does not actually offer. */
    for (const score of [0, 25, 50, 75, 100]) {
      const out = stakeOutlook({ stake: 500, scoreIfHit: score });
      expect(out.ifHit).toBeLessThanOrEqual(-out.ifMiss);
    }
  });
});
