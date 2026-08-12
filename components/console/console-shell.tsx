"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, useIsMobile } from "@/components/ui/sheet";
import { BackButton } from "@/components/shell/back-button";

/* The Console archetype, expressed once.

   Section 4 of the design system gives Console a single density rule: compact
   always, at every breakpoint above `md`, comfortable below it, with touch
   targets never dropping under 44px on a phone. Every Console route was
   re-deriving that rule (badly, and usually not at all), so this file holds it:
   the page frame, the header band, the toolbar rail and the dense row.

   The density pairs, so the numbers stay in one place:

     card padding    p-3  md:p-2.5    12 -> 10
     section gap     gap-4 md:gap-3   16 -> 12
     body text       text-sm md:text-[13px]
     meta text       text-xs md:text-[11px]
     row height      min-h-11 md:min-h-9
     icon            h-5 w-5 md:h-[17px] md:w-[17px]

   Padding and gap are one step tighter than the design system's section 4
   table, following the platform wide reduction c23139a made to `Card`. The
   Console needed it more than the feed did, not less. Measured at 390 before:
   a word inside a Console panel started 29px from the screen edge, 12 of
   `ConsolePage`'s own `px-3` and 16 of the panel's padding, so 58px of a 390px
   screen went on horizontal chrome before any number. The feed's equivalent
   complaint was 32px and it has already been cut. After: 21px in, 42px total,
   14.9% of the screen down to 10.8%.

   Type is deliberately NOT in that reduction. A Console body is 14/13 and its
   meta 12/11, already a step under the feed's new 14, and these are the screens
   where the text is a balance and a price. The founder's word was "sharp",
   which a smaller number stops being before a tighter one does.

   Row height and icon size are not in it either, for a harder reason: on a
   coarse pointer `min-h-11` is a 44px accessibility floor rather than a style
   choice. Density comes out of the space around things, never out of the thing
   you tap.

   Ornament budget on a Console is zero, so nothing here glows, lifts or
   pulses. */

export const CONSOLE_PAD = "p-3 md:p-2.5";
export const CONSOLE_GAP = "gap-4 md:gap-3";
export const CONSOLE_BODY = "text-sm md:text-[13px]";
export const CONSOLE_META = "text-xs md:text-[11px]";
export const CONSOLE_ROW = "min-h-11 md:min-h-9";
export const CONSOLE_ICON = "h-5 w-5 md:h-[17px] md:w-[17px]";

type ConsoleWidth = "form" | "data" | "wide";

/* A Console expands to fill, but only up to what its content can use. A trading
   form does not get wider by being given room; a live coin board does. */
const WIDTH: Record<ConsoleWidth, string> = {
  form: "max-w-xl",
  data: "max-w-2xl lg:max-w-4xl",
  wide: "max-w-2xl lg:max-w-5xl",
};

export function ConsolePage({
  width = "data",
  className,
  children,
}: {
  width?: ConsoleWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "mx-auto w-full px-3 py-4 sm:px-4 sm:py-6 md:py-4",
        WIDTH[width],
        className
      )}
    >
      {children}
    </div>
  );
}

/* Back control, title, kicker and the page level actions, in one band.
   House rule 16: every page that can be navigated into needs a back control,
   so the back button is part of the header rather than an optional sibling. */
