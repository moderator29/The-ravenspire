"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

/* The admin chrome, expressed once.

   Every admin route was re-deriving the same four things badly: a page header,
   a sealed-chamber panel, a hand written table and an inline note. Section 2 of
   the design system puts admin in two archetypes, and both are Ledger register,
   so nothing in this file glows, lifts or pulses beyond a hover response on a
   control that is genuinely a link.

   Console (section 2): dense data plus controls, compact always above `md`.
   Board (section 2): 44px comfortable, 36px compact, rank or identity first,
   metrics right aligned and tabular, hairline dividers, no zebra striping.

   Section 10 is the rule the old tables all broke: any table with more than
   four columns becomes a card list below `md`, and a table never scrolls
   horizontally on a phone. `Board` therefore mounts a table above `md` and a
   caller supplied card list below it. */

/* The Console density pair, so the numbers live in one place. */
export const ADMIN_BODY = "text-sm md:text-[13px]";
export const ADMIN_META = "text-xs md:text-[11px]";

/* Section 11: touch targets stay at 44px below `md` whatever density the
   archetype declares. Applied as a minimum so it never fights the height the
   Button size already sets above `md`. */
export const TOUCH = "min-h-11 md:min-h-0";

/* -------------------------------------------------------------------------
   Page frame
   ------------------------------------------------------------------------- */

/* House rule 16: every page that can be navigated into needs a back control,
   so the way back to the council table is part of the header rather than an
   optional sibling. The overview is the root of the section and passes
   `back={false}`. */
export function AdminHeader({
  title,
  kicker,
  actions,
  back = true,
  className,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
  back?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-3 md:gap-2", className)}>
      {back ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className={cx("-ml-3", TOUCH)}
            render={<Link href="/admin" />}
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
            Council
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-semibold text-bone md:text-lg">
            {title}
          </h1>
          {kicker ? (
            <p className="mt-1 text-[11px] uppercase tracking-[0.26em] text-bone-faint md:mt-0.5">
              {kicker}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* The vertical rhythm between admin sections. Compact above `md`. */
export function AdminStack({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex flex-col gap-6 md:gap-4", className)}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------
   States
   ------------------------------------------------------------------------- */

/* Every admin route rendered its own copy of this panel, and none of them
   offered a way out, so a steward whose seal did not open the ledger was left
   staring at a dead end. */
export function SealedChamber({ body }: { body?: ReactNode }) {
  return (
    <Card pad="lg">
      <EmptyState
        icon="lock"
        title="The council chamber is sealed"
        body={
          body ??
          "Your seal does not open this ledger. Only sworn stewards of the realm may read it."
        }
        action={
          <Button variant="glass" size="md" render={<Link href="/home" />}>
            Return to the realm
          </Button>
        }
      />
    </Card>
  );
}

/* A read that failed is not an empty state, so it says so and offers the one
   thing that can help: reading it again. */
export function AdminError({
  title = "That ledger could not be read",
  body,
  onRetry,
}: {
  title?: string;
  body: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <Card pad="lg">
      <EmptyState
        icon="alert"
        title={title}
        body={body}
        action={
          onRetry ? (
            <Button variant="glass" size="md" onClick={onRetry}>
              Try again
            </Button>
          ) : undefined
        }
      />
    </Card>
  );
}

/* A short reading of what just happened. `role="status"` so an optimistic
   change is announced through a polite live region rather than only seen. */
export function AdminNote({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "gold";
  children: ReactNode;
}) {
  return (
    <p
      role="status"
      className={cx(
        "text-xs",
        tone === "danger" ? "text-state-danger" : "text-gold"
      )}
    >
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------
   Board
   -------------------------------------------------------------------------

   Board moved to components/board/board-shell.tsx. It was the one archetype
   with two implementations, a generic one here under a route folder and a
   different one in components/war/war-chrome.tsx, while Console and Stream
   each had exactly one shell. Leaderboards, House standings and the caller
   board are Boards too and could not reach this one from here.

   Re-exported rather than relocated at the call sites, so every admin route
   keeps its existing import and nothing had to move to gain a shared shell. */

export {
  Board,
  BoardCard,
  BoardSkeleton,
  type BoardColumn,
} from "@/components/board/board-shell";

/* A grid of stat tiles, shaped like the tiles it stands in for. */
export function StatSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} pad="sm">
          <Skeleton radius="sm" className="h-4 w-4" />
          <Skeleton radius="sm" className="mt-2 h-6 w-2/3" />
          <Skeleton radius="sm" className="mt-2 h-2.5 w-full" />
        </Card>
      ))}
    </div>
  );
}

/* One dense stat tile. Ornament budget zero: a flat glyph, a tabular number
   and a label, at compact scale above `md`. */
export function StatTile({
  icon,
  value,
  label,
}: {
  icon: string;
  value: ReactNode;
  label: ReactNode;
}) {
  return (
    <Card pad="sm">
      <Icon name={icon} className="h-5 w-5 text-bone-faint md:h-[17px] md:w-[17px]" />
      <p className="tnum font-display mt-2 text-2xl font-semibold text-gold md:text-xl">
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-bone-faint">
        {label}
      </p>
    </Card>
  );
}
