"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { BackButton } from "@/components/shell/back-button";

/* The War's shared chrome.

   Seven routes were each re-deriving the same page frame, the same gold
   heading, the same four-up stat strip and the same stat bar, in slightly
   different sizes every time. This file holds them once.

   Most of The War is the Ledger register: a Board of champions, a Board of
   weapons, a Console for choosing a champion and a ground. The Forge register
   is allowed in exactly three places in this section, and nowhere else: the
   hub's hero band, a single champion's Dossier hero, and the Ceremony that
   fires when a battle is won or a chest is opened. Everything in this file is
   deliberately flat so those three moments still mean something.

   Board density, per section 4 of the design system:

     row height      min-h-11 md:min-h-9   44 -> 36
     body text       text-sm md:text-[13px]
     meta text       text-xs md:text-[11px]

   Touch targets never drop below 44px, which is why every row rung carries the
   mobile height first and only compacts at `md`. */

export const WAR_ROW =
  "flex min-h-11 items-center gap-3 px-3 py-2 md:min-h-9 md:gap-2.5 md:py-1.5";
export const WAR_BODY = "text-sm md:text-[13px]";
export const WAR_META = "text-xs md:text-[11px]";

type WarWidth = "narrow" | "board" | "wide";

const WIDTH: Record<WarWidth, string> = {
  narrow: "max-w-2xl",
  board: "max-w-3xl lg:max-w-4xl",
  wide: "max-w-3xl lg:max-w-5xl",
};

export function WarPage({
  width = "board",
  className,
  children,
}: {
  width?: WarWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "mx-auto flex w-full flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6 md:gap-4",
        WIDTH[width],
        className
      )}
    >
      {children}
    </div>
  );
}

/* Back control, title, kicker and page level actions in one band. House rule
   16: every page that can be navigated into carries a way back, and The War is
   reachable only from the landing page, so even its root needs one. */
export function WarHeader({
  title,
  kicker,
  backHref = "/war",
  backLabel,
  actions,
  className,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-3 md:gap-2", className)}>
      <BackButton href={backHref} {...(backLabel ? { label: backLabel } : {})} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-semibold text-bone sm:text-2xl">
            {title}
          </h1>
          {kicker ? (
            <p className="mt-1 text-[11px] uppercase tracking-[0.26em] text-bone-faint">
              {kicker}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

/* The Board chassis: one card, hairline divided rows, no zebra striping.
   Ornament budget zero, because a Board is an instrument. */
export function Board({
  label,
  className,
  children,
}: {
  /* Names the list for screen readers, for example "Champion roster". */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card pad="none" className={cx("overflow-hidden", className)}>
      <ul aria-label={label} className="divide-y divide-steel-line">
        {children}
      </ul>
    </Card>
  );
}

export interface WarStat {
  label: string;
  value: number;
  /* An `Icon` name. Flat glyph, never a 3D icon: this is a dense strip. */
  icon: string;
}

/* Your standing, four numbers wide. Right aligned and tabular so the column of
   figures lines up whatever the values are. */
export function StatStrip({ stats }: { stats: WarStat[] }) {
  return (
    <Card pad="none" className="overflow-hidden">
      <dl className="grid grid-cols-2 divide-x divide-y divide-steel-line sm:grid-cols-4 sm:divide-y-0">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex min-h-11 items-center gap-2.5 px-3 py-2.5 md:min-h-9 md:py-2"
          >
            <Icon
              name={stat.icon}
              className="h-4 w-4 shrink-0 text-gold md:h-[17px] md:w-[17px]"
            />
            <div className="min-w-0 flex-1">
              <dt
                className={cx(
                  "uppercase tracking-[0.16em] text-bone-faint",
                  WAR_META
                )}
              >
                {stat.label}
              </dt>
              <dd className="tnum font-display text-base font-semibold text-bone md:text-[15px]">
                {stat.value.toLocaleString()}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* Shaped like the strip it stands in for, not a generic grey slab. */
export function StatStripSkeleton() {
  return <Skeleton radius="xl" className="h-[104px] sm:h-[60px] md:h-[52px]" />;
}

/* Shaped like a Board of rows. */
export function BoardSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card pad="none" className="overflow-hidden">
      <div className="divide-y divide-steel-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={WAR_ROW}>
            <Skeleton radius="md" className="h-9 w-9 shrink-0" />
            <Skeleton radius="sm" className="h-3 w-40 max-w-[45%]" />
            <Skeleton radius="sm" className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* A label, a tabular figure and a bar. `bar-track` and `bar-gold` are the
   product's sanctioned progress primitives in globals.css, so the bar is never
   hand rolled here. */
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
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className={className}>
      <div className={cx("flex items-center justify-between gap-3", WAR_META)}>
        <span className="text-bone-mut">{label}</span>
        <span className="tnum text-bone">{value.toLocaleString()}</span>
      </div>
      <div
        className="bar-track mt-1 h-1.5"
        role="img"
        aria-label={`${value.toLocaleString()} of ${max.toLocaleString()}`}
      >
        <div className="bar-gold h-full" style={{ width: `${pct}%` }} />
      </div>
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
