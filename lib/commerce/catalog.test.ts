import { describe, it, expect } from "vitest";
import {
  CHEST_CATALOG,
  MERCH_CATALOG,
  RARITY_FLOOR_USD,
  SET_ONE_PRINT_EDITION,
  chestPrice,
  merchPrice,
  physicalGoodsFloorMinor,
  pricesConfirmed,
} from "@/lib/commerce/catalog";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { MERCER_SKUS } from "@/lib/collectibles/mercer";
import { majorToMinor } from "@/lib/commerce/money";

/* These are the founder's numbers, and they are the only numbers in the
   product that can take money off somebody. Most of what the catalog module
   asserts happens at import time, which means a violation breaks the build
   rather than reaching a customer. This suite is here for the half that a
   module-load check cannot express: that the numbers are the ones that were
   actually decided, and that the gate on charging them is still shut. */

describe("chest pricing", () => {
  it("carries the founder's prices exactly, in minor units", () => {
    expect(chestPrice("squires-chest")?.priceMinor).toBe(3499);
    expect(chestPrice("knights-warchest")?.priceMinor).toBe(4100);
    expect(chestPrice("kings-reliquary")?.priceMinor).toBe(5486);
  });

  it("carries the founder's floors exactly", () => {
    expect(chestPrice("squires-chest")?.floorMinor).toBe(3800);
    expect(chestPrice("knights-warchest")?.floorMinor).toBe(9200);
    expect(chestPrice("kings-reliquary")?.floorMinor).toBe(19200);
  });

  it("never sells a chest for more than its guaranteed floor", () => {
    /* The founder's guardrail, restated where a reader will find it. A buyer
       who opens a chest is never out of pocket, which is what separates a
       collectible box from a bet. */
    for (const entry of CHEST_CATALOG) {
      expect(entry.floorMinor).toBeGreaterThanOrEqual(entry.priceMinor);
    }
  });

  it("prices every sellable chest, and prices nothing else", () => {
    expect(CHEST_CATALOG.map((c) => c.sku).sort()).toEqual(
      CHEST_TIERS.map((t) => t.sku).sort()
    );
  });

  it("attributes the physical box's surplus to the goods in it", () => {
    /* The King's Reliquary ships merch and a print as well as cards, so its
       floor is legitimately above what the cards alone guarantee. A digital
       chest has no such surplus and must show none. */
    expect(physicalGoodsFloorMinor("kings-reliquary")).toBeGreaterThan(0);
    expect(physicalGoodsFloorMinor("squires-chest")).toBe(0);
    expect(physicalGoodsFloorMinor("knights-warchest")).toBe(0);
  });
});

describe("the per-rarity floor", () => {
  it("carries the founder's committed values", () => {
    expect(RARITY_FLOOR_USD).toEqual({
      rare: 8,
      epic: 22,
      legendary: 60,
      mythic: 275,
    });
  });

  it("rises with rarity, which is the only thing that makes it a ladder", () => {
    expect(RARITY_FLOOR_USD.rare).toBeLessThan(RARITY_FLOOR_USD.epic);
    expect(RARITY_FLOOR_USD.epic).toBeLessThan(RARITY_FLOOR_USD.legendary);
    expect(RARITY_FLOOR_USD.legendary).toBeLessThan(RARITY_FLOOR_USD.mythic);
  });

  it("explains both digital chest floors on its own", () => {
    /* Not a coincidence and not a coincidence worth losing. The Squire's floor
       is two rares and the epic its guarantee promises; the Knight's is four
       rares and a legendary. The module asserts this at load, and this is the
       arithmetic written out so the next reader can see where the numbers came
       from rather than taking them on trust. */
    expect(majorToMinor(RARITY_FLOOR_USD.rare * 2 + RARITY_FLOOR_USD.epic)).toBe(
      chestPrice("squires-chest")?.floorMinor
    );
    expect(
      majorToMinor(RARITY_FLOOR_USD.rare * 4 + RARITY_FLOOR_USD.legendary)
    ).toBe(chestPrice("knights-warchest")?.floorMinor);
  });
});

describe("the Mercer", () => {
  it("carries the founder's merch prices exactly", () => {
    expect(merchPrice("obsidian-tee")?.priceMinor).toBe(3200);
    expect(merchPrice("rookery-hoodie")?.priceMinor).toBe(6800);
    expect(merchPrice("banner-cap")?.priceMinor).toBe(3000);
    expect(merchPrice("set-one-print")?.priceMinor).toBe(4200);
    expect(merchPrice("war-playmat")?.priceMinor).toBe(4800);
  });

  it("prices every product in the customer catalog, and nothing that is not", () => {
    /* A shop that can charge for something it cannot name, or name something
       it cannot price, is a shop with a hole in it. */
    expect(MERCH_CATALOG.map((m) => m.sku).sort()).toEqual(
      MERCER_SKUS.map((p) => p.sku).sort()
    );
  });

  it("takes its names from the customer catalog rather than restating them", () => {
    for (const entry of MERCH_CATALOG) {
      const product = MERCER_SKUS.find((p) => p.sku === entry.sku);
      expect(entry.name).toBe(product?.name);
    }
  });

  it("answers null for a sku nobody sells", () => {
    expect(merchPrice("crown-of-the-realm")).toBeNull();
  });

  it("numbers the art print to the founder's edition", () => {
    expect(SET_ONE_PRINT_EDITION).toBe(250);
  });
});

describe("the confirmation gate", () => {
  it("is shut unless the environment says otherwise, in those exact words", () => {
    /* Two separate decisions: what a chest costs, and whether the realm is
       ready to charge for it. The prices above are decided; this is still
       false, because it waits on the checkout frontend, a real payment
       account, and the compliance guardrails. Anything other than the literal
       string "true" keeps the till shut. */
    const before = process.env.COMMERCE_PRICES_CONFIRMED;
    try {
      delete process.env.COMMERCE_PRICES_CONFIRMED;
      expect(pricesConfirmed()).toBe(false);
      process.env.COMMERCE_PRICES_CONFIRMED = "TRUE";
      expect(pricesConfirmed()).toBe(false);
      process.env.COMMERCE_PRICES_CONFIRMED = "1";
      expect(pricesConfirmed()).toBe(false);
      process.env.COMMERCE_PRICES_CONFIRMED = "true";
      expect(pricesConfirmed()).toBe(true);
    } finally {
      if (before === undefined) delete process.env.COMMERCE_PRICES_CONFIRMED;
      else process.env.COMMERCE_PRICES_CONFIRMED = before;
    }
  });
});
