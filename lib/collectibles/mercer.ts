/* The Mercer (V2 Part Two, section 26.3): the official merch catalog.
 *
 * One source for the line, read by the Mercer page today and by
 * GET /api/mercer/products when the backend lands. Thirty pieces across four
 * ranges: the Regalia (apparel), the Table (trading card gear), Emblems, and
 * the Hall (prints and everyday). Quality over noise: the range is broad but
 * every piece is the same obsidian and forged gold.
 *
 * Until physical samples are approved there is no product photography, so each
 * piece renders as a type-led plate rather than an image pretending to be a
 * product. No prices, sizes or stock counts appear anywhere, because none exist
 * yet. Launch is a curated subset going live first, then the rest as drops; the
 * catalog carries the whole plan so nothing is invented later. */

export type MercerCategory = "apparel" | "table" | "emblems" | "hall";

export const MERCER_CATEGORIES: {
  key: MercerCategory;
  label: string;
  plain: string;
}[] = [
  { key: "apparel", label: "Regalia", plain: "Apparel" },
  { key: "table", label: "The Table", plain: "Trading card gear" },
  { key: "emblems", label: "Emblems", plain: "Pins, patches and banners" },
  { key: "hall", label: "The Hall", plain: "Prints and everyday" },
];

export type MercerKind =
  | "tee"
  | "long-sleeve"
  | "hoodie"
  | "crewneck"
  | "cap"
  | "beanie"
  | "sleeves"
  | "deck-box"
  | "binder"
  | "playmat"
  | "pin"
  | "banner"
  | "coin"
  | "patch"
  | "stickers"
  | "print"
  | "poster"
  | "tote"
  | "mug"
  | "phone-case";

export interface MercerSku {
  sku: string;
  name: string;
  kind: MercerKind;
  category: MercerCategory;
  /* The plate word, set large in the display face until photography exists. */
  plate: string;
  blurb: string;
}

