import { createHash, createHmac, randomBytes } from "node:crypto";
import type { ChestTier } from "@/lib/collectibles/warchests";
import { setOneCards } from "@/lib/collectibles/set-one";
import type { Rarity } from "@/lib/game/champions";

/* Provably fair chest opening (V2 Part Two, section 34, and the Phase D
 * contract recorded in app/api/chests/[sku]/open/route.ts).
 *
 * The whole point of a mystery box is that the buyer cannot be cheated by the
 * house, and the only way to prove that is to make every pull verifiable after
 * the fact. This is a commit-reveal scheme:
 *
 *   1. COMMIT. The server generates a random server seed and, before the pull,
 *      publishes sha256(serverSeed). That hash is stored in
 *      chest_openings.server_seed_hash. The server is now committed: it cannot
 *      change the seed without changing the hash it already showed.
 *   2. ROLL. The pull is a pure function of (serverSeed, clientSeed, nonce).
 *      The client contributes its own seed, so the server cannot have precomputed
 *      a favourable outcome for a seed it chose alone. Every card is drawn from
 *      an HMAC stream keyed by the server seed, which is uniform and unforgeable.
 *   3. REVEAL. After the pull the server returns the serverSeed. The buyer hashes
 *      it, checks it matches the committed hash, replays this exact function, and
 *      confirms the cards. Nothing is taken on trust.
 *
 * This module is pure and deterministic given its inputs, which is what makes
 * it testable and what makes it verifiable. It never touches the database, the
 * clock or global state. The route commits, calls this, records, and reveals.
 *
 * The odds are read verbatim from the tier (lib/collectibles/warchests.ts,
 * validated to sum to 100 at module load). There is exactly one odds object,
 * never a second copy, so the printed box and the rolled box can never disagree.
 * The guarantee floor printed on the box is enforced here after the draw.
 *
 * Only digital chests are opened here. The King's Reliquary is physical: its
 * digital twins are minted through the redemption code flow, not this pull.
 */

export type PackRarity = Exclude<Rarity, "common">;

/* The rarity ladder, low to high. The index is the rank used for comparisons
   and for enforcing a guarantee floor. */
const RARITY_ORDER: PackRarity[] = ["rare", "epic", "legendary", "mythic"];

function rank(r: PackRarity): number {
  return RARITY_ORDER.indexOf(r);
}

export interface PulledCard {
  /* The Set One collector number, 1 through 40. */
  number: number;
  slug: string;
  name: string;
  rarity: PackRarity;
}

export interface OpenInputs {
  tier: ChestTier;
  /* The committed secret. Kept server-side until reveal. */
  serverSeed: string;
  /* The buyer's contribution. Any string; empty is allowed but a real client
     seed is what proves the server did not precompute the result. */
  clientSeed: string;
  /* A per-open counter that makes each opening of the same chest by the same
     buyer draw independently. The route uses the buyer's opening count. */
  nonce: number;
}

export interface OpenResult {
  cards: PulledCard[];
  /* The commitment. sha256(serverSeed), published before the pull. */
  serverSeedHash: string;
}

/* A cryptographically random server seed, as hex. Node's randomBytes, not
   Math.random: the seed is the thing the whole guarantee of fairness rests on. */
export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

/* The public commitment for a seed. Published before the pull, checked by the
   buyer after the reveal. */
export function hashSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed).digest("hex");
}

/* A uniform float in [0, 1), derived deterministically from the seeds and a
   label. Each label is an independent draw: the same (serverSeed, clientSeed,
   nonce) with a different label gives an independent uniform, so one HMAC key
   supplies every random decision an opening needs without correlation. */
