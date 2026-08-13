import "server-only";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { MERCER_SKUS, type MercerKind } from "@/lib/collectibles/mercer";
import { majorToMinor } from "@/lib/commerce/money";
import type { Rarity } from "@/lib/game/champions";

/* The server catalog (V2 Part Two, section 33, item 7).
 *
 * This is the configurable, server-only source of truth for every number a
 * purchase depends on: the price of a chest, the floor value guaranteed inside
 * it, the mint cap per rarity, the edition size of a print. It is deliberately
 * NOT in lib/collectibles/warchests.ts, which the client reads: prices and
 * supplies are provisional until the founder confirms them, and REAL DATA ONLY
 * means a provisional number never reaches a customer surface. So the customer
 * catalog omits price entirely (by design, see warchests.ts) and this module,
 * marked server-only, carries the money. The create-checkout route reads price
 * from here and never from the client, which is rule 6, server authoritative.
 *
 * CONFIRMATION GATE
 * Every price here is provisional until a human confirms it. `pricesConfirmed`
 * reads COMMERCE_PRICES_CONFIRMED and defaults to false, so even with the
 * chests_live flag flipped, a checkout for a chest refuses until the price is
 * explicitly confirmed. Two independent switches, a flag and a confirmation,
 * because unsealing a chapter and committing to a price are two different
 * decisions and must be made separately.
 *
 * WHAT THE FLOOR IS, AND THE ONE THING IT IS NOT
 * It is a valuation the realm publishes and stands behind as a catalogue value.
 * It is NOT redeemable and there is no buy back: nothing anywhere in this
 * codebase pays a member RARITY_FLOOR_USD for a card, and the only place a card
 * becomes money is the Bazaar, where another member decides what it is worth.
 *
 * That distinction has to survive contact with the copy, because every chest
 * here is priced BELOW its own floor and a member reading "guaranteed floor $38"
 * on a $34.99 box will read a promise the realm cannot fund. The buy control
 * says "at the realm's own valuation" for that reason, and the trophy case
 * declines to quote a floor at all. If the realm ever does buy a card back at
 * its floor, that is a funded liability and a founder decision, and this comment
 * is where it stops being true.
 *
 * THE FLOOR GUARANTEE
 * The founder's guardrail is that the guaranteed floor value of a chest is at
 * least its price, so a buyer never loses money opening one: it is a
 * collectible box, not a bet. That invariant is validated at module load
 * below, the same discipline warchests.ts applies to the odds. A chest whose
 * floor is worth less than it costs breaks the build rather than shipping.
 */

export type PackRarity = Exclude<Rarity, "common">;

export interface ChestCatalogEntry {
  sku: string;
  /* Price in USD minor units (cents). */
  priceMinor: number;
  /* The guaranteed floor value the buyer receives, in minor units. Never below
     priceMinor: that is the no-downside guardrail, enforced at module load. */
  floorMinor: number;
}

/* THE PER-RARITY FLOOR, set by the founder.
 *
 * Read this for what it is and not for what it is not. It is the value the
 * PLATFORM commits to standing behind for a card of each rarity: the no
 * downside guarantee that makes a Warchest a collectible box rather than a
 * bet. It is not a market price, not an appraisal, and not a promise about
 * what anyone else will pay. Nothing in the product may render it as one, and
 * the secondary market must never quote it as a price. */
export const RARITY_FLOOR_USD: Record<PackRarity, number> = {
  rare: 8,
  epic: 22,
  legendary: 60,
  mythic: 275,
};

/* Chest prices and floors, set by the founder. */
const PRICING: Record<string, { price: number; floor: number }> = {
  "squires-chest": { price: 34.99, floor: 38 },
  "knights-warchest": { price: 41.0, floor: 92 },
  "kings-reliquary": { price: 54.86, floor: 192 },
};

/* The worst a chest can possibly open, in floor value: every card the lowest
   rarity on its odds table, except the one the printed guarantee lifts to the
   floor rarity. That is exactly what lib/collectibles/pulls.ts enforces, so
   this is not an estimate of the floor, it is the floor.

   Derived rather than typed, which is the whole point. If a tier's card count
   or its guarantee ever changes, this number moves with it and the assertions
   below catch a chest whose promised floor no longer matches what it can
   actually deal. */
function worstCaseCardFloorUsd(sku: string): number {
  const tier = CHEST_TIERS.find((t) => t.sku === sku);
  if (!tier) throw new Error(`No chest tier for ${sku}`);
  const lowest = (Object.keys(tier.odds) as PackRarity[])
    .filter((r) => (tier.odds[r] ?? 0) > 0)
    .reduce((worst, r) =>
      RARITY_FLOOR_USD[r] < RARITY_FLOOR_USD[worst] ? r : worst
    );
  return (
    RARITY_FLOOR_USD[lowest] * (tier.cardCount - 1) + RARITY_FLOOR_USD[tier.floor]
  );
}

export const CHEST_CATALOG: ChestCatalogEntry[] = CHEST_TIERS.map((tier) => {
  const p = PRICING[tier.sku];
  if (!p) {
    throw new Error(
      `Chest tier ${tier.sku} has no catalog price. Every sellable chest needs a server price.`
    );
  }
  return {
    sku: tier.sku,
    priceMinor: majorToMinor(p.price),
    floorMinor: majorToMinor(p.floor),
  };
});

