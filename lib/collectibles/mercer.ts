/* The Mercer (V2 Part Two, section 26.3): the official merch catalog.
 *
 * One source for the launch SKUs, read by the Mercer page today and by
 * GET /api/mercer/products when the backend lands. Five pieces, quality over
 * catalog, print-on-demand, per the plan. No prices, no sizes, no stock
 * counts appear anywhere because none exist yet; product photography replaces
 * the type-led plates when the physical samples are approved. */

export interface MercerSku {
  sku: string;
  name: string;
  kind: "tee" | "hoodie" | "cap" | "print" | "playmat";
  /* The plate word, set large in the display face until photography exists. */
  plate: string;
  blurb: string;
}

export const MERCER_SKUS: MercerSku[] = [
  {
    sku: "obsidian-tee",
    name: "The Obsidian Tee",
    kind: "tee",
    plate: "Tee",
    blurb: "Obsidian black, the realm's mark in forged gold over the heart.",
  },
  {
    sku: "rookery-hoodie",
    name: "The Rookery Hoodie",
    kind: "hoodie",
    plate: "Hoodie",
    blurb: "Heavyweight, hooded like the tower it is named for.",
  },
  {
    sku: "banner-cap",
    name: "The Banner Cap",
    kind: "cap",
    plate: "Cap",
    blurb: "Six Houses, one crown. Your banner stitched on the side.",
  },
  {
    sku: "set-one-print",
    name: "Set One Art Print",
    kind: "print",
    plate: "Print",
    blurb: "A single champion's portrait, museum stock, numbered.",
  },
  {
    sku: "war-playmat",
    name: "The War Playmat",
    kind: "playmat",
    plate: "Playmat",
    blurb: "The battlefield itself, stitched edge, sized for the table.",
  },
];
