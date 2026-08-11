import Image from "next/image";

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

const SIZES = {
  sm: 40,
  md: 64,
  lg: 96,
  xl: 128,
  hero: 192,
} as const;

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
  return (
    <Image
      src={`/icons/3d/${name}.png`}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      width={px}
      height={px}
      priority={priority}
      className={`select-none object-contain ${className}`}
      /* The plinth already carries a contact shadow, so the only lift needed is
         a soft warm glow that seats it against obsidian. */
      style={{ filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.45))" }}
    />
  );
}
