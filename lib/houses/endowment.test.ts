import { describe, it, expect } from "vitest";
import {
  DAILY_ENDOWMENT_CAP,
  ENDOWMENT_TREASURY_BPS,
  MIN_ENDOWMENT,
  TREASURY_POWERS,
  maxEndowmentFor,
  planEndowment,
  splitEndowment,
} from "@/lib/houses/endowment";
import { HOUSE_TITHE_BPS, MAX_STAKE, MIN_STAKE } from "@/lib/calls/stake";

/* An endowment is a member handing over a balance they earned. Every test here
   is a way that could go wrong at their expense or at the realm's: a POINT
   invented on the way in, a POINT lost to rounding, a daily ceiling that can be
   walked around by sending the gift in pieces, or a door into a treasury that
   is cheaper than the one the whole sink design is built on. */

describe("splitEndowment", () => {
  it("pools half and destroys half", () => {
    expect(splitEndowment(1000)).toEqual({
      committed: 1000,
      toTreasury: 500,
      destroyed: 500,
    });
  });

  /* THE ROUNDING REMAINDER HAS TO GO SOMEWHERE, AND IT GOES TO THE BURN. Two
     independent roundings would let the two halves disagree with the whole, and
     a remainder handed to the treasury would make an odd gift very slightly
     better value than an even one, which is the sort of thing somebody finds. */
  it("gives an odd remainder to the burn, never to the treasury", () => {
    const s = splitEndowment(101);
    expect(s.toTreasury).toBe(50);
    expect(s.destroyed).toBe(51);
    expect(s.toTreasury + s.destroyed).toBe(101);
  });

  it("adds back up to the whole at every legal amount", () => {
    for (let n = MIN_ENDOWMENT; n <= DAILY_ENDOWMENT_CAP; n += 1) {
      const s = splitEndowment(n);
      expect(s.toTreasury + s.destroyed).toBe(n);
      expect(s.destroyed).toBeGreaterThanOrEqual(s.toTreasury);
    }
  });

  it("refuses a fractional or negative gift rather than rounding it", () => {
    expect(() => splitEndowment(50.5)).toThrow(/whole, positive/);
    expect(() => splitEndowment(-100)).toThrow(/whole, positive/);
  });

  /* NO HOUSE MINTS VALUE OUT OF NOTHING, stated as arithmetic. Whatever a
     member gives up, the treasury gains strictly less. */
  it("never pools more than the member gave up", () => {
    for (const n of [50, 51, 99, 100, 333, 999, 1000]) {
      const s = splitEndowment(n);
      expect(s.toTreasury).toBeLessThan(n);
      expect(s.toTreasury + s.destroyed).toBe(s.committed);
    }
  });
});

describe("the terms are the same terms a burned stake gets", () => {
  /* Two doors into a treasury with two different rates is an arbitrage, and
     everybody finds the cheaper one. There is one rate. */
  it("pools at exactly the stake tithe", () => {
    expect(ENDOWMENT_TREASURY_BPS).toBe(HOUSE_TITHE_BPS);
  });

  it("holds a day's gifts to the same ceiling a single stake has", () => {
    expect(DAILY_ENDOWMENT_CAP).toBe(MAX_STAKE);
  });

  it("sets the floor so the pooled half is worth at least a minimum stake", () => {
    expect(MIN_ENDOWMENT).toBe(MIN_STAKE * 2);
    expect(splitEndowment(MIN_ENDOWMENT).toTreasury).toBeGreaterThanOrEqual(MIN_STAKE);
  });
});

describe("planEndowment", () => {
  const sworn = { balance: 5_000, committedToday: 0, sworn: true };

  it("takes a plain gift", () => {
    const p = planEndowment({ raw: 400, ...sworn });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.split).toEqual({ committed: 400, toTreasury: 200, destroyed: 200 });
  });

  it("refuses a member who is not sworn to the House", () => {
    const p = planEndowment({ raw: 400, balance: 5_000, committedToday: 0, sworn: false });
    expect(p).toMatchObject({ ok: false, reason: "not_sworn" });
  });

  it("refuses anything that is not a number", () => {
    for (const raw of ["400", null, undefined, {}, NaN, Infinity]) {
      expect(planEndowment({ raw, ...sworn })).toMatchObject({
        ok: false,
        reason: "not_a_number",
      });
    }
  });

  /* A NEGATIVE GIFT WOULD BE A WITHDRAWAL. Nothing in this design lets a member
     take POINTS out of a House, and the arithmetic must not be the place that
     opens one: a negative committed amount would credit the member and debit
     the treasury through a route that was never meant to move money that way. */
  it("refuses a negative amount rather than paying it out", () => {
    expect(planEndowment({ raw: -400, ...sworn })).toMatchObject({
      ok: false,
      reason: "not_positive",
    });
    expect(planEndowment({ raw: 0, ...sworn })).toMatchObject({
      ok: false,
      reason: "not_positive",
    });
    /* And a fraction that truncates to nothing is nothing, not a rounding up. */
    expect(planEndowment({ raw: 0.9, ...sworn })).toMatchObject({
      ok: false,
      reason: "not_positive",
    });
  });

  it("refuses below the floor", () => {
    expect(planEndowment({ raw: MIN_ENDOWMENT - 1, ...sworn })).toMatchObject({
      ok: false,
      reason: "below_minimum",
    });
    expect(planEndowment({ raw: MIN_ENDOWMENT, ...sworn }).ok).toBe(true);
  });

  it("refuses more than the member holds", () => {
    expect(
      planEndowment({ raw: 900, balance: 400, committedToday: 0, sworn: true })
    ).toMatchObject({ ok: false, reason: "insufficient" });
  });

  it("truncates a fractional amount downward rather than committing a POINT not offered", () => {
    const p = planEndowment({ raw: 400.9, ...sworn });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.split.committed).toBe(400);
  });
});