export const MERCER_SKUS: MercerSku[] = [
  /* Regalia: apparel. */
  {
    sku: "watcher-tee",
    name: "The Watcher Tee",
    kind: "tee",
    category: "apparel",
    plate: "Tee",
    blurb: "Obsidian black, the raven crest over the heart and the full mark across the back.",
  },
  {
    sku: "crown-of-ash-tee",
    name: "Crown of Ash Tee",
    kind: "tee",
    category: "apparel",
    plate: "Tee",
    blurb: "A crowned raven in forged gold, set on obsidian.",
  },
  {
    sku: "ravenspire-crest-tee",
    name: "Ravenspire Crest Tee",
    kind: "tee",
    category: "apparel",
    plate: "Tee",
    blurb: "The full crest across the back, the wordmark at the chest.",
  },
  {
    sku: "house-sigils-tee",
    name: "House Sigils Tee",
    kind: "tee",
    category: "apparel",
    plate: "Tee",
    blurb: "Six Houses, their sigils rendered in gold.",
  },
  {
    sku: "ember-wings-tee",
    name: "Ember Wings Tee",
    kind: "tee",
    category: "apparel",
    plate: "Tee",
    blurb: "Wings of ember and gold, front and center.",
  },
  {
    sku: "ashen-circle-tee",
    name: "Ashen Circle Tee",
    kind: "tee",
    category: "apparel",
    plate: "Tee",
    blurb: "Bone colorway, the raven ringed in ash and gold.",
  },
  {
    sku: "oath-of-ravens-tee",
    name: "Oath of Ravens Tee",
    kind: "tee",
    category: "apparel",
    plate: "Tee",
    blurb: "Bone, a full-back reading of the oath sworn in gold.",
  },
  {
    sku: "rune-strike-long",
    name: "Rune Strike Long Sleeve",
    kind: "long-sleeve",
    category: "apparel",
    plate: "Long Sleeve",
    blurb: "Gold runes down the sleeve, the mark at the chest.",
  },
  {
    sku: "house-bannermark-long",
    name: "House Bannermark Long Sleeve",
    kind: "long-sleeve",
    category: "apparel",
    plate: "Long Sleeve",
    blurb: "A House banner worked the length of the left sleeve.",
  },
  {
    sku: "citadel-raven-hoodie",
    name: "Citadel Raven Hoodie",
    kind: "hoodie",
    category: "apparel",
    plate: "Hoodie",
    blurb: "Heavyweight obsidian, the citadel raven at the chest.",
  },
  {
    sku: "watchtower-hoodie",
    name: "Watchtower Hoodie",
    kind: "hoodie",
    category: "apparel",
    plate: "Hoodie",
    blurb: "The watchtower raven, full back, in gold and ember.",
  },
  {
    sku: "crested-crown-crew",
    name: "Crested Crown Crewneck",
    kind: "crewneck",
    category: "apparel",
    plate: "Crewneck",
    blurb: "The crowned crest at the heart, clean and heavy.",
  },
  {
    sku: "raven-cap",
    name: "Raven Bannered Cap",
    kind: "cap",
    category: "apparel",
    plate: "Cap",
    blurb: "Obsidian cap, the raven stitched at the front.",
  },
  {
    sku: "crest-cap",
    name: "Crest Embroidered Cap",
    kind: "cap",
    category: "apparel",
    plate: "Cap",
    blurb: "The crest embroidered in gold thread.",
  },
  {
    sku: "ravenspire-beanie",
    name: "Ravenspire Beanie",
    kind: "beanie",
    category: "apparel",
    plate: "Beanie",
    blurb: "Cuffed obsidian beanie, the mark at the fold.",
  },
  {
    sku: "crest-patch-beanie",
    name: "Crest Leather Patch Beanie",
    kind: "beanie",
    category: "apparel",
    plate: "Beanie",
    blurb: "A leather crest patch on a heavy cuff.",
  },

  /* The Table: trading card gear. */
  {
    sku: "card-sleeves",
    name: "Crested Card Sleeves",
    kind: "sleeves",
    category: "table",
    plate: "Sleeves",
    blurb: "Standard 66 by 91mm, the crest on every back. They guard your Set One.",
  },
  {
    sku: "deck-box",
    name: "The Deck Box",
    kind: "deck-box",
    category: "table",
    plate: "Deck Box",
    blurb: "Holds a hundred sleeved cards, obsidian and gold.",
  },
  {
    sku: "ring-binder",
    name: "The Three-Ring Binder",
    kind: "binder",
    category: "table",
    plate: "Binder",
    blurb: "Nine-pocket pages, the crest on the cover.",
  },
  {
    sku: "playmat",
    name: "Stitched Playmat",
    kind: "playmat",
    category: "table",
    plate: "Playmat",
    blurb: "The battlefield stitched at the edge, sized for the table.",
  },

  /* Emblems: pins, patches, banners. */
  {
    sku: "crest-pin",
    name: "Crest Enamel Pin",
    kind: "pin",
    category: "emblems",
    plate: "Pin",
    blurb: "The raven crest in hard enamel, gold and ember.",
  },
  {
    sku: "house-flag",
    name: "House Banner",
    kind: "banner",
    category: "emblems",
    plate: "Banner",
    blurb: "A woven House flag, gold on obsidian, sized to hang.",
  },
  {
    sku: "challenge-coin",
    name: "The Challenge Coin",
    kind: "coin",
    category: "emblems",
    plate: "Coin",
    blurb: "Antique gold, the raven struck on both faces.",
  },
  {
    sku: "raven-patch",
    name: "Raven Patch",
    kind: "patch",
    category: "emblems",
    plate: "Patch",
    blurb: "Sew or velcro, the crest in gold thread.",
  },
  {
    sku: "sticker-pack",
    name: "Sticker Pack",
    kind: "stickers",
    category: "emblems",
    plate: "Stickers",
    blurb: "Six of them, ravens and crests, gold and ember.",
  },

  /* The Hall: prints and everyday. */
  {
    sku: "art-print-spire",
    name: "The Spire, Art Print",
    kind: "print",
    category: "hall",
    plate: "Print",
    blurb: "The spire under a raven moon, numbered, on museum stock.",
  },
  {
    sku: "ravenspire-poster",
    name: "Ravenspire Poster",
    kind: "poster",
    category: "hall",
    plate: "Poster",
    blurb: "The raven over the realm, dark and gold.",
  },
  {
    sku: "raven-tote",
    name: "The Tote",
    kind: "tote",
    category: "hall",
    plate: "Tote",
    blurb: "Obsidian canvas, the crest at the center.",
  },
  {
    sku: "ceramic-mug",
    name: "Ceramic Mug",
    kind: "mug",
    category: "hall",
    plate: "Mug",
    blurb: "Black and gold, the crest fired into the glaze.",
  },
  {
    sku: "phone-case",
    name: "Phone Case",
    kind: "phone-case",
    category: "hall",
    plate: "Case",
    blurb: "The crest on obsidian, for iPhone and Android.",
  },
];
