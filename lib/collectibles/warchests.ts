import type { Rarity } from "@/lib/game/champions";

/* Warchests (V2 Part Two, section 26.2): the mystery box catalog.
 *
 * One source for the chest tiers, read by the Warchests page today and by
 * GET /api/chests when the backend lands. Everything here is PLANNED and is
 * labeled that way on every surface: odds are final before launch, prices do
 * not exist yet and so do not appear here at all.
 *
 * The honesty law for chests (section 34): exact odds printed on the box,
 * a guaranteed floor in every chest, no invented scarcity. The odds below
 * are validated at module load so a tier whose odds do not sum to 100 breaks
 * the build instead of shipping a dishonest box. */

export interface ChestTier {
  sku: string;
  name: string;
  kind: "digital" | "physical";
  plain: string;
  /* What one chest holds, as printed on the box. */
  contents: string[];
  /* Per-card pull odds, in percent. Must sum to exactly 100. */
  odds: Record<Exclude<Rarity, "common">, number>;
  /* The floor every buyer is guaranteed, printed beside the odds. */
  guarantee: string;
  /* How many cards the chest actually deals. The `contents` line above is the
     copy printed on the box; this is the number the opening rolls. They are
     kept apart because one is prose that a copy edit may reword and the other
     is a rule that must never change quietly, and they are checked against
     each other at module load below. */
  cardCount: number;
  /* The rarity every chest is guaranteed to reach, which is the `guarantee`
     line above expressed as a rule the roll can enforce. */
  floor: Exclude<Rarity, "common">;
}

export const CHEST_TIERS: ChestTier[] = [
  {
    sku: "squires-chest",
    name: "Squire's Chest",
    kind: "digital",
    plain: "The entry chest",
    contents: ["3 cards from Set One"],
    odds: { rare: 74, epic: 20, legendary: 5.4, mythic: 0.6 },
    guarantee: "At least one Epic or better in every chest",
    cardCount: 3,
    floor: "epic",
  },
  {
    sku: "knights-warchest",
    name: "Knight's Warchest",
    kind: "digital",
    plain: "The collector's chest",
    contents: ["5 cards from Set One"],
    odds: { rare: 55, epic: 30, legendary: 13, mythic: 2 },
    guarantee: "At least one Legendary or better in every chest",
    cardCount: 5,
    floor: "legendary",
  },
  {
    sku: "kings-reliquary",
    name: "King's Reliquary",
    kind: "physical",
    plain: "The box that ships",
    contents: [
      "One piece of official merch from the Mercer",
      "10 printed cards from Set One",
      "A single-use code that mints the digital twins to your own wallet",
    ],
    odds: { rare: 45, epic: 33, legendary: 19, mythic: 3 },
    guarantee: "At least one Legendary or better, and one full-art print",
    cardCount: 10,
    floor: "legendary",
  },
];

for (const tier of CHEST_TIERS) {
  const sum = Object.values(tier.odds).reduce((a, b) => a + b, 0);
  /* Floating point slack of a hundredth of a percent, nothing more. */
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error(
      `Chest odds for ${tier.sku} sum to ${sum}, not 100. A box never ships with dishonest odds.`
    );
  }

  /* The printed count and the dealt count must be the same number. A box that
     says three cards and deals two is the single worst bug this product could
     ship, and it would not fail any other check: the odds would still sum to
     100 and every card would still be real. So the copy is read, and a tier
     whose prose does not carry its own card count breaks the build. */
  const printed = tier.contents.join(" ").match(/(\d+)\s+(?:printed\s+)?cards?\b/i);
  if (!printed || Number(printed[1]) !== tier.cardCount) {
    throw new Error(
      `Chest ${tier.sku} deals ${tier.cardCount} cards but its printed contents say otherwise. The box and the roll must agree.`
    );
  }

  /* A floor the odds cannot reach is a promise the roll cannot keep. */
  if (!(tier.floor in tier.odds)) {
    throw new Error(
      `Chest ${tier.sku} guarantees ${tier.floor}, which is not on its odds table.`
    );
  }
}
