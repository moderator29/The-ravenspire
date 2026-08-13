"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
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

   TWO BODIES, ONE ARCHETYPE. `Board` is the columnar body, for rows that are
   genuinely comparable down a column. `BoardList` below is the list body, for
   rows that carry a portrait, a bar and a control rather than figures worth
   lining up. Both sit in the same frame, at the same density, under the same
   header, which is the whole point of them living in one file.

   The list body arrived here from `components/war/war-chrome.tsx`, which was
   the second Board implementation this comment used to name as a defect. It
   was not a bad implementation; it was a divergent one. Seven War routes drew
   their frame at one width, their heading at one size and their section rhythm
   at one gap, and the other nine boards in the realm drew all three
   differently, so a fix to either was a fix to half the product. The War now
   draws from here. What stayed behind in `war-chrome.tsx` is the part that is
   actually about The War: champion art, the four combat stats and the scale
   they are measured against.

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

   The section gap is one rung tighter than the table in section 4 of the
   design system first printed, and it is deliberate. That table was written
   before the founder read the product on a real phone and found the containers
   oversized, which is the same reading that tightened the Card padding scale by
   a quarter. The two had to move together: a tightened card inside an untouched
   gap reads as a card that shrank rather than a page that sharpened. The War's
   own frame was still at the untightened rhythm, which is one of the things
   that made the two halves of the product look like two products.

   Mobile is never compact: the card list keeps 44px targets whatever density
   the table above `md` declares.
   ------------------------------------------------------------------------- */

export const BOARD_ROW = "min-h-11 md:min-h-9";
export const BOARD_BODY = "text-sm md:text-[13px]";
export const BOARD_META = "text-xs md:text-[11px]";
export const BOARD_GAP = "gap-4 md:gap-3";

/* The list body's row rung: the height above, plus the padding and inline gap
   a row of portrait, name and control needs. One string, because a row that
   sets its own padding is a row that will one day set it differently. */
export const BOARD_LIST_ROW =
  "flex min-h-11 items-center gap-3 px-3 py-2 md:min-h-9 md:gap-2.5 md:py-1.5";

type BoardWidth = "narrow" | "wide" | "full";

/* A Board expands to fill, but only as far as its widest column set can use.
   Four columns do not get more readable by being given a 1200px line.

   `full` is the widest rung and exists for one surface: a hub that is mostly
   hero band and navigation rather than rows. It is not a licence to widen a
   board, and a board of columns should never reach for it. */
const WIDTH: Record<BoardWidth, string> = {
  narrow: "max-w-2xl lg:max-w-3xl",
  wide: "max-w-2xl lg:max-w-4xl",
  full: "max-w-2xl lg:max-w-5xl",
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
  backLabel,
  className,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  /* Names where back goes, when the destination is not obvious from the page
     you are on. A board reached from a hub says "The War" rather than "Back",
     which is the difference between a control you can aim and one you have to
     try. */
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-3 md:gap-2", className)}>
      {/* Sized to its label. Left bare in a `flex-col` it would stretch the
          full width of the page. */}
      <div className="flex">
        <BackButton
          {...(backHref ? { href: backHref } : {})}
          {...(backLabel ? { label: backLabel } : {})}
        />
      </div>
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
      /* The viewer's own row. Warm tint and a gold edge, kept flat by
         elevation, because a Board row that lifts off the page is ornament
         and section 2 gives a Board an ornament budget of zero. */
      variant={highlight ? "warm" : "inset"}
      elevation="flat"
      {...(highlight ? { tone: "gold" as const } : {})}
      {...(href ? { interactive: true, render: <Link href={href} /> } : {})}
      className={cx("block min-h-11", className)}
    >
      {body}
    </Card>
  );
}

/* -------------------------------------------------------------------------
   The list body

   For a board whose rows are not columns: a champion with a portrait and a
   mastery bar, a weapon with a price, a crest with a claim control. Putting
   those in a table would give every row four headings that describe nothing,
   and putting them in a second archetype is what The War did for seven routes.
   Same frame, same header, same density, different body.

   No `md:hidden` twin here, and that is not an oversight. A list row is
   already vertical: it holds one identity and one control, so it survives a
   phone by wrapping rather than by becoming a different component. The
   columnar body needs the twin because columns do not.
   ------------------------------------------------------------------------- */

export function BoardList({
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

/* One row of a list board. A thin wrapper over the row rung, so a caller
   never writes the padding themselves and rows across the realm agree. */
export function BoardListRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <li className={cx(BOARD_LIST_ROW, className)}>{children}</li>;
}

/* Shaped like a list board, not a generic grey slab. */
export function BoardListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card pad="none" className="overflow-hidden">
      <div className="divide-y divide-steel-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={BOARD_LIST_ROW}>
            <Skeleton radius="md" className="h-9 w-9 shrink-0" />
            <Skeleton radius="sm" className="h-3 w-40 max-w-[45%]" />
            <Skeleton radius="sm" className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------
   The standing strip

   The figures a board is read against, above the board itself: your gold, your
   Glory, your victories. Up to four numbers wide, right aligned and tabular so
   the column of figures lines up whatever the values are.

   The strip takes exactly as many columns as it has real numbers to put in
   them. An empty cell in a divided grid reads as data that failed to load,
   which is a lie the Ledger register cannot afford to tell.
   ------------------------------------------------------------------------- */

export interface BoardStat {
  label: string;
  value: number;
  /* An `Icon` name. Flat glyph, never a 3D icon: this is a dense strip. */
  icon: string;
}

/* Static class strings, because Tailwind cannot see a template literal. */
const STRIP_COLS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

export function BoardStrip({ stats }: { stats: BoardStat[] }) {
  return (
    <Card pad="none" className="overflow-hidden">
      <dl
        className={cx(
          "grid grid-cols-2 divide-x divide-y divide-steel-line sm:divide-y-0",
          STRIP_COLS[stats.length] ?? "sm:grid-cols-4"
        )}
      >
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
                  BOARD_META
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

/* Shaped like the strip it stands in for. */
export function BoardStripSkeleton() {
  return <Skeleton radius="xl" className="h-[104px] sm:h-[60px] md:h-[52px]" />;
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