describe("the daily ceiling cannot be walked around", () => {
  it("refuses a single gift above the day's ceiling", () => {
    expect(
      planEndowment({ raw: DAILY_ENDOWMENT_CAP + 1, balance: 99_999, committedToday: 0, sworn: true })
    ).toMatchObject({ ok: false, reason: "over_daily_cap" });
  });

  /* THE SPLIT GIFT. Sending the ceiling in ten pieces is the obvious way past a
     per act limit, which is why the limit is per day and counts what has
     already gone. */
  it("counts what has already gone today", () => {
    expect(
      planEndowment({ raw: 200, balance: 99_999, committedToday: 900, sworn: true })
    ).toMatchObject({ ok: false, reason: "over_daily_cap" });
    expect(
      planEndowment({ raw: 100, balance: 99_999, committedToday: 900, sworn: true }).ok
    ).toBe(true);
  });

  it("counts gifts to every House against one allowance", () => {
    /* committedToday is the member's total across banners, not per banner, so a
       member sworn through a season of oaths cannot multiply their ceiling by
       the number of Houses they have belonged to. */
    const p = planEndowment({
      raw: MIN_ENDOWMENT,
      balance: 99_999,
      committedToday: DAILY_ENDOWMENT_CAP,
      sworn: true,
    });
    expect(p).toMatchObject({ ok: false, reason: "over_daily_cap" });
  });

  it("treats a nonsense running total as zero rather than as headroom", () => {
    expect(
      planEndowment({ raw: 400, balance: 5_000, committedToday: -10_000, sworn: true }).ok
    ).toBe(true);
  });
});

describe("maxEndowmentFor", () => {
  it("is bounded by the balance, the day's remainder and the ceiling at once", () => {
    expect(maxEndowmentFor(99_999, 0)).toBe(DAILY_ENDOWMENT_CAP);
    expect(maxEndowmentFor(300, 0)).toBe(300);
    expect(maxEndowmentFor(99_999, 700)).toBe(300);
  });

  it("is zero rather than a control that moves and then refuses", () => {
    expect(maxEndowmentFor(MIN_ENDOWMENT - 1, 0)).toBe(0);
    expect(maxEndowmentFor(99_999, DAILY_ENDOWMENT_CAP)).toBe(0);
    expect(maxEndowmentFor(99_999, DAILY_ENDOWMENT_CAP - MIN_ENDOWMENT + 1)).toBe(0);
  });

  it("always names an amount planEndowment will actually accept", () => {
    for (const [balance, given] of [
      [99_999, 0],
      [300, 0],
      [99_999, 700],
      [612, 133],
    ]) {
      const max = maxEndowmentFor(balance, given);
      if (max === 0) continue;
      expect(
        planEndowment({ raw: max, balance, committedToday: given, sworn: true }).ok
      ).toBe(true);
    }
  });
});

describe("what a treasury may and may not do", () => {
  it("states both halves, and the cannots outnumber the cans", () => {
    expect(TREASURY_POWERS.can.length).toBeGreaterThan(0);
    expect(TREASURY_POWERS.cannot.length).toBeGreaterThan(TREASURY_POWERS.can.length);
  });

  it("refuses, in writing, the three things that would break the design", () => {
    const cannot = TREASURY_POWERS.cannot.join(" ").toLowerCase();
    /* Minting, buying standing, and being cashed out. */
    expect(cannot).toMatch(/seeded|topped up/);
    expect(cannot).toMatch(/renown or glory/);
    expect(cannot).toMatch(/withdrawn to a wallet/);
  });
});
