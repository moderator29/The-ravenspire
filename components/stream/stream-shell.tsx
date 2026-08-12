"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card, type CardPad, type CardProps } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { Skeleton } from "@/components/ui/skeleton";

/* The Stream archetype, expressed once.

   Section 2 of the design system gives a Stream four rules, and the feed was
   re-deriving all four badly across seventeen files:

     column      max-width 640px, centred, at every width. A wide feed is a
                 worse feed, so this never opens up at lg or xl.
     rhythm      a fixed --spacing-3 gap with variable card height. Constant
                 gap and varying heights reads as rich. Varying gaps read as
                 broken.
     type        a 2px accent rail on the leading edge, never a different card
                 shape, radius or width.
     ornament    none, except a 3D icon inside an empty state.

   Density is comfortable everywhere (section 4). Reading wants air, so nothing
   here shrinks at md the way a Console does, and every control clears the 44px
   touch target on a phone. */

/* 640px exactly. Do not widen this. */
export const STREAM_WIDTH = "max-w-[40rem]";
/* --spacing-3, the one gap between cards in a stream. */
export const STREAM_GAP = "gap-3";
/* Comfortable body and meta, per the density table. */
export const STREAM_BODY = "text-[15px]";
export const STREAM_META = "text-xs";

export function StreamColumn({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("mx-auto w-full", STREAM_WIDTH, className)}>
      {children}
    </div>
  );
}

/* The rhythm. One gap, many card heights. */
export function StreamList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex flex-col", STREAM_GAP, className)}>{children}</div>
  );
}

/* What a card is, encoded as colour rather than as shape.

   Section 5: gold is a member's raven, ember is a Call, steel is a system or
   realm event, a House colour is anything scoped to a House, bright gold is a
   Ceremony moment inlined into a Stream. */
export type StreamRail = "gold" | "ember" | "steel" | "bright" | "house";

const RAIL: Record<StreamRail, string> = {
  gold: "bg-[image:linear-gradient(180deg,var(--gold-bright),var(--gold-deep))]",
  ember: "bg-ember",
  steel: "bg-steel",
  bright: "bg-gold-bright",
  /* Painted from the House's own colour by the caller. */
  house: "",
};

export interface StreamCardProps extends Omit<CardProps, "pad"> {
  rail?: StreamRail;
  /* Only read when rail is "house". Any other value is ignored, so a caller
     cannot smuggle an off-brand colour onto a member's raven. */
  railColor?: string;
  pad?: CardPad;
  children?: ReactNode;
}

export function StreamCard({
  rail = "gold",
  railColor,
  pad = "md",
  className,
  children,
  ...props
}: StreamCardProps) {
  return (
    <Card pad={pad} className={className} {...props}>
      <span
        aria-hidden
        className={cx(
          "pointer-events-none absolute inset-y-4 left-0 w-[2px] rounded-r-[2px]",
          RAIL[rail]
        )}
        style={
          rail === "house" && railColor
            ? { background: railColor }
            : undefined
        }
      />
      {children}
    </Card>
  );
}

/* Section 3: many options, filtering rather than exclusive, and the set can
   grow, so the Ravenry's tabs are a chip rail rather than a Segmented control
   or an underline strip. Rounded rectangles, never capsules. */
/* The fade, as fixed classes rather than a computed gradient, so Tailwind can
   see every one of them at build time. Same four the dock uses. */
const RAIL_MASK = {
  none: "",
  end: "[mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]",
  start: "[mask-image:linear-gradient(to_left,black_calc(100%-20px),transparent)]",
  both: "[mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)]",
} as const;

/* A rail that admits when it has more to show, and never hides the current
   chip behind its own edge.
 *
 * The Ravenry's five views moved into this rail from the dock, and moving them
 * did not make them fit: they need 450px and the row gives 316, because the
 * filter button shares it. Five labels at 390 is simply more than the width,
 * and shortening them is not available, since Following, My House and Signal
 * are the realm's own words for those views.
 *
 * So the rail scrolls, and the job is to make scrolling read as designed
 * rather than as a layout that broke. Two things do that, and the dock already
 * proved both: a 20px fade on whichever edge still has content behind it, and
 * scrolling the current chip fully into view on arrival so the one chip that
 * says where you are is never the one cut in half.
 *
 * The vertical padding is the third thing and it is a bug fix, not polish.
 * `overflow-x: auto` forces the computed `overflow-y` to `auto`: the two axes
 * cannot be independently visible and scrollable. With no vertical padding the
 * focus ring drawn outside a chip falls outside the scroll box and is clipped,
 * which is rule 12 defeated on every surface that uses a rail. The padding
 * gives the ring room inside the box, and the negative margin keeps the rail
 * on the line it always sat on.
 *
 * Deliberately not "stop scrolling above md" as the fix for that: the Console
 * rail tried it and the widest chip set, the Swap's one chip per chain, then
 * spilled 577px into a 534px box and pushed three ancestors out with it into
 * the page gutter, where nothing catches it because the document never grows.
 * Padding works at every width; not scrolling only works when things fit. */
