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
   ------------------------------------------------------------------------- */

export interface BoardColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /* Right aligned and tabular, so columns of numbers line up down the board. */
  numeric?: boolean;
  className?: string;
}

export function Board<T>({
  label,
  columns,
  rows,
  rowKey,
  card,
}: {
  /* Names the board for screen readers. */
  label: string;
  columns: BoardColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /* The card list rendered below `md`, where a wide table would have to
     scroll sideways. Section 10 forbids that. */
  card: (row: T) => ReactNode;
}) {
  return (
    <>
      <Card pad="none" className="hidden overflow-hidden md:block">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="border-b border-steel-line text-[10px] uppercase tracking-[0.2em] text-bone-faint">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(
                    "px-3 py-2 font-medium",
                    c.numeric && "text-right"
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-steel-line transition-colors duration-fast ease-out-quint last:border-b-0 hover:bg-panel/60"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(
                      "h-9 px-3 py-2 align-middle text-bone-mut",
                      c.numeric && "tnum text-right",
                      c.className
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ul
        aria-label={label}
        className="flex flex-col gap-2 md:hidden"
      >
        {rows.map((row) => (
          <li key={rowKey(row)}>{card(row)}</li>
        ))}
      </ul>
    </>
  );
}

/* The mobile half of a Board: identity first, then the metrics that were
   columns, then the row's controls. */
export function BoardCard({
  title,
  subtitle,
  badges,
  stats,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  stats?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card pad="sm" variant="inset">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-bone">{title}</p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-bone-faint">
              {subtitle}
            </p>
          ) : null}
        </div>
        {badges ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {badges}
          </div>
        ) : null}
      </div>

      {stats && stats.length > 0 ? (
        <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline justify-between gap-2">
              <dt className="text-[11px] uppercase tracking-[0.16em] text-bone-faint">
                {s.label}
              </dt>
              <dd className="tnum truncate text-xs text-bone-mut">{s.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {children}

      {actions ? (
        <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </Card>
  );
}

/* Shaped like the board it stands in for: a header rule, then rows at the
   compact row height, then the same thing as stacked cards below `md`. */
export function BoardSkeleton({
  rows = 6,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <>
      <Card pad="none" className="hidden overflow-hidden md:block">
        <div className="flex items-center gap-3 border-b border-steel-line px-3 py-2">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} radius="sm" className="h-2.5 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            className="flex h-9 items-center gap-3 border-b border-steel-line px-3 last:border-b-0"
          >
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton key={c} radius="sm" className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </Card>
      <div className="flex flex-col gap-2 md:hidden">
        {Array.from({ length: Math.min(rows, 4) }, (_, r) => (
          <Card key={r} pad="sm" variant="inset">
            <Skeleton radius="sm" className="h-3.5 w-2/5" />
            <Skeleton radius="sm" className="mt-2 h-2.5 w-3/5" />
            <Skeleton radius="sm" className="mt-3 h-2.5 w-full" />
          </Card>
        ))}
      </div>
    </>
  );
}

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
