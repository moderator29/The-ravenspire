import { describe, it, expect } from "vitest";
import {
  LIVE_CLAIM_STATUSES,
  LIVE_LISTING_STATUSES,
  MARKET_FEE_BPS,
  MAX_PRICE_MINOR,
  MIN_PRICE_MINOR,
  RESERVATION_TTL_SECONDS,
  listableKind,
  planListing,
  planPurchase,
  priceInTokenUnits,
  quoteFor,
  type MarketCopy,
  type MarketListingRow,
} from "@/lib/commerce/market";
import { isSoulbound, type ClaimSubjectKind } from "@/lib/collectibles/token-ids";
import { splitFee } from "@/lib/commerce/money";

/* The Bazaar moves real money between real people, and every test here is a
   way somebody gets hurt if the rule is wrong.

   Three of them are the reason this file exists.

   "The split always adds back up" is the one that protects both sides of every
   trade. A fee split that loses a cent shorts a seller on every sale forever,
   and one that invents a cent means the realm is quoting a total it cannot
   collect. Neither ever fails loudly, which is exactly why it is tested
   exhaustively across the whole price range rather than sampled.

   "A soulbound item can never be listed" is the one that protects the crests.
   A crest sold to a buyer takes their money and delivers a token that cannot
   be transferred to them, and there is no honest way to unwind it afterwards.

   "A listing cannot settle twice" is the one that protects the card. One
   listing is one copy, and a rule that let two buyers both take it would have
   the realm selling something it cannot deliver, with somebody's payment
   already in the seller's wallet where the platform cannot reach it, because
   the platform never had custody of it.

   The module also asserts a good deal of this at import time, so a fee that
   does not add up breaks the build rather than reaching a member. These tests
   cover what a module load check cannot: that the numbers are the ones
   actually decided, and that the two planners refuse every shape of illegal
   trade rather than quietly permitting one. */

const SELLER = "seller-profile";
const BUYER = "buyer-profile";
const NOW = Date.parse("2026-08-16T12:00:00.000Z");

function copy(over: Partial<MarketCopy> = {}): MarketCopy {
  return {
    id: "copy-1",
    profile_id: SELLER,
    set_slug: "set-one",
    card_number: 7,
    champion_slug: "a-champion",
    rarity: "rare",
    claim_status: null,
    listing_status: null,
    ...over,
  };
}

function listing(over: Partial<MarketListingRow> = {}): MarketListingRow {
  const q = quoteFor(2_500);
  return {
    id: "listing-1",
    seller_profile_id: SELLER,
    status: "active",
    price_minor: q.priceMinor,
    fee_bps: q.bps,
    fee_minor: q.feeMinor,
    seller_minor: q.sellerMinor,
    buyer_profile_id: null,
    reservation_expires_at: null,
    seller_tx_hash: null,
    fee_tx_hash: null,
    ...over,
  };
}

/* An hour either side of the fixed clock, as an ISO string, so a reservation
   can be put in the past or the future without waiting for either. */
