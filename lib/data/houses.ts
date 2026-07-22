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
