import { champions, type Champion, type Rarity } from "@/lib/game/champions";

/* Set One: Champions of the Six Houses (V2 Part Two, section 31).
 *
 * The first card set of the Reliquary, derived from the War's own roster
 * rather than duplicated from it. `lib/game/champions.ts` stays the single
 * source of truth for every name, title, house, rarity, ability, stat and
 * lore line; this file only decides WHICH forty champions form the set and in
 * what order. When a champion's data changes in the game, the card changes
 * with it, and the two can never disagree.
 *
 * Forty cards: 2 mythic, 12 legendary, 13 epic, 13 rare, six to seven per
 * House, in the order of the published manifest (docs/RAVENSPIRE-V2.md,
 * section 31). The counts below are computed from the data rather than typed,
 * for the same reason the set derives from the roster: a number nobody types
 * is a number that cannot drift. */

const SET_ONE_SLUGS = [
  /* Mythic */
  "the-faceless",
  "kaelen-dragonborn",
  /* Legendary */
  "aeron-the-black",
  "corvus-ashwing",
  "pyrra-flameheart",
  "varek-hollowflame",
  "grommash",
  "helga-winterborn",
  "tempest-kael",
  "lyra-windmere",
  "vorian-nightblade",
  "umbra-veilwalker",
  "leonar-goldmane",
  "isolde-the-pure",
  /* Epic */
  "thessaly-quill",
  "ravenna-holt",
  "karn-the-reaver",
  "ashka-emberveil",
  "torvald-ironhand",
  "gwendal-frost",
  "mira-stormborn",
  "wren-galecaller",
  "cormac-thunderhide",
  "morrigan-shadowmist",
  "sable-nightwood",
  "octavia-gilt",
  "elowen-brightshield",
  /* Rare */
  "nymeria-vale",
  "maren-darkfeather",
  "brom-coalbeard",
  "seraphine-dawnash",
  "ser-willas",
  "bjorn-frostfell",
  "ser-brannoch",
  "petra-boneweather",
  "bael-the-bard",
  "nyx-emberdim",
  "lady-ysolde",
  "ser-elyra",
  "cressida-lorne",
] as const;

export interface SetOneCard {
  /* The collector number, 1 through 40, printed on the physical card. */
  number: number;
  champion: Champion;
}

const bySlug = new Map(champions.map((c) => [c.slug, c] as const));

export const setOneCards: SetOneCard[] = SET_ONE_SLUGS.map((slug, i) => {
  const champion = bySlug.get(slug);
  if (!champion) {
    /* Thrown at module load, so a renamed champion breaks the build loudly
       instead of shipping a set with a hole in it. */
    throw new Error(`Set One names a champion that does not exist: ${slug}`);
  }
  return { number: i + 1, champion };
});

function tally(rarity: Rarity): number {
  return setOneCards.filter((c) => c.champion.rarity === rarity).length;
}

export const SET_ONE = {
  slug: "set-one",
  name: "Champions of the Six Houses",
  status: "preview" as const,
  cards: setOneCards,
  counts: {
    total: setOneCards.length,
    mythic: tally("mythic"),
    legendary: tally("legendary"),
    epic: tally("epic"),
    rare: tally("rare"),
  },
};
