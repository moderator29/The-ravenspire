"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Skeleton } from "@/components/ui/skeleton";
import { BackButton } from "@/components/shell/back-button";

/* The Board archetype, expressed once.

   Ranked or tabular rows, dense, scannable, where comparison is the job:
   leaderboards, House standings, a House roster, the caller board, champions,
   the arsenal, and every admin table.

   This lived in `app/admin/ui.tsx`, which meant the one archetype that most
   needs a single implementation had two: a generic one buried under a route
   folder, and a second, different one in `components/war/war-chrome.tsx`.
   Console and Stream each have exactly one shell, and Board now does too.

   The rule this file exists to enforce structurally, from section 10 of the
   design system: **a table never scrolls horizontally on a phone.** `Board`
   does not offer that as an option. It mounts a table above `md` and a caller
   supplied card list below it, and it will not compile without the card
   renderer, so the mobile case cannot be forgotten.

   Density, from section 4: 44px comfortable, 36px compact, compact being the
   desktop default. Rank or identity first, metrics right aligned and tabular so
   numbers line up down the column. Hairline dividers and a hover response, and
   deliberately no zebra striping. Ornament budget is zero: a Board is an
   instrument, not a trophy case. */

/* -------------------------------------------------------------------------
   The page frame

   Console already holds its density pairs in one file rather than letting
   every route re-derive them. Board had only the table, so each of the four
   member facing boards was inventing its own column width, header band and
   row height. These are the same three pieces, expressed once.

     row height   min-h-11 md:min-h-9    44 -> 36
     body text    text-sm md:text-[13px]
     meta text    text-xs md:text-[11px]
     section gap  gap-4 md:gap-3

   Mobile is never compact: the card list keeps 44px targets whatever density
   the table above `md` declares.
   ------------------------------------------------------------------------- */

export const BOARD_ROW = "min-h-11 md:min-h-9";
export const BOARD_BODY = "text-sm md:text-[13px]";
export const BOARD_META = "text-xs md:text-[11px]";
export const BOARD_GAP = "gap-4 md:gap-3";

type BoardWidth = "narrow" | "wide";

/* A Board expands to fill, but only as far as its widest column set can use.
   Four columns do not get more readable by being given a 1200px line. */
const WIDTH: Record<BoardWidth, string> = {
  narrow: "max-w-2xl lg:max-w-3xl",
  wide: "max-w-2xl lg:max-w-4xl",
};

