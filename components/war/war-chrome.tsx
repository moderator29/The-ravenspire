"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { Meter } from "@/components/ui/meter";
import { BOARD_META } from "@/components/board/board-shell";
import { champions, type Champion } from "@/lib/game/champions";

/* What is actually about The War.

   This file used to hold a page frame, a header, a board, a board skeleton, a
   stat strip and a density scale, and every one of those was a second copy of
   something `components/board/board-shell.tsx` already had. Seven War routes
   drew from this copy and the other nine boards in the realm drew from that
   one, so the two halves of the product had drifted apart on width, heading
   size and section rhythm, and a fix to either reached half the screens. The
   duplicates are gone and The War draws its chrome from the Board shell like
   everything else.

   What remains is the part no other archetype should own: champion art with an
   honest fallback, the four numbers that decide a fight, and the scale they are
   measured against.

   Most of The War is the Ledger register: a Board of champions, a Board of
   weapons, a Console for choosing a champion and a ground. The Forge register
   is allowed in exactly three places in this section, and nowhere else: the
   hub's hero band, a single champion's Dossier hero, and the Ceremony that
   fires when a battle is won or a chest is opened. Everything in this file is
   deliberately flat so those three moments still mean something. */

/* A label, a tabular figure and a bar.

   The bar is the `Meter` primitive, not a hand rolled `bar-track` plus
   `bar-gold`. This was one of five copies of those two classes, and each copy
   had made the same three decisions slightly differently. This one had no
   visible sliver floor, so a champion whose speed is genuinely low drew a bar
   of zero width and read as having none at all.

   It also carried `role="img"` with an aria-label repeating the figure, which
   is written immediately to its left. A screen reader announced "Attack, 3,400"
   and then "image, 3,400 of 3,700". Meter is aria-hidden unless you give it a
   label, which is correct here: the number is already there in text.

   The floor is deliberately dropped at exactly zero. Meter applies its floor to
   any value including 0, which is right for "one point out of forty thousand"
   and wrong for "no mastery at all": a champion at mastery 0 would draw a gold
   sliver implying progress that has not happened. Zero is the one value that
   must render as nothing. */
export function StatBar({
  label,
  value,
  max,
  className,
}: {
  label: ReactNode;
  value: number;
  max: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className={cx("flex items-center justify-between gap-3", BOARD_META)}>
        <span className="text-bone-mut">{label}</span>
        <span className="tnum text-bone">{value.toLocaleString()}</span>
      </div>
      <Meter
        className="mt-1"
        value={value}
        max={max}
        size="sm"
        floor={value > 0 ? 2 : 0}
      />
    </div>
  );
}

/* The four numbers that decide a fight, and the scale they are drawn against.

   Two routes were each carrying their own copy of a hardcoded ceiling, and the
   two copies had already drifted from the catalog. A bar has to be measured
   against something, so it is measured against the strongest champion actually
   in the realm. That keeps the scale real: if a stronger hero is added, every
   bar in The War rescales itself, and nobody has to remember to edit a
   constant. */
export const STAT_KEYS = ["attack", "defense", "health", "speed"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  attack: "Attack",
  defense: "Defense",
  health: "Health",
  speed: "Speed",
};

export const STAT_MAX: Record<StatKey, number> = {
  attack: Math.max(...champions.map((c) => c.stats.attack)),
  defense: Math.max(...champions.map((c) => c.stats.defense)),
  health: Math.max(...champions.map((c) => c.stats.health)),
  speed: Math.max(...champions.map((c) => c.stats.speed)),
};

/* The stat block, one column on a phone and two from `sm`. */
export function ChampionStats({
  stats,
  className,
}: {
  stats: Champion["stats"];
  className?: string;
}) {
  return (
    <div
      className={cx(
        "grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2",
        className
      )}
    >
      {STAT_KEYS.map((key) => (
        <StatBar
          key={key}
          label={STAT_LABELS[key]}
          value={stats[key]}
          max={STAT_MAX[key]}
        />
      ))}
    </div>
  );
}

/* A square art tile with an honest fallback. The catalog has art for twenty of
   the sixty three champions, so a missing portrait is the normal case, not an
   error, and it gets a flat glyph rather than a broken image. */
export function ArtTile({
  src,
  alt,
  icon,
  size = "row",
  locked,
  className,
}: {
  src?: string;
  alt: string;
  /* An `Icon` name used when there is no art. */
  icon: string;
  size?: "row" | "lg";
  locked?: boolean;
  className?: string;
}) {
  const dim =
    size === "lg" ? "h-14 w-14" : "h-10 w-10 shrink-0 md:h-9 md:w-9";
  const glyph = size === "lg" ? "h-6 w-6" : "h-4 w-4";

  return (
    <span
      className={cx(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-steel-line bg-void",
        dim,
        className
      )}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={cx(
            "h-full w-full object-cover",
            locked && "opacity-30 grayscale"
          )}
        />
      ) : (
        <Icon name={icon} className={cx(glyph, "text-bone-faint")} />
      )}
      {locked ? (
        <span className="absolute inset-0 flex items-center justify-center bg-obsidian/50 text-gold">
          <Icon name="lock" className={glyph} />
        </span>
      ) : null}
    </span>
  );
}
