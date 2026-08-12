"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Skeleton } from "@/components/ui/skeleton";

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
