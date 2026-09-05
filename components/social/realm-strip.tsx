"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { MusterCell, type MusterPayload } from "@/components/realm/muster";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* The realm strip.
 *
 * The row above the Ravenry. Its whole job is to answer, before a member
 * scrolls, "is something happening, and am I in it".
 *
 * Board density rather than Stream density: this is an instrument, so it is
 * tight, numeric and quiet. It is deliberately NOT a dashboard of everything.
 * Four cells, each one either a streak the member can lose today, a rivalry
 * they can affect, a clock that is running, or a promise they already made.
 *
 * Real data only. A cell whose fact the realm cannot answer honestly does not
 * render at all, and when nothing can be answered the strip disappears rather
 * than showing a row of zeroes. */

interface Strip {
  streak: number | null;
  house: {
    slug: string;
    name: string;
    rank: number;
    glory: number;
    rival: { name: string; gap: number; ahead: boolean } | null;
  } | null;
  openCalls: number | null;
  muster: MusterPayload | null;
  season: { id: number; name: string; endsAt: string } | null;
}

function daysLeft(iso: string): number | null {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.ceil(ms / 86400000);
}

function Cell({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      /* Natural width on a phone, equal shares above `md`.
       *
       * `flex-1` is `flex: 1 1 0%`, so three cells in a 366px strip were each
       * squeezed to about 120px and `truncate` did the rest. Measured on a
       * real phone: the label read "HOUSE STOR..." and the value read "65
       * ahead of ...", which is a status strip that has stopped carrying
       * status. A House name and a rival's name are the whole point of that
       * cell, and they were the two things cut.
       *
       * The strip already scrolls, so letting the cells take the width they
       * need costs nothing and the reader gets whole words. Above `md` there
       * is room for equal shares, which reads better than three cells of
       * ragged width, so the shrinking behaviour comes back there. */
      className="group flex min-w-0 shrink-0 flex-col justify-center gap-0.5 rounded-md px-2.5 py-2 transition-colors duration-fast ease-out-quint hover:bg-panel/60 max-md:min-h-11 md:flex-1 md:shrink"
    >
      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </span>
      <span className="truncate text-[13px] font-medium text-bone">
        {children}
      </span>
    </Link>
  );
}

export function RealmStrip() {
  const { ready, authenticated } = useRealmAuth();
  const [data, setData] = useState<Strip | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    void realmFetch<Strip>("/api/realm/strip").then((res) => {
      if (!cancelled && res.data) setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated]);

  if (!data) return null;

  const season = data.season ? daysLeft(data.season.endsAt) : null;
  const cells: React.ReactNode[] = [];

  /* The Muster leads the strip, and it is the only cell that ever leads.
     The other three describe standing; this one is the only one that expires,
     and a clock a member can miss belongs at the start of the row rather than
     at the end of a horizontally scrolling one on a phone. */
  if (data.muster) {
    cells.push(
      <MusterCell
        key="muster"
        muster={data.muster}
        onChange={(next) =>
          setData((prev) => (prev ? { ...prev, muster: next } : prev))
        }
      />
    );
  }

  if (data.streak && data.streak > 0) {
    cells.push(
      <Cell key="streak" href="/renown" label="Streak">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="flame" className="h-3.5 w-3.5 text-ember" />
          <span className="tnum">
            {data.streak} {data.streak === 1 ? "day" : "days"}
          </span>
        </span>
      </Cell>
    );
  }

  if (data.house) {
    cells.push(
      <Cell
        key="house"
        href={`/houses/${data.house.slug}`}
        label={`${data.house.name} · ${data.house.rank}${["st", "nd", "rd"][data.house.rank - 1] ?? "th"}`}
      >
        {data.house.rival ? (
          <span className="tnum">
            {data.house.rival.gap.toLocaleString()}{" "}
            <span className="font-normal text-bone-mut">
              {data.house.rival.ahead ? "behind" : "ahead of"} {data.house.rival.name}
            </span>
          </span>
        ) : (
          <span className="tnum">{data.house.glory.toLocaleString()} glory</span>
        )}
      </Cell>
    );
  }

  if (typeof data.openCalls === "number" && data.openCalls > 0) {
    cells.push(
      <Cell key="calls" href="/calls?view=mine" label="Your Calls">
        <span className="tnum">
          {data.openCalls} open
        </span>
      </Cell>
    );
  }

  if (season !== null && data.season) {
    cells.push(
      <Cell key="season" href="/leaderboards" label={data.season.name}>
        <span className="tnum">
          {season} {season === 1 ? "day" : "days"} left
        </span>
      </Cell>
    );
  }

  if (cells.length === 0) return null;

  /* No margin of its own: the page's dashboard cluster owns the gap below
     this, so the strip and the digest beneath it read as one instrument.
     A hairline divider between cells, rather than a gap, is what makes a
     row of facts read as a single dense instrument instead of loose chips:
     the same distinction section 2 of the design system draws between a
     Board's rows and a Stream's cards. */
  return (
    <Card
      pad="xs"
      className="scrollbar-none flex items-stretch divide-x divide-steel-line overflow-x-auto"
    >
      {cells}
    </Card>
  );
}
