"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import type { Icon3DName } from "@/components/ui/icon-3d-names";

export type { Icon3DName };

/* The 3D icon set.
 *
 * These are the large, expressive icons: forged gold and bone on a carved stone
 * plinth. They are not a replacement for the flat stroke glyphs in
 * components/ui/icon.tsx, which stay for buttons, navigation and dense rows.
 *
 * Use a 3D icon where the icon carries weight and has room to breathe: landing
 * sections, onboarding, empty states, Crest and Renown displays, House halls,
 * quest and reward moments. Never inline in a button.
 *
 * Files live in public/icons/3d/<slug>.png, produced by scripts/slice-icons.mjs
 * from the generated sheets. Run `npm run icons` after dropping new sheets in.
 *
 * The art is generated separately from the code, so a slug can legitimately be
 * referenced before its file exists. Rather than render a broken image, a
 * missing asset falls back to the flat glyph of the same idea inside a plinth
 * shaped tile. Surfaces that use a 3D icon therefore work before the art lands
 * and simply get richer when it does.
 */

/* Three readings of most subjects came off the sheets, and all three are kept.
   The bare slug is the default. `-v2` is the brighter, higher contrast reading,
   which reads better at small sizes and on dark panels. `-alt` is the darkest
   and most ornate, which belongs to the Forge register: Crest unlocks, Call
   resolutions, House victories. Picking per surface is the point of keeping
   them, so nothing here privileges one. */

/* Keyed by base slug rather than by full name, so `raven`, `raven-v2` and
   `raven-alt` all resolve to the same flat glyph without three entries. */
const FALLBACK_GLYPH: Record<string, string> = {
  raven: "raven",
  keep: "home",
  crown: "crown",
  council: "user",
  leadership: "crown",
  identity: "user",
  "house-hall": "banner",
  gatehouse: "shield",
  tower: "wall",
  world: "compass",
  "realm-map": "compass",
  banner: "banner",
  "house-corvane": "banner",
  rivalry: "swords",
  alliance: "medal",
  "oath-scroll": "scroll",
  "call-orb": "orb",
  accuracy: "target",
  scales: "medal",
  analytics: "poll",
  scrying: "eye",
  trophy: "crown",
  podium: "medal",
  chest: "coin",
  coins: "coin",
  vault: "wallet",
  celebration: "flame",
  growth: "poll",
  duel: "swords",
  arena: "swords",
  "crossed-axes": "swords",
  dragon: "flame",
  "dragon-egg": "flame",
  guard: "shield",
  games: "swords",
  training: "target",
  mount: "flag",
  whispers: "mail",
  envelope: "mail",
  gathering: "signal",
  "quest-scroll": "scroll",
  chronicle: "book",
  chronicler: "scroll",
  notifications: "bell",
  media: "image",
  archive: "bookmark",
  season: "flame",
  compass: "compass",
  "treasure-map": "compass",
  portal: "orb",
  voyage: "flag",
  campfire: "flame",
  brazier: "flame",
  "ember-hand": "flame",
  nightvale: "eye",
  hood: "user",
  forge: "flame",
  market: "coin",
  search: "search",
  network: "signal",
  workshop: "sliders",
  settings: "sliders",
  satchel: "bookmark",
  cards: "poll",
  alchemy: "orb",
  "herald-ai": "raven",
};

const SIZES = {
  sm: 40,
  md: 64,
  lg: 96,
  xl: 128,
  hero: 192,
} as const;

/* Glyph size for the fallback tile, roughly 46% of the plinth so the flat icon
   sits with the same optical weight the 3D art would have. */
const FALLBACK_GLYPH_CLASS: Record<keyof typeof SIZES, string> = {
  sm: "h-[18px] w-[18px]",
  md: "h-[29px] w-[29px]",
  lg: "h-[44px] w-[44px]",
  xl: "h-[59px] w-[59px]",
  hero: "h-[88px] w-[88px]",
};

export function Icon3D({
  name,
  size = "md",
  className = "",
  priority = false,
  alt = "",
}: {
  name: Icon3DName;
  size?: keyof typeof SIZES;
  className?: string;
  /* Set on the handful of icons that appear above the fold. */
  priority?: boolean;
  /* Decorative by default. Pass a label only when the icon carries meaning no
     adjacent text already conveys. */
  alt?: string;
}) {
  const px = SIZES[size];
  const [missing, setMissing] = useState(false);

  if (missing) {
    /* The art has not landed for this slug yet. Show the flat glyph of the same
       idea on a plinth shaped tile, which keeps the layout and the meaning. */
    return (
      <span
        aria-hidden={alt === "" ? true : undefined}
        role={alt === "" ? undefined : "img"}
        aria-label={alt === "" ? undefined : alt}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-gold/20 bg-panel-warm text-gold ${className}`}
        style={{ width: px, height: px }}
      >
        <Icon
          name={FALLBACK_GLYPH[name.replace(/-(v2|alt)$/, "")] ?? "orb"}
          className={FALLBACK_GLYPH_CLASS[size]}
        />
      </span>
    );
  }

  return (
    <Image
      src={`/icons/3d/${name}.png`}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      width={px}
      height={px}
      priority={priority}
      onError={() => setMissing(true)}
      className={`select-none object-contain ${className}`}
      /* The plinth already carries its own baked contact shadow and the asset
         now has generous transparent margin on every side, so the object and
         its board always sit fully inside the box. The CSS shadow is kept
         small and tight, just enough to seat the icon against obsidian: a
         large downward shadow read as the board bleeding off its base. */
      style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.4))" }}
    />
  );
}