function uniform(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  label: string
): number {
  const mac = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}:${label}`)
    .digest();
  /* 52 bits of entropy, the full mantissa of a double, so the float is uniform
     across the whole [0, 1) range with no gaps. */
  let value = 0;
  for (let i = 0; i < 7; i++) value = value * 256 + mac[i];
  return value / 2 ** 56;
}

/* Draw one rarity against the tier's printed odds. The odds are percentages
   summing to 100 (validated in warchests.ts); this walks the cumulative
   distribution in the fixed rarity order, so the mapping from float to rarity
   is stable and auditable. */
function drawRarity(tier: ChestTier, u: number): PackRarity {
  const target = u * 100;
  let cumulative = 0;
  for (const r of RARITY_ORDER) {
    cumulative += tier.odds[r] ?? 0;
    if (target < cumulative) return r;
  }
  /* Floating-point slack at the very top of the range: award the highest
     rarity present rather than fall off the end. */
  for (let i = RARITY_ORDER.length - 1; i >= 0; i--) {
    if ((tier.odds[RARITY_ORDER[i]] ?? 0) > 0) return RARITY_ORDER[i];
  }
  return "rare";
}

/* Pick one specific Set One card of a given rarity, uniformly. The set is the
   real card list derived from the champion roster, so a pull is always a real
   card, never an invented one. */
function drawCard(rarity: PackRarity, u: number): PulledCard {
  const pool = setOneCards.filter((c) => c.champion.rarity === rarity);
  if (pool.length === 0) {
    throw new Error(`Set One has no ${rarity} cards to pull.`);
  }
  const idx = Math.min(pool.length - 1, Math.floor(u * pool.length));
  const chosen = pool[idx];
  return {
    number: chosen.number,
    slug: chosen.champion.slug,
    name: chosen.champion.name,
    rarity,
  };
}

/* How many cards a tier's box holds, read from its printed contents ("3 cards
   from Set One"). Parsing the printed contents keeps this in step with the box
   the buyer was shown rather than a second number that could drift. */
export function cardCount(tier: ChestTier): number {
  for (const line of tier.contents) {
    const m = /(\d+)\s+(?:printed\s+)?cards?/i.exec(line);
    if (m) return Number(m[1]);
  }
  throw new Error(`Chest tier ${tier.sku} declares no card count in contents.`);
}

/* The guarantee floor, read from the tier's printed guarantee ("At least one
   Epic or better"). The highest rarity named in the guarantee is the floor the
   box promises. Null when the guarantee names no card rarity (a print-only
   guarantee, handled by fulfillment). */
export function guaranteeFloor(tier: ChestTier): PackRarity | null {
  let floor: PackRarity | null = null;
  const text = tier.guarantee.toLowerCase();
  for (const r of RARITY_ORDER) {
    if (text.includes(r)) {
      if (floor === null || rank(r) > rank(floor)) floor = r;
    }
  }
  return floor;
}

/* Open a digital chest. Deterministic given the inputs, which is the whole
   guarantee: the buyer replays this and gets the same cards. */
export function openChest(inputs: OpenInputs): OpenResult {
  const { tier, serverSeed, clientSeed, nonce } = inputs;
  const count = cardCount(tier);
  const cards: PulledCard[] = [];

  for (let i = 0; i < count; i++) {
    const rarityU = uniform(serverSeed, clientSeed, nonce, `rarity:${i}`);
    const rarity = drawRarity(tier, rarityU);
    const cardU = uniform(serverSeed, clientSeed, nonce, `card:${i}`);
    cards.push(drawCard(rarity, cardU));
  }

  /* Enforce the printed guarantee. If nothing drawn meets the floor, lift the
     single weakest card up to exactly the floor rarity. This honours "at least
     one X or better" precisely: it never removes a lucky high pull, and it
     changes exactly one slot, the least valuable one, so the box delivers no
     less than it printed and no arbitrary extra. */
  const floor = guaranteeFloor(tier);
  if (floor && !cards.some((c) => rank(c.rarity) >= rank(floor))) {
    let worst = 0;
    for (let i = 1; i < cards.length; i++) {
      if (rank(cards[i].rarity) < rank(cards[worst].rarity)) worst = i;
    }
    const cardU = uniform(serverSeed, clientSeed, nonce, `guarantee`);
    cards[worst] = drawCard(floor, cardU);
  }

  return { cards, serverSeedHash: hashSeed(serverSeed) };
}
