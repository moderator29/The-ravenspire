import "server-only";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
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
  /* Price in USD minor units (cents). Provisional until confirmed. */
  priceMinor: number;
  /* The guaranteed floor value the buyer receives, in minor units. Must be at
     least priceMinor, the no-downside guardrail. Provisional. */
  floorMinor: number;
}

/* Provisional prices from the founder brief, item 7. Stored here and nowhere a
   client can read them. Squire's 4.99, Knight's 14.99, King's Reliquary 59.99.
   Floor values are provisional placeholders set to meet the guardrail (floor
   at least price); they are recomputed from real per-card valuations before
   confirmation, and the guardrail below is what forces that to stay honest. */
const PROVISIONAL: Record<string, { price: number; floor: number }> = {
  "squires-chest": { price: 4.99, floor: 4.99 },
  "knights-warchest": { price: 14.99, floor: 14.99 },
  "kings-reliquary": { price: 59.99, floor: 59.99 },
};

export const CHEST_CATALOG: ChestCatalogEntry[] = CHEST_TIERS.map((tier) => {
  const p = PROVISIONAL[tier.sku];
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

/* The guardrail, enforced at module load: floor value is never below price. */
for (const entry of CHEST_CATALOG) {
  if (entry.floorMinor < entry.priceMinor) {
    throw new Error(
      `Chest ${entry.sku} floor ${entry.floorMinor} is below its price ${entry.priceMinor}. A chest never sells for more than its guaranteed floor.`
    );
  }
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

/* Set One art prints are numbered to this edition per champion (item 7). */
export const SET_ONE_PRINT_EDITION = 250;

/* True only when a human has confirmed the provisional prices. Defaults to
   false: an unconfirmed price is never charged, even behind an open flag. */
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