export function StreamChipRail({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const slack = el.scrollWidth - el.clientWidth;
      /* A pixel of tolerance: sub pixel layout leaves fractional slack on
         rails that visibly fit, and a fade over nothing is a lie too. */
      if (slack <= 1) return setMore({ start: false, end: false });
      setMore({ start: el.scrollLeft > 1, end: el.scrollLeft < slack - 1 });
    };
    /* Bring the current chip fully inside before the first paint settles, so
       the view you are on is never the one cut at the edge. `scrollLeft`
       directly rather than `scrollIntoView`, which walks up the ancestor chain
       and scrolls the page along with the rail. */
    const current = el.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (current) {
      const pad = 12;
      const right = current.offsetLeft + current.offsetWidth + pad;
      const left = current.offsetLeft - pad;
      if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
      else if (left < el.scrollLeft) el.scrollLeft = left;
    }
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [children]);

  const mask =
    more.start && more.end
      ? RAIL_MASK.both
      : more.start
        ? RAIL_MASK.start
        : more.end
          ? RAIL_MASK.end
          : RAIL_MASK.none;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cx(
        "scrollbar-none -mx-1 -my-1 flex min-w-0 items-center gap-1.5 overflow-x-auto p-1",
        mask,
        className
      )}
    >
      {children}
    </div>
  );
}

export function StreamChip({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "shrink-0 rounded-sm border px-3.5 text-sm font-semibold",
        "transition-colors duration-fast ease-out-quint",
        /* Comfortable everywhere, which also clears the touch target. */
        "h-11",
        active
          ? "border-gold/60 bg-gold/12 text-gold-bright"
          : "border-steel-line bg-void text-bone-mut hover:border-gold/40 hover:text-bone",
        className
      )}
    >
      {children}
    </button>
  );
}

/* One entry in a card's action bar: an icon, an optional tally, one verb.

   Built on Button so it inherits the single focus ring, the rounded rectangle
   and the motion scale, and sized to 44px so the bar is thumb reachable on a
   phone without the actions crowding each other. */
export function StreamAction({
  icon,
  label,
  count,
  active,
  tone = "gold",
  iconClassName,
  onClick,
  render,
  className,
}: {
  icon: string;
  /* Required. An icon with a number beside it is not an accessible name. */
  label: string;
  count?: number;
  active?: boolean;
  tone?: "gold" | "ember";
  iconClassName?: string;
  onClick?: () => void;
  /* Pass a Next <Link> when the action navigates rather than acts. */
  render?: ButtonProps["render"];
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="md"
      pad="sm"
      {...(render ? { render } : {})}
      aria-label={label}
      onClick={
        onClick
          ? (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      className={cx(
        "h-11 gap-1.5 font-normal",
        active
          ? tone === "ember"
            ? "text-ember"
            : "text-gold"
          : "text-bone-faint hover:text-bone-mut",
        className
      )}
    >
      <Icon name={icon} className={cx("h-[18px] w-[18px]", iconClassName)} />
      {count !== undefined && count > 0 ? (
        <span className="tnum text-xs">{count}</span>
      ) : null}
    </Button>
  );
}

/* The one place a Stream is allowed any ornament at all.

   EmptyState carries a flat glyph in a gold well, which is right for a panel
   inside a Console. A Stream that has nothing in it is the whole viewport, so
   it earns the 3D icon at `lg`. The icon is never captioned: the title and body
   below carry the meaning. */
export function StreamEmpty({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: Icon3DName;
  title: ReactNode;
  body?: ReactNode;
  /* Always offer a way forward. An empty state that only reports an absence is
     a dead end. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      pad="none"
      className={cx("flex flex-col items-center px-6 py-8", className)}
    >
      <Icon3D name={icon} size="lg" />
      <EmptyState
        title={title}
        {...(body !== undefined ? { body } : {})}
        {...(action !== undefined ? { action } : {})}
        className="px-0 pb-0 pt-3"
      />
    </Card>
  );
}

/* A skeleton shaped like the thing it stands in for.

   The feed used to show three grey slabs of a fixed height, which tells a
   reader nothing about what is arriving and then jolts when the real cards
   turn out to be taller. This is a raven: avatar, name line, two lines of body,
   an action bar. */
export function StreamCardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <StreamCard rail="steel" aria-hidden>
      <div className="flex gap-3">
        <Skeleton radius="full" className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Skeleton radius="sm" className="h-3 w-28" />
            <Skeleton radius="sm" className="h-3 w-16" />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {Array.from({ length: lines }, (_, i) => (
              <Skeleton
                key={i}
                radius="sm"
                className={cx("h-3.5", i === lines - 1 ? "w-3/5" : "w-full")}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center gap-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} radius="sm" className="h-4 w-9" />
            ))}
          </div>
        </div>
      </div>
    </StreamCard>
  );
}

export function StreamSkeleton({ count = 3 }: { count?: number }) {
  return (
    <StreamList>
      {Array.from({ length: count }, (_, i) => (
        <StreamCardSkeleton key={i} lines={i === 1 ? 3 : 2} />
      ))}
    </StreamList>
  );
}
