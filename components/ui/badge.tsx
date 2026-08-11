"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";

/* Badges and rarity chips.

   Rounded rectangles, not capsules. The existing `.rarity-chip` and the
   scattered `rounded-full` status pills are the last capsules in the product
   and this file is what retires them. */

export type BadgeVariant =
  | "default"
  | "gold"
  | "beta"
  | "danger"
  | "success";

const BASE =
  "inline-flex select-none items-center gap-1 rounded-sm border px-2 py-0.5 " +
  "text-[10px] font-bold uppercase tracking-[0.14em] leading-none";

const VARIANT: Record<BadgeVariant, string> = {
  default: "border-steel-line bg-panel text-bone-mut",
  gold: "border-gold/45 bg-gold/10 text-gold",
  /* Beta is ember, the one restrained warm accent, so a work in progress
     never reads as an achievement. */
  beta: "border-ember/45 bg-ember/10 text-state-warning",
  danger: "border-state-danger/45 bg-state-danger/10 text-state-danger",
  /* Success is gold. There is no green in this product, including here. */
  success: "border-state-success/50 bg-state-success/10 text-state-success",
};

export interface BadgeProps {
  variant?: BadgeVariant;
  /* An `Icon` name rendered before the label. */
  icon?: string;
  className?: string;
  children: ReactNode;
}

export function Badge({
  variant = "default",
  icon,
  className,
  children,
}: BadgeProps) {
  return (
    <span className={cx(BASE, VARIANT[variant], className)}>
      {icon ? <Icon name={icon} className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export const RARITIES: Rarity[] = [
  "common",
  "rare",
  "epic",
  "legendary",
  "mythic",
];

/* The rarity ladder, formalised.

   globals.css defines `.rarity-*` as a `--rarity` custom property and
   `.rarity-chip` as the capsule that reads it. Two problems with consuming
   that directly. It is a capsule, which the design rules forbid. And mythic
   maps to `--blood`, a fill-only hue that measures 1.87:1 as text, so the
   mythic chip has been failing contrast everywhere it appears. Text here uses
   the `-text` twin, which is the same hue lifted to 4.50:1.

   The `rarity-*` class is still applied so that `--rarity` remains set for any
   sibling `.rarity-frame` that reads it. */
const RARITY_TEXT: Record<Rarity, string> = {
  common: "text-steel border-steel/55",
  rare: "text-gold border-gold/55",
  epic: "text-ember border-ember/55",
  legendary: "text-gold-bright border-gold-bright/55",
  mythic: "text-blood-text border-blood-text/55",
};

export function RarityChip({
  rarity,
  className,
  children,
}: {
  rarity: Rarity;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cx(
        `rarity-${rarity}`,
        "inline-flex select-none items-center rounded-sm border px-2 py-0.5",
        "text-[10px] font-bold uppercase tracking-[0.14em] leading-none",
        RARITY_TEXT[rarity],
        className
      )}
    >
      {children ?? rarity}
    </span>
  );
}
