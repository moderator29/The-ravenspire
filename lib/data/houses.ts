export interface House {
  slug: string;
  name: string;
  motto: string;
  sigil: string;
  element: string;
  color: string;
  desc: string;
}

export const houses: House[] = [
  {
    slug: "corvane",
    name: "House Corvane",
    motto: "The Raven Remembers",
    sigil: "raven",
    element: "cunning",
    color: "#C8A24C",
    desc: "Obsidian feathers, golden eyes, and a plan for everything. Corvane draws the schemers, the trivia hoarders, and anyone who wins the game three moves before it starts.",
  },
  {
    slug: "emberfall",
    name: "House Emberfall",
    motto: "Burn Brighter",
    sigil: "flame",
    element: "fire",
    color: "#E5702A",
    desc: "First into the fray, loudest at the feast. Emberfall is for the bold ones who would rather blaze gloriously than smolder politely.",
  },
  {
    slug: "frosthold",
    name: "House Frosthold",
    motto: "Ice Does Not Yield",
    sigil: "snowflake",
    element: "ice",
    color: "#6E7683",
    desc: "Steel nerves, glacier patience. Frosthold gathers the ones who outlast everyone else and look unbothered doing it.",
  },
  {
    slug: "stormcrest",
    name: "House Stormcrest",
    motto: "Swift as Thunder",
    sigil: "storm",
    element: "storm",
    color: "#ECE4D2",
    desc: "Bone-white banners moving too fast to read. Stormcrest is home to the quick answerers, the first repliers, and everyone allergic to waiting.",
  },
  {
    slug: "nightvale",
    name: "House Nightvale",
    motto: "In Shadow, Truth",
    sigil: "moon",
    element: "shadow",
    color: "#7E1F1C",
    desc: "They know what you did at the last banquet, and they are not telling. Nightvale suits the quiet observers who collect secrets like others collect coins.",
  },
  {
    slug: "goldmane",
    name: "House Goldmane",
    motto: "Fortune Favors the Loud",
    sigil: "lion",
    element: "wealth",
    color: "#F0D68C",
    desc: "Lions with excellent hair and even better taste. Goldmane welcomes the charmers, the hosts, and anyone who treats every entrance like a coronation.",
  },
];

/* Which Icon draws each House sigil.

   This map was copy-pasted verbatim into three files: the Houses index, the
   Crossroads House rail, and the welcome flow. Three copies of six lines is
   three chances for a new House to appear with a fallback banner in one place
   and its real sigil in the others. It lives next to the House data now. */
export const sigilIcon: Record<string, string> = {
  raven: "raven",
  flame: "flame",
  snowflake: "shield",
  storm: "signal",
  moon: "eye",
  lion: "crown",
};

export function houseBySlug(slug: string | null | undefined): House | null {
  if (!slug) return null;
  return houses.find((h) => h.slug === slug) ?? null;
}

/* The Icon name for a House, resolved through its sigil. */
export function houseIcon(slug: string | null | undefined): string {
  const house = houseBySlug(slug);
  return sigilIcon[house?.sigil ?? ""] ?? "banner";
}

/* How many members count toward a House's score (V2 section 11.1b).

   Six Houses of unequal membership summed across every member is won by
   headcount, not by skill. Lichess scores a team battle as the sum of its top
   N members only, which is exactly size neutral, and their configurable
   ceiling is 20. Ravenspire takes the same number. */
export const HOUSE_TOP_N = 20;

/* House progression.

   Level L opens at 250 * L * (L - 1) cumulative seasonal contribution, so the
   rungs land at 0, 500, 1500, 3000, 5000 and widen from there. Cumulative,
   never reset: a House that carried Season 1 keeps that standing forever even
   if it is having a quiet Season 4. */
export function houseLevel(cumulative: number): {
  level: number;
  floor: number;
  next: number;
  progress: number;
} {
  const total = Math.max(0, Math.floor(cumulative));
  const level = Math.floor((1 + Math.sqrt(1 + total / 62.5)) / 2);
  const floorAt = 250 * level * (level - 1);
  const next = 250 * (level + 1) * level;
  const span = next - floorAt;
  return {
    level,
    floor: floorAt,
    next,
    progress: span > 0 ? Math.min(1, (total - floorAt) / span) : 0,
  };
}
