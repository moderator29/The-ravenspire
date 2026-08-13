import { describe, it, expect } from "vitest";
import {
  HOUSE_PERKS,
  MIN_BILLED_MEMBERS,
  PARDON_CAP_PER_CALL,
  PARDON_SHARE_BPS,
  PERK_META,
  TREASURY_SPENDERS,
  activePerks,
  hasActivePerk,
  maySpendTreasury,
  pardonRefund,
  perkIsActive,
  perkMeta,
  perkPrice,
  type HousePerkView,
} from "@/lib/houses/perks";
import { HOUSE_TITHE_BPS } from "@/lib/calls/stake";

/* A House treasury is other people's burned points. Every test here is a way
   somebody could be robbed of them: a member who should not be able to spend
   spending, a perk that quietly reintroduces the headcount advantage that
   size-neutral scoring exists to remove, or a pardon that pays out more than
   the burn that funded it and empties a treasury in half the Calls it took to
   fill. */

const HOUR = 3_600_000;

function perk(over: Partial<HousePerkView> = {}): HousePerkView {
  const now = Date.now();
  return {
    slug: "the-standard",
    cost: 1000,
    starts_at: new Date(now - HOUR).toISOString(),
    expires_at: new Date(now + HOUR).toISOString(),
    allowance_remaining: null,
    actor_id: null,
    ...over,
  };
}

describe("who may spend a treasury", () => {
  it("admits the Lord and the Hand and nobody else", () => {
    /* The two computed titles, which are the top two contributors this season
       and rotate on their own when the season turns. Every other role, and the
       absence of a role, is a member who has not earned the keys. */
    expect(maySpendTreasury("lord")).toBe(true);
    expect(maySpendTreasury("hand")).toBe(true);
    for (const role of [
      "sworn",
      "master-of-ravens",
      "master-of-war",
      "chronicler",
      "recruiter",
    ]) {
      expect(maySpendTreasury(role)).toBe(false);
    }
  });

  it("refuses a member with no role at all", () => {
    /* This is the case that matters most: the route resolves a viewer's role
       by finding their OPEN oath to this House. A member of another House, or
       a signed-out reader, resolves to null, and null must never pass. */
    expect(maySpendTreasury(null)).toBe(false);
    expect(maySpendTreasury(undefined)).toBe(false);
    expect(maySpendTreasury("")).toBe(false);
  });

  it("keeps the spender list to two, so neither is a single point of failure", () => {
    expect(TREASURY_SPENDERS).toEqual(["lord", "hand"]);
  });
});

describe("perk pricing", () => {
  it("scales with headcount, so a big House gains no advantage", () => {
    /* THE POINT OF THE WHOLE PRICING MODEL. Treasury inflow scales with
       members, because more members burn more stakes. If the price did not
       scale too, a House of sixty would buy three perks for every one a House
       of twenty could afford, and the size-neutral scoring the Houses are
       built on would quietly stop being size neutral. */
    const meta = PERK_META["long-watch"];
    expect(perkPrice(meta, 60)).toBe(perkPrice(meta, 20) * 3);
    expect(perkPrice(meta, 40)).toBe(perkPrice(meta, 20) * 2);
  });

  it("charges a floor so a House of one cannot buy the catalogue for pennies", () => {
    const meta = PERK_META["the-standard"];
    expect(perkPrice(meta, 1)).toBe(meta.perMember * MIN_BILLED_MEMBERS);
    expect(perkPrice(meta, 0)).toBe(meta.perMember * MIN_BILLED_MEMBERS);
    expect(perkPrice(meta, MIN_BILLED_MEMBERS)).toBe(
      meta.perMember * MIN_BILLED_MEMBERS
    );
  });

  it("never returns a price of zero or a fraction", () => {
    /* spend_house_treasury refuses a cost of zero or less, and house_perks
       constrains cost > 0. A price that could reach zero would be a free perk
       that the database then rejects, which reads to a member as a broken
       button. */
    for (const slug of HOUSE_PERKS) {
      for (const members of [0, 1, 5, 17, 200]) {
        const price = perkPrice(PERK_META[slug], members);
        expect(price).toBeGreaterThan(0);
        expect(Number.isInteger(price)).toBe(true);
      }
    }
  });

  it("keeps every perk affordable inside a plausible season", () => {
    /* A perk nobody can ever buy is a price list, not an economy. A House of
       twenty burning even a modest number of stakes should reach the cheapest
       perk in days and the dearest in a couple of weeks. */
    const twenty = HOUSE_PERKS.map((slug) => perkPrice(PERK_META[slug], 20));
    expect(Math.min(...twenty)).toBeLessThan(2000);
    expect(Math.max(...twenty)).toBeLessThan(6000);
  });
});

