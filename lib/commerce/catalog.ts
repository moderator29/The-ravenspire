import "server-only";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { MERCER_SKUS } from "@/lib/collectibles/mercer";
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

/* THE MERCER, priced. Set by the founder.
 *
 * Keyed by the same slugs the customer catalog uses
 * (lib/collectibles/mercer.ts), which carries the names, the blurbs and the
 * plates and deliberately carries no money. A sku here with no product there,
 * or a product there with no price here, breaks the build: a shop that can
 * charge for something it cannot name, or name something it cannot price, is
 * a shop with a hole in it. */
const MERCH_PRICING: Record<string, number> = {
  "obsidian-tee": 32,
  "rookery-hoodie": 68,
  "banner-cap": 30,
  "set-one-print": 42,
  "war-playmat": 48,
};

export interface MerchCatalogEntry {
  sku: string;
  name: string;
  kind: string;
  priceMinor: number;
}

export const MERCH_CATALOG: MerchCatalogEntry[] = MERCER_SKUS.map((product) => {
  const price = MERCH_PRICING[product.sku];
  if (price === undefined) {
    throw new Error(
      `Mercer product ${product.sku} has no catalog price. Nothing is sellable without one.`
    );
  }
  return {
    sku: product.sku,
    name: product.name,
    kind: product.kind,
    priceMinor: majorToMinor(price),
  };
});

for (const sku of Object.keys(MERCH_PRICING)) {
  if (!MERCER_SKUS.some((p) => p.sku === sku)) {
    throw new Error(
      `Catalog prices ${sku}, which is not a Mercer product. A price with no product is a price for nothing.`
    );
  }
}

export function merchPrice(sku: string): MerchCatalogEntry | null {
  return MERCH_CATALOG.find((m) => m.sku === sku) ?? null;
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

/* True only when a human has confirmed that the realm may charge these prices.
   Defaults to false, and it is still false: the prices above are the founder's
   final numbers, but confirmation waits on three things that have nothing to do
   with arithmetic, namely the checkout frontend, a real payment account, and
   the compliance guardrails. A number being decided and a realm being ready to
   take money are two different facts and this gate is the second one. */
export function pricesConfirmed(): boolean {
  return process.env.COMMERCE_PRICES_CONFIRMED === "true";
}

/* The chosen payment provider, defaulting to Stripe. See lib/commerce/payments. */
export function paymentProviderName(): string {
  return process.env.PAYMENT_PROVIDER?.trim().toLowerCase() || "stripe";
}

/* The chosen fulfillment vendor, defaulting to Gelato. See
   lib/commerce/fulfillment. Swappable by env so the vendor decision is never
   welded into code. */
export function fulfillmentVendorName(): string {
  return process.env.FULFILLMENT_VENDOR?.trim().toLowerCase() || "gelato";
}
