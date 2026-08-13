"use client";

import Image from "next/image";
import { houses, sigilIcon } from "@/lib/data/houses";
import { Icon } from "@/components/ui/icon";
import { RarityChip, type Rarity } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";

/* The one card chassis (design law section 5, and the collectibles brief).
 *
 * Every champion card in the product, at every size, is this one component:
 * the Reliquary grid, a card detail, the pack-opening Ceremony reveal, a share
 * artifact. Heterogeneity lives inside a rigid frame, never in the frame
 * itself. A card is a 5:7 portrait in a rarity frame with its collector number;
 * the rarity is expressed by the frame (the `.rarity-frame` treatment in
 * globals.css, keyed off `--rarity`), never by a caption. That is house rule
 * 22 applied to cards: the frame carries the meaning, the copy does not repeat
 * it.
 *
 * Honesty rules the face. Most champions carry finished art; a champion
 * without one renders the house sigil on obsidian and says "Portrait incoming"
 * plainly rather than faking a portrait. No owners, prices or supplies are ever
 * drawn here, because the chassis is used on sealed surfaces too.
 */

/* The subset of a champion a card needs. The full `Champion` satisfies it, so
   callers pass either the record or a slim projection from an API. */
export interface ChampionCardSubject {
  slug: string;
  name: string;
  title: string;
  house: string;
  rarity: Rarity;
  /* Path to finished art, when it exists. Absent renders the sealed back. */
  art?: string | null;
}

export type ChampionCardSize = "sm" | "md" | "lg" | "xl";

/* House sigil by full house name (champion.house is "House Corvane", not a
   slug), resolved through the shared sigil map so a card back never drifts
   from the House rail. */
const sigilByHouseName = new Map(
  houses.map((h) => [h.name, sigilIcon[h.sigil] ?? "banner"] as const)
);

const BACK_ICON: Record<ChampionCardSize, string> = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
};

const IMAGE_SIZES: Record<ChampionCardSize, string> = {
  sm: "120px",
  md: "200px",
  lg: "300px",
  xl: "420px",
};

/* The framed portrait, the reusable heart of the chassis. Rarity is the frame:
   `rarity-{r}` sets `--rarity`, and `.rarity-frame` draws the border and the
   warm inner glow from it. */
export function ChampionCardFace({
  champion,
  number,
  total,
  size = "md",
  sealed = false,
  priority = false,
  className,
}: {
  champion: ChampionCardSubject;
  number?: number;
  total?: number;
  size?: ChampionCardSize;
  /* Draws the sealed veil over the art. The number stays legible, the way a
     collector wants the checklist even while the box is shut. */
  sealed?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const sigil = sigilByHouseName.get(champion.house) ?? "banner";

  return (
    <div
      className={cx(
        `rarity-${champion.rarity} rarity-frame`,
        "relative aspect-[5/7] w-full overflow-hidden rounded-lg border bg-void",
        className
      )}
    >
      {champion.art ? (
        <Image
          src={champion.art}
          alt=""
          fill
          sizes={IMAGE_SIZES[size]}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[image:radial-gradient(80%_60%_at_50%_35%,rgba(217,176,64,0.08),transparent_70%)]">
          <Icon name={sigil} className={cx("text-gold/40", BACK_ICON[size])} />
          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-bone-faint">
            Portrait incoming
          </span>
        </div>
      )}

      {sealed ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-obsidian/45 backdrop-blur-[3px]"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gold/30 bg-obsidian/80">
            <Icon name="lock" className="h-4 w-4 text-gold" />
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-bone-mut">
            Sealed
          </span>
        </div>
      ) : null}

      {number ? (
        <span className="tnum absolute left-1.5 top-1.5 rounded-sm bg-obsidian/70 px-1.5 py-0.5 text-[9px] font-semibold text-bone-faint">
          {number}
          {total ? `/${total}` : ""}
        </span>
      ) : null}
    </div>
  );
}

/* The face plus its meta line: name, title, rarity. The rarity chip repeats
   the frame's colour as a legible label, which is allowed because it is the
   card's identity in text, not a caption sitting under an unlabelled icon. */
export function ChampionCard({
  champion,
  number,
  total,
  size = "md",
  sealed = false,
  priority = false,
  showMeta = true,
  className,
}: {
  champion: ChampionCardSubject;
  number?: number;
  total?: number;
  size?: ChampionCardSize;
  sealed?: boolean;
  priority?: boolean;
  showMeta?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <ChampionCardFace
        champion={champion}
        number={number}
        total={total}
        size={size}
        sealed={sealed}
        priority={priority}
      />
      {showMeta ? (
        <div className="flex min-w-0 flex-col gap-1 px-0.5">
          <span className="truncate font-display text-[13px] font-semibold leading-tight text-bone">
            {champion.name}
          </span>
          <span className="truncate text-[10px] uppercase tracking-[0.14em] text-bone-faint">
            {champion.title}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <RarityChip rarity={champion.rarity}>{champion.rarity}</RarityChip>
            <span className="truncate text-[10px] text-bone-faint">
              {champion.house.replace("House ", "")}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
