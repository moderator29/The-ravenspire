"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/icon";

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

export type Icon3DName =
  /* Identity and the realm */
  | "raven"
  | "keep"
  | "crown"
  | "council"
  | "leadership"
  | "identity"
  | "house-hall"
  | "gatehouse"
  | "tower"
  | "world"
  | "realm-map"
  /* Houses */
  | "banner"
  | "house-corvane"
  | "rivalry"
  | "alliance"
  | "oath-scroll"
  /* Calls */
  | "call-orb"
  | "accuracy"
  | "scales"
  | "analytics"
  | "scrying"
  /* Reputation and rewards */
  | "trophy"
  | "podium"
  | "chest"
  | "coins"
  | "vault"
  | "celebration"
  | "growth"
  /* Competition */
  | "duel"
  | "arena"
  | "crossed-axes"
  | "dragon"
  | "dragon-egg"
  | "guard"
  | "games"
  | "training"
  | "mount"
  /* Social */
  | "whispers"
  | "envelope"
  | "gathering"
  | "quest-scroll"
  | "chronicle"
  | "chronicler"
  | "notifications"
  | "media"
  | "archive"
  /* Seasons and world */
  | "season"
  | "compass"
  | "treasure-map"
  | "portal"
  | "voyage"
  | "campfire"
  | "brazier"
  | "ember-hand"
  | "nightvale"
  | "hood"
  /* Tools */
  | "forge"
  | "market"
  | "search"
  | "network"
  | "workshop"
  | "settings"
  | "satchel"
  | "cards"
  | "alchemy"
  | "herald-ai";

const FALLBACK_GLYPH: Partial<Record<Icon3DName, string>> = {
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
        className={`inline-flex shrink-0 items-center justify-center rounded-[--radius-lg] border border-gold/20 bg-panel-warm text-gold ${className}`}
        style={{ width: px, height: px }}
      >
        <Icon
          name={FALLBACK_GLYPH[name] ?? "orb"}
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
      /* The plinth already carries a contact shadow, so the only lift needed is
         a soft warm glow that seats it against obsidian. */
      style={{ filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.45))" }}
    />
  );
}