describe("the catalogue", () => {
  it("describes what every perk actually does, with no empty copy", () => {
    /* A member spending a House's points is entitled to the mechanism, not a
       slogan. An empty effect string would ship a button that spends thousands
       of points and explains nothing. */
    for (const slug of HOUSE_PERKS) {
      const meta = PERK_META[slug];
      expect(meta.slug).toBe(slug);
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.effect.length).toBeGreaterThan(20);
      expect(meta.durationDays).toBeGreaterThan(0);
      expect(meta.durationDays).toBeLessThanOrEqual(90);
    }
  });

  it("resolves an unknown slug to nothing rather than to a default perk", () => {
    /* A typo resolving to the first perk in the map would charge a House for
       something nobody asked for. */
    expect(perkMeta("not-a-perk")).toBeNull();
    expect(perkMeta("")).toBeNull();
  });

  it("gives an allowance only to the perk that pays points out", () => {
    expect(PERK_META["wardens-pardon"].allowance).toBe(true);
    expect(PERK_META["the-standard"].allowance).toBe(false);
    expect(PERK_META["long-watch"].allowance).toBe(false);
  });
});

describe("the Warden's Pardon", () => {
  it("never returns more than the House received from the burn", () => {
    /* THE INVARIANT THAT KEEPS A TREASURY SOLVENT. The House is credited half
       of every burned stake (HOUSE_TITHE_BPS). If the pardon paid back more
       than half, a House running a permanent pardon would drain faster than
       its members could fill it, and the perk would be a slow way to delete a
       treasury nobody voted to delete. */
    expect(PARDON_SHARE_BPS).toBeLessThanOrEqual(HOUSE_TITHE_BPS);
    for (const burned of [25, 100, 500, 1000]) {
      const tithe = Math.floor((burned * HOUSE_TITHE_BPS) / 10000);
      expect(pardonRefund(burned, 100_000)).toBeLessThanOrEqual(tithe);
    }
  });

  it("caps a single Call so one member cannot drain a small pot", () => {
    expect(pardonRefund(1000, 100_000)).toBe(PARDON_CAP_PER_CALL);
    expect(pardonRefund(400, 100_000)).toBe(200);
  });

  it("never pays more than the allowance left", () => {
    /* The purchase ring-fences its own cost as the pot. Paying past it would
       reach into the rest of the treasury, which is exactly the unbounded
       exposure the allowance exists to prevent. */
    expect(pardonRefund(1000, 60)).toBe(60);
    expect(pardonRefund(1000, 0)).toBe(0);
    expect(pardonRefund(1000, -5)).toBe(0);
  });

  it("pays nothing when nothing burned", () => {
    expect(pardonRefund(0, 100_000)).toBe(0);
    expect(pardonRefund(-100, 100_000)).toBe(0);
  });

  it("never returns a fraction of a point", () => {
    for (const burned of [25, 33, 77, 101, 999]) {
      const refund = pardonRefund(burned, 100_000);
      expect(Number.isInteger(refund)).toBe(true);
    }
  });
});

describe("when a perk is burning", () => {
  it("is active only inside its own window", () => {
    const now = Date.now();
    expect(perkIsActive(perk(), now)).toBe(true);
    expect(
      perkIsActive(perk({ starts_at: new Date(now + HOUR).toISOString() }), now)
    ).toBe(false);
    expect(
      perkIsActive(perk({ expires_at: new Date(now - 1).toISOString() }), now)
    ).toBe(false);
  });

  it("expires exactly at its end, not a moment after", () => {
    /* A perk that stayed live on its own expiry timestamp would give every
       House a free extra tick, and the open-Call ceiling would disagree with
       the hall about whether The Long Watch was still burning. */
    const now = Date.now();
    const ends = new Date(now).toISOString();
    expect(perkIsActive(perk({ expires_at: ends }), now)).toBe(false);
    expect(perkIsActive(perk({ expires_at: ends }), now - 1)).toBe(true);
  });

  it("treats an emptied allowance as spent, even inside the window", () => {
    /* Cover that cannot pay is not cover. Rendering an exhausted pardon as
       burning would tell members they are protected when they are not. */
    expect(
      perkIsActive(
        perk({ slug: "wardens-pardon", allowance_remaining: 0 }),
        Date.now()
      )
    ).toBe(false);
    expect(
      perkIsActive(
        perk({ slug: "wardens-pardon", allowance_remaining: 10 }),
        Date.now()
      )
    ).toBe(true);
  });

  it("ignores an allowance on a perk that does not have one", () => {
    expect(
      perkIsActive(perk({ slug: "long-watch", allowance_remaining: null }), Date.now())
    ).toBe(true);
  });

  it("refuses a perk with unreadable timestamps rather than assuming it is live", () => {
    /* Unparseable dates read as not burning, which is the safe direction: a
       perk that cannot be confirmed must not silently raise a Call ceiling. */
    expect(perkIsActive(perk({ expires_at: "whenever" }), Date.now())).toBe(false);
    expect(perkIsActive(perk({ starts_at: "" }), Date.now())).toBe(false);
  });

  it("answers the open-Call ceiling question by slug, not by count", () => {
    const now = Date.now();
    const list = [
      perk({ slug: "the-standard" }),
      perk({ slug: "long-watch", expires_at: new Date(now - 1).toISOString() }),
    ];
    expect(hasActivePerk(list, "the-standard", now)).toBe(true);
    expect(hasActivePerk(list, "long-watch", now)).toBe(false);
    expect(activePerks(list, now)).toHaveLength(1);
  });
});