export function BoardPage({
  width = "narrow",
  className,
  children,
}: {
  width?: BoardWidth;
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

/* Back control, title, kicker, lede and page level actions, in one band.
   House rule 16: every page that can be navigated into needs a back control,
   so it is part of the header rather than an optional sibling. */
export function BoardHeader({
  title,
  kicker,
  lede,
  actions,
  backHref,
  className,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-3 md:gap-2", className)}>
      <BackButton {...(backHref ? { href: backHref } : {})} />
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-semibold text-bone sm:text-2xl md:text-lg">
            {title}
          </h1>
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
      {lede ? (
        <p className={cx("text-bone-mut", BOARD_BODY)}>{lede}</p>
      ) : null}
    </div>
  );
}

/* The vertical rhythm between Board sections. Compact above `md`. */
export function BoardStack({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex flex-col", BOARD_GAP, className)}>{children}</div>
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

/* A caption on a hairline, drawn across the whole board. The one thing a
   Board is allowed to interrupt itself with, because a cut line carries
   meaning that no column can. */
export function BoardRule({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-px flex-1 bg-steel-line" />
      <span className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
        {children}
      </span>
      <span className="h-px flex-1 bg-steel-line" />
    </div>
  );
}

export function Board<T>({
  label,
  columns,
  rows,
  rowKey,
  rowHref,
  rowLabel,
  highlight,
  divider,
  muted,
  card,
}: {
  /* Names the board for screen readers. */
  label: string;
  columns: BoardColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /* Where the whole row navigates, if it navigates at all. A table row cannot
     be an anchor, so this lays one link over the row and leaves it as the
     row's single tab stop, rather than scattering a link into every cell.
     Return null for a row with nowhere to go. */
  rowHref?: (row: T) => string | null;
  /* The accessible name for that row link. Required alongside `rowHref`,
     because a link covering a row of cells has no text of its own. */
  rowLabel?: (row: T) => string;
  /* Marks the viewer's own row. One treatment, applied here, so "this is you"
     never gets re-derived per board. */
  highlight?: (row: T) => boolean;
  /* A rule drawn across the board immediately above this row, naming what
     changes at it: the cut line on a contributor board, a tier break, a
     season boundary. Return null everywhere it does not apply. It spans the
     table and repeats in the card list, so the meaning survives the layout
     change instead of being a desktop only flourish. */
  divider?: (row: T, index: number) => ReactNode | null;
  /* Dims a row that is still real but no longer counts. */
  muted?: (row: T) => boolean;
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
            {rows.map((row, index) => {
              const href = rowHref?.(row) ?? null;
              const mine = highlight?.(row) ?? false;
              const rule = divider?.(row, index) ?? null;
              const key = rowKey(row);
              return (
                <Fragment key={key}>
                  {rule ? (
                    <tr>
                      <td colSpan={columns.length} className="px-3 pb-1 pt-3">
                        <BoardRule>{rule}</BoardRule>
                      </td>
                    </tr>
                  ) : null}
                  <tr
                    className={cx(
                      "border-b border-steel-line transition-colors duration-fast ease-out-quint last:border-b-0 hover:bg-panel/60",
                      href && "relative",
                      mine && "bg-panel-warm/40",
                      muted?.(row) && "opacity-60"
                    )}
                  >
                    {columns.map((c, i) => (
                      <td
                        key={c.key}
                        className={cx(
                          "h-9 px-3 py-2 align-middle text-bone-mut",
                          c.numeric && "tnum text-right",
                          c.className
                        )}
                      >
                        {i === 0 && href ? (
                          <Link
                            href={href}
                            aria-label={rowLabel?.(row)}
                            className="absolute inset-0"
                          />
                        ) : null}
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>

      <ul
        aria-label={label}
        className="flex flex-col gap-2 md:hidden"
      >
        {rows.map((row, index) => {
          const rule = divider?.(row, index) ?? null;
          return (
            <Fragment key={rowKey(row)}>
              {rule ? (
                <li className="pt-1.5">
                  <BoardRule>{rule}</BoardRule>
                </li>
              ) : null}
              <li className={cx(muted?.(row) && "opacity-60")}>{card(row)}</li>
            </Fragment>
          );
        })}
      </ul>
    </>
  );
}

/* The mobile half of a Board: identity first, then the metrics that were
   columns, then the row's controls. */
export function BoardCard({
  title,
  subtitle,
  leading,
  trailing,
  badges,
  stats,
  actions,
  href,
  highlight,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /* Rank, sigil or avatar. Whatever identifies the row before its name does. */
  leading?: ReactNode;
  /* The one figure the board ranks on, kept beside the name rather than
     buried in the stat grid. */
  trailing?: ReactNode;
  badges?: ReactNode;
  stats?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  /* Makes the whole card the row's link. A row that navigates on desktop must
     navigate on a phone too, and a 44px card is the touch target. */
  href?: string;
  /* The viewer's own row. */
  highlight?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-bone">{title}</p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-bone-faint">
              {subtitle}
            </p>
          ) : null}
        </div>
        {trailing ? (
          <div className="tnum shrink-0 text-right">{trailing}</div>
        ) : null}
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
    </>
  );

  return (
    <Card
      pad="sm"
      variant="inset"
      {...(href ? { interactive: true, render: <Link href={href} /> } : {})}
      className={cx(
        "block min-h-11",
        highlight && "border-gold/40 bg-panel-warm/40",
        className
      )}
    >
      {body}
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
