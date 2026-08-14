/* The Mercer (V2 Part Two, section 26.3): the official merch catalog.
 *
 * One source for the line, read by the Mercer page and the buy flow, and by
 * GET /api/mercer/products. Fourteen launch pieces across two ranges: the
 * Regalia (apparel) and the Table (trading card gear). Every piece has a real
 * product shot (public/brand/merch), obsidian and forged gold throughout.
 *
 * Prices live server-side in lib/commerce/catalog.ts, never here and never on a
 * customer surface until confirmed. A kind the founder has not priced is simply
 * not sellable yet, which keeps the real-data rule. */

export type MercerCategory = "apparel" | "table";

export const MERCER_CATEGORIES: {
  key: MercerCategory;
  label: string;
  plain: string;
}[] = [
  { key: "apparel", label: "Regalia", plain: "Worn" },
  { key: "table", label: "The Table", plain: "Trading card gear" },
];

export type MercerKind =
  | "tee"
  | "hoodie"
  | "cap"
  | "long-sleeve"
  | "shorts"
  | "joggers"
  | "tracksuit"
  | "belt"
  | "sleeveless"
  | "sleeves"
  | "deck-box"
  | "playmat"
  | "binder";

export interface MercerSku {
  sku: string;
  name: string;
  kind: MercerKind;
  category: MercerCategory;
  /* The product shot, sliced from the brand renders. Sits on obsidian. */
  art: string;
  blurb: string;
}

export const MERCER_SKUS: MercerSku[] = [
  /* Regalia: worn. */
  {
    sku: "watcher-tee",
    name: "The Watcher Tee",
    kind: "tee",
    category: "apparel",
    art: "/brand/merch/tee-watcher.png",
    blurb: "Obsidian black, the raven crest set over the heart.",
  },
  {
    sku: "ashen-circle-tee",
    name: "Ashen Circle Tee",
    kind: "tee",
    category: "apparel",
    art: "/brand/merch/tee-ashen.png",
    blurb: "The raven ringed in ember and gold, worked full across the back.",
  },
  {
    sku: "citadel-hoodie",
    name: "Citadel Raven Hoodie",
    kind: "hoodie",
    category: "apparel",
    art: "/brand/merch/hoodie.png",
    blurb: "Heavyweight obsidian, the chained crest at the chest.",
  },
  {
    sku: "raven-cap",
    name: "Raven Crest Cap",
    kind: "cap",
    category: "apparel",
    art: "/brand/merch/cap.png",
    blurb: "Obsidian cap, the crest cast at the front.",
  },
  {
    sku: "rune-long-sleeve",
    name: "Rune Long Sleeve",
    kind: "long-sleeve",
    category: "apparel",
    art: "/brand/merch/long-sleeve.png",
    blurb: "Gold seams down the sleeve, the crest at the chest.",
  },
  {
    sku: "raven-shorts",
    name: "Raven Shorts",
    kind: "shorts",
    category: "apparel",
    art: "/brand/merch/shorts.png",
    blurb: "Obsidian shorts, the crest at the hip.",
  },
  {
    sku: "raven-joggers",
    name: "Raven Joggers",
    kind: "joggers",
    category: "apparel",
    art: "/brand/merch/joggers.png",
    blurb: "Tapered obsidian joggers with gold seams.",
  },
  {
    sku: "raven-tracksuit",
    name: "The Raven Tracksuit",
    kind: "tracksuit",
    category: "apparel",
    art: "/brand/merch/tracksuit.png",
    blurb: "Jacket and pants, gold-piped obsidian, the crest on both.",
  },
  {
    sku: "crest-belt",
    name: "Crest Belt",
    kind: "belt",
    category: "apparel",
    art: "/brand/merch/belt.png",
    blurb: "Leather, the raven crest cast heavy on the buckle.",
  },
  {
    sku: "crest-sleeveless",
    name: "Crest Sleeveless",
    kind: "sleeveless",
    category: "apparel",
    art: "/brand/merch/sleeveless.png",
    blurb: "Sleeveless obsidian, crest at the chest, the full raven down the back.",
  },

  /* The Table: trading card gear. */
  {
    sku: "card-sleeves",
    name: "Crested Card Sleeves",
    kind: "sleeves",
    category: "table",
    art: "/brand/merch/card-sleeves.png",
    blurb: "Standard 66 by 91mm, the crest on every back. They guard your Set One.",
  },
  {
    sku: "deck-box",
    name: "The Deck Box",
    kind: "deck-box",
    category: "table",
    art: "/brand/merch/deck-box.png",
    blurb: "Leather and gold, holds a hundred sleeved cards.",
  },
  {
    sku: "playmat",
    name: "Stitched Playmat",
    kind: "playmat",
    category: "table",
    art: "/brand/merch/playmat.png",
    blurb: "The raven over the realm, stitched edge, sized for the table.",
  },
  {
    sku: "raven-binder",
    name: "The Binder",
    kind: "binder",
    category: "table",
    art: "/brand/merch/binder.png",
    blurb: "Leather nine-pocket binder, the crest on the cover.",
  },
];
