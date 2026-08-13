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
  /* Chest art, sliced from the brand renders. `closed` is the store hero,
     `open` is the burst shown in the pack-opening Ceremony. Physical tiers also
     carry `box`, the shipping packaging plate. All sit on obsidian. */
  art: { closed: string; open: string; box?: string };
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
    art: {
      closed: "/brand/chests/squire-closed.png",
      open: "/brand/chests/squire-open.png",
    },
  },
  {
    sku: "knights-warchest",
    name: "Knight's Warchest",
    kind: "digital",
    plain: "The collector's chest",
    contents: ["5 cards from Set One"],
    odds: { rare: 55, epic: 30, legendary: 13, mythic: 2 },
    guarantee: "At least one Legendary or better in every chest",
    art: {
      closed: "/brand/chests/knight-closed.png",
      open: "/brand/chests/knight-open.png",
    },
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
    art: {
      closed: "/brand/chests/king-closed.png",
      open: "/brand/chests/king-open.png",
      box: "/brand/chests/king-box.png",
    },
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
}