export function ConsoleHeader({
  title,
  kicker,
  badge,
  actions,
  backHref,
  className,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-3 md:gap-2", className)}>
      <BackButton {...(backHref ? { href: backHref } : {})} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-xl font-semibold text-bone md:text-lg">
              {title}
            </h1>
            {badge}
          </div>
          {kicker ? (
            <p className="mt-1 text-[11px] uppercase tracking-[0.26em] text-bone-faint md:mt-0.5">
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

/* The vertical rhythm between Console sections. Compact above `md`. */
export function ConsoleStack({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex flex-col", CONSOLE_GAP, className)}>{children}</div>
  );
}

/* The toolbar rail.

   Section 10: a Console toolbar collapses into a Sheet below `md` rather than
   wrapping. Above `md` the same controls sit on one hairline rail so they are
   never scattered into the content. Only one of the two trees is mounted, so
   the controls keep a single instance of their state. */
export function ConsoleToolbar({
  label = "Controls",
  summary,
  className,
  children,
}: {
  /* Names the rail for screen readers and titles the mobile Sheet. */
  label?: string;
  /* A short reading of the current state, shown on the mobile trigger so the
     collapsed rail still says what it is set to. */
  summary?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <Button
          variant="glass"
          size="lg"
          block
          onClick={() => setOpen(true)}
          className="justify-between"
        >
          <span className="flex items-center gap-2">
            <Icon name="sliders" className="h-4 w-4 text-gold" />
            {label}
          </span>
          {summary ? (
            <span className="truncate text-xs font-normal text-bone-mut">
              {summary}
            </span>
          ) : null}
        </Button>
        <Sheet open={open} onOpenChange={setOpen} title={label}>
          <div className="flex flex-col gap-4">{children}</div>
        </Sheet>
      </>
    );
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        "flex flex-wrap items-center gap-2 rounded-lg border border-steel-line bg-void/50 px-2 py-1.5",
        className
      )}
    >
      {children}
    </div>
  );
}

/* A horizontally scrollable set of filter chips. Section 3: many options,
   additive or filtering rather than exclusive, so a chip rail rather than a
   Segmented control. Rounded rectangles, never capsules.

   The rail eats its own focus ring, and that is a CSS rule rather than an
   oversight anyone could see. `overflow-x: auto` forces the computed
   `overflow-y` to `auto` as well: the two axes cannot be independently visible
   and scrollable. This box has no vertical padding, so the ring drawn just
   outside a focused chip lands outside the scroll box and is clipped away.

   Measured on the War's arsenal rail at 1440: sampling the pixels directly
   above a focused first chip returned `rgb(6,6,9)`, the page ground, where the
   ring belongs. With the box no longer scrolling, the same sample returns
   `rgb(249,227,159)`. Rule 12 says the global ring must never be defeated, and
   this defeated it on all eleven surfaces that use a rail.

   The vertical padding is the fix, and it is the fix at every width. It gives
   the ring room INSIDE the scroll box, with a matching negative margin so the
   rail still sits on the line it always did.

   Not scrolling above `md` was the other half of that fix and it had to come
   back out, because "a Console is compact there and the chips fit" is not true
   of the narrowest one. The Swap is `width="form"`, so `max-w-xl`, and it
   carries the most chips in the product, one per trade chain. Measured at 1024
   and at 1440 with the rail set to `overflow-x: visible`: 577px of chips in a
   534px box, so the tail of the rail escaped and pushed its three ancestors
   out with it, 581/542 on the toolbar and 598/576 on the Console page itself.
   The document never grew, because a Console is centred and the spill landed
   in the gutter, which is exactly why nothing caught it.

   Scrolling at every width, with the padding kept, holds both properties at
   once. Same two measurements after: zero boxes whose content overflows a
   visible `overflow-x`, and the pixels directly above a Tab-focused chip still
   sample `rgb(255,233,163)`, the ring. A rail whose chips do fit gains no
   scrollbar and does not move. */
export function ChipRail({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        "scrollbar-none -mx-1 -my-1 flex min-w-0 items-center gap-1.5 overflow-x-auto p-1",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Chip({
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
        "shrink-0 rounded-sm border px-3 text-xs font-medium",
        "transition-colors duration-fast ease-out-quint",
        /* 44px on touch, 28px on the compact rail.
           Width too, and it is the axis that was missing: a chip is as wide as
           its word, and "All" made a 41px control on two War screens. Three
           pixels short, produced by nothing but a short label, which is exactly
           the kind of miss no reviewer catches. */
        "h-11 min-w-11 md:h-7 md:min-w-0",
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

/* A dense label / value line, right aligned and tabular so columns of numbers
   line up down the panel. */
export function ConsoleStat({
  label,
  value,
  tone = "default",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "default" | "strong" | "up" | "down";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-3",
        CONSOLE_BODY,
        className
      )}
    >
      <span className="text-bone-faint">{label}</span>
      <span
        className={cx(
          "tnum text-right",
          tone === "strong" && "font-semibold text-bone",
          tone === "up" && "font-semibold text-[color:var(--chart-up)]",
          tone === "down" && "font-semibold text-[color:var(--chart-down)]",
          tone === "default" && "text-bone-mut"
        )}
      >
        {value}
      </span>
    </div>
  );
}