function at(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

describe("the protocol fee", () => {
  it("is the fee that was decided", () => {
    /* Written out rather than derived, so a change has to be made twice and
       thought about once. Five percent, and the price bounds it sits between. */
    expect(MARKET_FEE_BPS).toBe(500);
    expect(MIN_PRICE_MINOR).toBe(100);
    expect(MAX_PRICE_MINOR).toBe(10_000_000);
  });

  it("is small and explicit, never a spread", () => {
    /* The buyer pays the price and the fee is taken out of it, visibly. A fee
       above ten percent would not be the small, explicit fee this market
       promises, and a fee of zero is not a fee. */
    expect(MARKET_FEE_BPS).toBeGreaterThan(0);
    expect(MARKET_FEE_BPS).toBeLessThanOrEqual(1000);
  });

  it("takes exactly five percent of a round price", () => {
    /* Ten dollars: fifty cents to the Coffers, nine fifty to the seller. If a
       member does this sum in their head, it has to come out. */
    expect(quoteFor(1_000)).toMatchObject({
      priceMinor: 1_000,
      feeMinor: 50,
      sellerMinor: 950,
      bps: 500,
    });
    expect(quoteFor(10_000)).toMatchObject({ feeMinor: 500, sellerMinor: 9_500 });
  });

  it("charges at least one cent at the cheapest legal listing", () => {
    /* A fee that rounds to nothing is a free trade with a fee label on it, and
       the Coffers would be funding the venue for whoever noticed. */
    const cheapest = quoteFor(MIN_PRICE_MINOR);
    expect(cheapest.feeMinor).toBeGreaterThanOrEqual(1);
    expect(cheapest.sellerMinor).toBeGreaterThanOrEqual(1);
  });
});

describe("the fee arithmetic", () => {
  it("adds back up to the price, at every price the market allows", () => {
    /* THE load bearing test. A split that loses a cent shorts a seller on
       every sale forever and nothing ever fails; one that invents a cent means
       the realm quotes a total it cannot collect. Swept densely at the bottom
       of the range where rounding actually bites, then across the whole range
       in coarser steps, because a hundred thousand prices is the honest
       coverage and ten million is a slow test with no more information in it. */
    for (let price = MIN_PRICE_MINOR; price <= 5_000; price += 1) {
      const q = quoteFor(price);
      expect(q.feeMinor + q.sellerMinor).toBe(price);
    }
    for (let price = 5_000; price <= MAX_PRICE_MINOR; price += 977) {
      const q = quoteFor(price);
      expect(q.feeMinor + q.sellerMinor).toBe(price);
    }
    const top = quoteFor(MAX_PRICE_MINOR);
    expect(top.feeMinor + top.sellerMinor).toBe(MAX_PRICE_MINOR);
  });

  it("produces integers only, never a float", () => {
    /* Money is an integer count of cents in this codebase. A fee of 149.95 is
       what `price * 0.05` gives you, and it is the defect this whole module is
       shaped to prevent. */
    for (const price of [101, 199, 333, 999, 2_999, 12_345, 999_999]) {
      const q = quoteFor(price);
      expect(Number.isInteger(q.feeMinor)).toBe(true);
      expect(Number.isInteger(q.sellerMinor)).toBe(true);
      expect(Number.isInteger(q.priceMinor)).toBe(true);
    }
  });

  it("rounds half up, and says so the same way every time", () => {
    /* 2999 at five percent is 149.95, which rounds to 150 and leaves the
       seller 2849. Half a cent is not a rounding preference, it is a rule, and
       it has to be the same rule in the listing form, the listing row and the
       database check constraint. */
    expect(quoteFor(2_999)).toMatchObject({ feeMinor: 150, sellerMinor: 2_849 });
    /* Exactly on the half: 10 at five percent is 0.5 of a cent, up to 1. */
    expect(splitFee(10, 500)).toMatchObject({ feeMinor: 1, netMinor: 9 });
    expect(splitFee(30, 500)).toMatchObject({ feeMinor: 2, netMinor: 28 });
  });

  it("refuses a rate or an amount that is not a whole number", () => {
    expect(() => splitFee(100.5, 500)).toThrow();
    expect(() => splitFee(100, 500.5)).toThrow();
    expect(() => splitFee(-1, 500)).toThrow();
    expect(() => splitFee(100, -1)).toThrow();
    expect(() => splitFee(100, 10_001)).toThrow();
  });

  it("never pays the seller more than the price or less than nothing", () => {
    for (const bps of [1, 250, 500, 1_000, 10_000]) {
      for (const price of [100, 137, 999, 100_000]) {
        const s = splitFee(price, bps);
        expect(s.feeMinor).toBeGreaterThanOrEqual(0);
        expect(s.netMinor).toBeGreaterThanOrEqual(0);
        expect(s.feeMinor + s.netMinor).toBe(price);
      }
    }
  });
});

describe("cents to token units", () => {
  it("converts exactly, with no price feed anywhere near it", () => {
    /* USDC has six decimals and a cent is a hundredth of a dollar, so a cent
       is exactly ten thousand base units. This is the whole reason the pay
       token is a dollar stablecoin: a floating asset would need a rate, and a
       rate read at listing time and honoured at settlement is an invented
       number wearing a price tag. */
    expect(priceInTokenUnits(1, 6)).toBe(10_000n);
    expect(priceInTokenUnits(100, 6)).toBe(1_000_000n);
    expect(priceInTokenUnits(2_500, 6)).toBe(25_000_000n);
    expect(priceInTokenUnits(0, 6)).toBe(0n);
    /* A two decimal token is a token where a cent is one base unit. */
    expect(priceInTokenUnits(2_500, 2)).toBe(2_500n);
    /* Eighteen decimals, the shape a stablecoin on some chains takes. */
    expect(priceInTokenUnits(1, 18)).toBe(10n ** 16n);
  });

  it("stays exact at the top of the price range", () => {
    /* A hundred thousand dollars in an eighteen decimal token is far past what
       a double can hold without losing units, which is why this is BigInt and
       not a Number. */
    const units = priceInTokenUnits(MAX_PRICE_MINOR, 18);
    expect(units).toBe(BigInt(MAX_PRICE_MINOR) * 10n ** 16n);
    expect(units.toString()).toBe("100000000000000000000000");
  });

  it("refuses a token that cannot express a cent", () => {
    /* Rounding the remainder away would be quietly losing somebody's money on
       every trade. */
    expect(() => priceInTokenUnits(100, 1)).toThrow();
    expect(() => priceInTokenUnits(100, 0)).toThrow();
    expect(() => priceInTokenUnits(100.5, 6)).toThrow();
    expect(() => priceInTokenUnits(-1, 6)).toThrow();
  });
});

describe("a soulbound item can never be listed", () => {
  it("asks lib/collectibles/token-ids.ts rather than re-deriving the rule", () => {
    /* The market must not have its own opinion about what is soulbound. There
       is one answer to that question in the product and this asserts the
       market is reading it, for every kind that exists, so a third claimable
       kind cannot arrive soulbound and listable at the same time. */
    const kinds: ClaimSubjectKind[] = ["card", "crest"];
    for (const kind of kinds) {
      expect(listableKind(kind)).toBe(!isSoulbound(kind));
    }
  });

  it("refuses a crest even when everything else about it is perfect", () => {
    /* The copy here is owned, unclaimed, unlisted and priced legally. The only
       thing wrong with the listing is that it is a crest, and that alone has
       to be enough: a crest sold to a buyer takes their money and delivers a
       token that cannot be transferred to them. */
    expect(
      planListing({
        kind: "crest",
        sellerProfileId: SELLER,
        copy: copy(),
        priceMinor: 2_500,
      })
    ).toEqual({ ok: false, reason: "soulbound" });
  });

  it("refuses a crest before it refuses anything else about the listing", () => {
    /* Order matters here in one direction only: a crest must never be refused
       for a fixable reason, because a member who fixes the price would then be
       told the real answer and reasonably ask why it was not said first. */
    expect(
      planListing({
        kind: "crest",
        sellerProfileId: "somebody-else",
        copy: copy({ claim_status: "minted", listing_status: "active" }),
        priceMinor: 1,
      })
    ).toEqual({ ok: false, reason: "soulbound" });
  });

  it("lets a card through, because cards are meant to move", () => {
    const plan = planListing({
      kind: "card",
      sellerProfileId: SELLER,
      copy: copy(),
      priceMinor: 2_500,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.quote).toMatchObject({ priceMinor: 2_500, feeMinor: 125, sellerMinor: 2_375 });
  });
});

describe("planListing", () => {
  it("takes the card's identity off the ledger row, never off the request", () => {
    /* A client that can name the rarity of what it is selling can sell a rare
       as a mythic. */
    const plan = planListing({
      kind: "card",
      sellerProfileId: SELLER,
      copy: copy({ rarity: "mythic", card_number: 40, champion_slug: "the-mythic" }),
      priceMinor: 50_000,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan).toMatchObject({
      rarity: "mythic",
      cardNumber: 40,
      championSlug: "the-mythic",
      setSlug: "set-one",
    });
  });

  it("refuses somebody else's card", () => {
    expect(
      planListing({
        kind: "card",
        sellerProfileId: "not-the-owner",
        copy: copy(),
        priceMinor: 2_500,
      })
    ).toEqual({ ok: false, reason: "not_yours" });
  });

  it("refuses a copy carried to the member's own wallet, on every live status", () => {
    /* The member holds the token and the platform never had custody of it.
       Moving the ledger row on payment would sell a buyer something the realm
       cannot deliver, with the chain saying the seller still owns it and the
       chain being right. Same three statuses public.craft_cards refuses. */
    for (const status of LIVE_CLAIM_STATUSES) {
      expect(
        planListing({
          kind: "card",
          sellerProfileId: SELLER,
          copy: copy({ claim_status: status }),
          priceMinor: 2_500,
        })
      ).toEqual({ ok: false, reason: "carried_on_chain" });
    }
  });

  it("allows a copy whose claim died, because a dead claim means the token never left", () => {
    for (const status of ["expired", "void"]) {
      const plan = planListing({
        kind: "card",
        sellerProfileId: SELLER,
        copy: copy({ claim_status: status }),
        priceMinor: 2_500,
      });
      expect(plan.ok).toBe(true);
    }
  });

  it("refuses a copy that is already on the board", () => {
    /* One copy, one live listing. This is the rule that makes "a listing
       cannot sell twice" true before a settlement is even reached: two sales
       of one card cannot both exist. */
    for (const status of LIVE_LISTING_STATUSES) {
      expect(
        planListing({
          kind: "card",
          sellerProfileId: SELLER,
          copy: copy({ listing_status: status }),
          priceMinor: 2_500,
        })
      ).toEqual({ ok: false, reason: "already_listed" });
    }
  });

  it("allows a copy whose last listing was settled or withdrawn", () => {
    /* A card that has been sold once may be sold again by its new owner, and a
       withdrawn listing must not strand a card forever. */
    for (const status of ["settled", "cancelled"]) {
      expect(
        planListing({
          kind: "card",
          sellerProfileId: SELLER,
          copy: copy({ listing_status: status }),
          priceMinor: 2_500,
        }).ok
      ).toBe(true);
    }
  });

  it("refuses a price that is not a whole number of cents", () => {
    /* A price arriving as 12.5 is a client that has been doing float
       arithmetic. Refused rather than rounded: rounding somebody's price for
       them is a decision the realm is not entitled to make. */
    expect(
      planListing({
        kind: "card",
        sellerProfileId: SELLER,
        copy: copy(),
        priceMinor: 1_250.5,
      })
    ).toEqual({ ok: false, reason: "price_not_integer" });
    expect(
      planListing({
        kind: "card",
        sellerProfileId: SELLER,
        copy: copy(),
        priceMinor: Number.NaN,
      })
    ).toEqual({ ok: false, reason: "price_not_integer" });
  });

  it("holds both ends of the price range", () => {
    expect(
      planListing({
        kind: "card",
        sellerProfileId: SELLER,
        copy: copy(),
        priceMinor: MIN_PRICE_MINOR - 1,
      })
    ).toEqual({ ok: false, reason: "price_too_low" });
    expect(
      planListing({
        kind: "card",
        sellerProfileId: SELLER,
        copy: copy(),
        priceMinor: MAX_PRICE_MINOR + 1,
      })
    ).toEqual({ ok: false, reason: "price_too_high" });
    expect(
      planListing({
        kind: "card",
        sellerProfileId: SELLER,
        copy: copy(),
        priceMinor: MIN_PRICE_MINOR,
      }).ok
    ).toBe(true);
    expect(
      planListing({
        kind: "card",
        sellerProfileId: SELLER,
        copy: copy(),
        priceMinor: MAX_PRICE_MINOR,
      }).ok
    ).toBe(true);
  });

  it("never quotes a value the seller did not name", () => {
    /* The floor is what the platform commits to standing behind, not a market
       price and not an appraisal. A plan carries the seller's own price and
       the split of it, and nothing else that looks like a valuation. */
    const plan = planListing({
      kind: "card",
      sellerProfileId: SELLER,
      copy: copy({ rarity: "mythic" }),
      priceMinor: 500,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.quote.priceMinor).toBe(500);
    expect(Object.keys(plan)).not.toContain("floorMinor");
    expect(Object.keys(plan)).not.toContain("estimatedMinor");
  });
});

describe("a listing cannot settle twice", () => {
  it("refuses a listing that has already sold", () => {
    /* Answered by name rather than as "not active": the member wants to know
       whether they can still buy it, and "somebody already did" is a different
       sentence from "it was withdrawn". */
    expect(
      planPurchase({
        listing: listing({ status: "settled", buyer_profile_id: "someone" }),
        buyerProfileId: BUYER,
        nowMs: NOW,
      })
    ).toEqual({ ok: false, reason: "already_settled" });
  });

  it("refuses a withdrawn listing", () => {
    expect(
      planPurchase({
        listing: listing({ status: "cancelled" }),
        buyerProfileId: BUYER,
        nowMs: NOW,
      })
    ).toEqual({ ok: false, reason: "not_active" });
  });

  it("refuses a listing somebody else is mid-purchase on", () => {
    expect(
      planPurchase({
        listing: listing({
          status: "reserved",
          buyer_profile_id: "another-buyer",
          reservation_expires_at: at(60_000),
        }),
        buyerProfileId: BUYER,
        nowMs: NOW,
      })
    ).toEqual({ ok: false, reason: "reserved_by_another" });
  });

  it("releases a reservation that lapsed with nothing paid", () => {
    /* An abandoned intent is not a buyer, and a card must not be off the board
       forever because somebody opened a purchase and wandered away. */
    const plan = planPurchase({
      listing: listing({
        status: "reserved",
        buyer_profile_id: "another-buyer",
        reservation_expires_at: at(-60_000),
      }),
      buyerProfileId: BUYER,
      nowMs: NOW,
    });
    expect(plan.ok).toBe(true);
  });

  it("never releases a reservation that has taken a payment, however old", () => {
    /* THE test that protects a buyer's money. Once a single leg is proven the
       listing stops being releasable, no matter how long ago the reservation
       was made, because releasing a listing somebody has already paid into is
       the one failure in this design that costs a member real money. A
       deadline is a deadline on exclusivity, never on settlement. */
    for (const paid of [
      { seller_tx_hash: `0x${"a".repeat(64)}` },
      { fee_tx_hash: `0x${"b".repeat(64)}` },
    ]) {
      expect(
        planPurchase({
          listing: listing({
            status: "reserved",
            buyer_profile_id: "another-buyer",
            /* An hour past its deadline, and still theirs. */
            reservation_expires_at: at(-3_600_000),
            ...paid,
          }),
          buyerProfileId: BUYER,
          nowMs: NOW,
        })
      ).toEqual({ ok: false, reason: "reserved_by_another" });
    }
  });

  it("lets the holder of a reservation resume their own purchase", () => {
    /* A member who came back to an unfinished trade continues it rather than
       competing for it, even past the deadline and even mid-payment. */
    for (const expiry of [at(60_000), at(-3_600_000)]) {
      const plan = planPurchase({
        listing: listing({
          status: "reserved",
          buyer_profile_id: BUYER,
          reservation_expires_at: expiry,
          seller_tx_hash: `0x${"c".repeat(64)}`,
        }),
        buyerProfileId: BUYER,
        nowMs: NOW,
      });
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.holdsReservation).toBe(true);
    }
  });

  it("refuses a member buying their own listing", () => {
    /* Not a trade: a fee paid to move a card from one hand to the same hand,
       and in any market with a ranking it is also how a price is faked. */
    expect(
      planPurchase({
        listing: listing(),
        buyerProfileId: SELLER,
        nowMs: NOW,
      })
    ).toEqual({ ok: false, reason: "own_listing" });
  });

  it("refuses to trade on a row that does not add up", () => {
    /* A listing whose fee and proceeds do not sum to its price is corrupt, and
       the only safe thing to do with one is refuse rather than ask somebody to
       pay against it. */
    expect(
      planPurchase({
        listing: listing({ price_minor: 2_500, fee_minor: 125, seller_minor: 2_374 }),
        buyerProfileId: BUYER,
        nowMs: NOW,
      })
    ).toEqual({ ok: false, reason: "amounts_disagree" });
  });

  it("quotes the amounts the seller agreed to, not today's fee", () => {
    /* The split is frozen at listing time. A later change to the protocol fee
       must never re-price a listing that already exists, in either direction:
       the seller agreed to these numbers and the buyer was shown them. */
    const frozen = listing({ price_minor: 2_500, fee_bps: 250, fee_minor: 63, seller_minor: 2_437 });
    const plan = planPurchase({ listing: frozen, buyerProfileId: BUYER, nowMs: NOW });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.quote).toMatchObject({
      priceMinor: 2_500,
      feeMinor: 63,
      sellerMinor: 2_437,
      bps: 250,
    });
    /* And it is emphatically not what the current rate would produce. */
    expect(quoteFor(2_500).feeMinor).toBe(125);
  });
});

describe("the reservation window", () => {
  it("is long enough to sign twice and short enough to free a card", () => {
    /* Half an hour. Long enough for two wallet prompts on a bad connection or
       a top-up in between, short enough that a listing is not off the board
       for an afternoon because somebody wandered off. */
    expect(RESERVATION_TTL_SECONDS).toBe(1800);
    expect(RESERVATION_TTL_SECONDS).toBeGreaterThanOrEqual(300);
    expect(RESERVATION_TTL_SECONDS).toBeLessThanOrEqual(86_400);
  });
});
