import "server-only";
import { createHmac, createHash } from "node:crypto";
import type { Rarity } from "@/lib/game/champions";
import { SET_ONE } from "@/lib/collectibles/set-one";
import type { ChestTier } from "@/lib/collectibles/warchests";

/* What comes out of a chest, and why anyone should believe it.
 *
 * PROVABLY FAIR, AND THE PART THAT USUALLY IS NOT.
 * Almost every "provably fair" loot box publishes a seed hash. Far fewer
 * publish it BEFORE the roll, and that is the whole game: a server that picks
 * its seed at open time can quietly roll a thousand seeds and publish the hash
 * of whichever one paid least. The commitment has to exist before the member
 * can act on it, so in this realm the server seed is generated and its hash
 * published when a member first looks at the chests, not when they open one
 * (see the chest_seeds table and /api/chests/seed). By the time an opening
 * happens, the hash is already in the member's hands and the seed behind it
 * cannot change.
 *
 * The three inputs, and what each one is for:
 *   server seed   committed as a hash before any opening, revealed when the
 *                 member rotates it. Stops the member predicting the roll.
 *   client seed   chosen by the member, any text they like. Stops the server
 *                 choosing the roll, because it cannot know this in advance.
 *   nonce         the entitlement being spent, which is a uuid and therefore
 *                 unique to one opening. Stops the same pair of seeds
 *                 producing the same chest twice, and, because it is fixed
 *                 before the roll rather than counted during it, stops a
 *                 replayed open producing a different result.
 *
 * The roll is a pure function of those three. Nothing here reads a clock, a
 * database, or a random number generator, which is exactly what makes it
 * checkable: anyone holding the revealed seed can rerun it and get the same
 * cards. That is what the verifier page renders.
 *
 * The catalog it draws from is the real one. Cards come from
 * lib/collectibles/set-one.ts, which derives from the champion roster, so a
 * pull can never produce a card that does not exist.
 */

export type PulledCard = {
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: Rarity;
  /* True when the guarantee moved this card up. Recorded because a floor that
     fires silently is a floor nobody can audit, and the Ceremony says so. */
  guaranteed?: boolean;
};

export type ChestRoll = {
  cards: PulledCard[];
  /* Everything a third party needs to rerun this exact roll. */
  proof: {
    server_seed_hash: string;
    client_seed: string;
    nonce: string;
  };
};

/* The rarity ladder, low to high. Order matters twice: the floor compares
   against it, and the draw walks it. */
const LADDER: Exclude<Rarity, "common">[] = [
  "rare",
  "epic",
  "legendary",
  "mythic",
];

/* Where a rarity sits on the ladder. `common` is not on it: no Set One card is
   common and none can be pulled, so it ranks below the bottom rung rather than
   being quietly treated as rare, which would let a stray common satisfy a
   guarantee it does not meet. */
function rank(rarity: Rarity): number {
  const i = LADDER.indexOf(rarity as Exclude<Rarity, "common">);
  return i;
}

/* Cards of each rarity in the set, indexed once per module load. */
const BY_RARITY = new Map<string, typeof SET_ONE.cards>();
for (const rarity of LADDER) {
  BY_RARITY.set(
    rarity,
    SET_ONE.cards.filter((card) => card.champion.rarity === rarity)
  );
}

export function seedHash(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

/* One draw: a float in [0, 1), derived from the three inputs and a label.
   The label is what keeps the draws independent. Deriving every draw from the
   same HMAC and slicing it produces correlated results, which is the classic
   way a "fair" shuffle turns out to deal the same hand more often than it
   should. Each draw asks its own question and gets its own answer.

   Fifty-two bits, because that is what a double can hold exactly. Taking more
   would round, and a rounded draw is not the draw the verifier reproduces. */
function draw(
  serverSeed: string,
  clientSeed: string,
  nonce: string,
  label: string
): number {
  const digest = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}:${label}`)
    .digest("hex");
  const bits = Number.parseInt(digest.slice(0, 13), 16);
  return bits / 2 ** 52;
}

/* Pick a rarity against the printed odds. The odds are read from the tier
   itself rather than copied, so the table that is printed on the box and the
   table that is rolled against are the same object. */
function drawRarity(tier: ChestTier, roll: number): Exclude<Rarity, "common"> {
  const total = LADDER.reduce((sum, r) => sum + (tier.odds[r] ?? 0), 0);
  let cursor = roll * total;
  for (const rarity of LADDER) {
    const weight = tier.odds[rarity] ?? 0;
    if (cursor < weight) return rarity;
    cursor -= weight;
  }
  /* Floating point landed past the last edge. The last rung with any weight
     is the honest answer, never a silent default to the cheapest one. */
  for (let i = LADDER.length - 1; i >= 0; i -= 1) {
    if ((tier.odds[LADDER[i]] ?? 0) > 0) return LADDER[i];
  }
  throw new Error(`Chest ${tier.sku} has no odds to roll against`);
}

function drawCard(
  rarity: Exclude<Rarity, "common">,
  roll: number
): PulledCard {
  const pool = BY_RARITY.get(rarity) ?? [];
  if (pool.length === 0) {
    throw new Error(`Set One holds no ${rarity} cards to pull`);
  }
  const card = pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
  return {
    set_slug: SET_ONE.slug,
    card_number: card.number,
    champion_slug: card.champion.slug,
    rarity: card.champion.rarity,
  };
}

export function rollChest(args: {
  tier: ChestTier;
  serverSeed: string;
  clientSeed: string;
  nonce: string;
}): ChestRoll {
  const { tier, serverSeed, clientSeed, nonce } = args;
  const cards: PulledCard[] = [];

  for (let i = 0; i < tier.cardCount; i += 1) {
    const rarity = drawRarity(
      tier,
      draw(serverSeed, clientSeed, nonce, `rarity:${i}`)
    );
    cards.push(drawCard(rarity, draw(serverSeed, clientSeed, nonce, `card:${i}`)));
  }

  /* The guarantee. It fires only when the roll missed the floor on its own,
     which is the honest reading of "at least one Legendary or better in every
     chest": the floor is a safety net under the odds, not a card dealt outside
     them. The upgraded slot is the last one, always, so the rule is one
     sentence and a member watching the Ceremony can see where it landed. */
  const floorRank = LADDER.indexOf(tier.floor);
  const met = cards.some((card) => rank(card.rarity) >= floorRank);
  if (!met && cards.length > 0) {
    const upgraded = drawCard(
      tier.floor,
      draw(serverSeed, clientSeed, nonce, "guarantee")
    );
    cards[cards.length - 1] = { ...upgraded, guaranteed: true };
  }

  return {
    cards,
    proof: {
      server_seed_hash: seedHash(serverSeed),
      client_seed: clientSeed,
      nonce,
    },
  };
}