for (const tier of CHEST_TIERS) {
  const entry = CHEST_CATALOG.find((c) => c.sku === tier.sku) as ChestCatalogEntry;

  /* The founder's guardrail: a buyer never loses money opening a chest. */
  if (entry.floorMinor < entry.priceMinor) {
    throw new Error(
      `Chest ${entry.sku} floor ${entry.floorMinor} is below its price ${entry.priceMinor}. A chest never sells for more than its guaranteed floor.`
    );
  }

  const cardFloorMinor = majorToMinor(worstCaseCardFloorUsd(tier.sku));

  /* A digital chest holds cards and nothing else, so its promised floor and
     the worst it can deal are the same number or the promise is wrong in one
     direction or the other. Both of the founder's digital floors land on this
     exactly: 2 rare plus an epic is 38, 4 rare plus a legendary is 92. */
  if (tier.kind === "digital" && entry.floorMinor !== cardFloorMinor) {
    throw new Error(
      `Chest ${tier.sku} promises a floor of ${entry.floorMinor} but its cards can only guarantee ${cardFloorMinor}. A printed floor and a dealt floor must be the same number.`
    );
  }

  /* A physical box also ships merch and a print, so its floor is legitimately
     above what the cards alone guarantee. It can never be below. */
  if (tier.kind === "physical" && entry.floorMinor < cardFloorMinor) {
    throw new Error(
      `Chest ${tier.sku} promises a floor of ${entry.floorMinor}, below the ${cardFloorMinor} its cards already guarantee.`
    );
  }
}

/* What a physical chest's floor attributes to the goods in the box rather than
   to the cards: the merch and the print. Derived, never typed, so it cannot
   drift from the two numbers it sits between. Zero for a digital chest. */
export function physicalGoodsFloorMinor(sku: string): number {
  const entry = CHEST_CATALOG.find((c) => c.sku === sku);
  const tier = CHEST_TIERS.find((t) => t.sku === sku);
  if (!entry || !tier || tier.kind !== "physical") return 0;
  return entry.floorMinor - majorToMinor(worstCaseCardFloorUsd(sku));
}

export function chestPrice(sku: string): ChestCatalogEntry | null {
  return CHEST_CATALOG.find((c) => c.sku === sku) ?? null;
}

/* Per-card mint caps, per rarity (item 7). Real scarcity, published before
   the mint, never invented after. Commons are the base set and are not sold
   in packs, so they carry no cap here. */
export const RARITY_SUPPLY: Record<PackRarity, number> = {
  rare: 5_000,
  epic: 1_500,
  legendary: 400,
  mythic: 75,
};

/* Set One art prints are numbered giclees, this edition per champion. */
export const SET_ONE_PRINT_EDITION = 250;

/* THE MERCER, priced by product kind. Set by the founder, server only.
 *
 * Keyed by kind rather than by sku, so a new sku of an already-priced kind is
 * priced automatically. Only the kinds the founder has priced appear; an
 * unpriced kind is left out rather than guessed, which keeps the real-data
 * rule (no invented price). Every launch piece is priced. */
const MERCH_PRICE_BY_KIND: Partial<Record<MercerKind, number>> = {
  tee: 25,
  hoodie: 35,
  cap: 10,
  "long-sleeve": 31,
  shorts: 17,
  joggers: 22,
  tracksuit: 69,
  belt: 14.49,
  sleeveless: 21.49,
  sleeves: 10,
  "deck-box": 8,
  playmat: 25,
  binder: 22,
};

export interface MerchCatalogEntry {
  sku: string;
  name: string;
  kind: string;
  priceMinor: number;
}

/* One priced entry per Mercer sku whose kind the founder has set. Derived from
   the customer catalog (lib/collectibles/mercer.ts), so the sku, name and kind
   can never drift from the product, and only the price is added here. An
   unpriced kind is left out rather than guessed. */
export const MERCH_CATALOG: MerchCatalogEntry[] = MERCER_SKUS.flatMap((s) => {
  const major = MERCH_PRICE_BY_KIND[s.kind];
  return major === undefined
    ? []
    : [
        {
          sku: s.sku,
          name: s.name,
          kind: s.kind,
          priceMinor: majorToMinor(major),
        },
      ];
});

export function merchPrice(sku: string): MerchCatalogEntry | null {
  return MERCH_CATALOG.find((m) => m.sku === sku) ?? null;
}

/* True only when a human has confirmed that the realm may charge these prices.
   Defaults to false, and it is still false: the prices above are the founder's
   final numbers, but confirmation waits on three things that have nothing to do
   with arithmetic, namely the checkout frontend, a real payment account, and
   the compliance guardrails. A number being decided and a realm being ready to
   take money are two different facts and this gate is the second one. */
export function pricesConfirmed(): boolean {
  return process.env.COMMERCE_PRICES_CONFIRMED === "true";
}

/* The chosen payment provider, defaulting to Coinbase Commerce (crypto, ETH on
   mainnet and ETH or USDC on Base). See lib/commerce/payments. */
export function paymentProviderName(): string {
  return process.env.PAYMENT_PROVIDER?.trim().toLowerCase() || "coinbase";
}

/* The chosen fulfillment vendor, defaulting to Gelato. See
   lib/commerce/fulfillment. Swappable by env so the vendor decision is never
   welded into code. */
export function fulfillmentVendorName(): string {
  return process.env.FULFILLMENT_VENDOR?.trim().toLowerCase() || "gelato";
}
