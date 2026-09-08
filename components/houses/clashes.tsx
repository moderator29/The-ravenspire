"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Meter } from "@/components/ui/meter";
import { useDelayedLoading } from "@/components/ui/skeleton";
import { BoardSkeleton } from "@/components/board/board-shell";
import { Avatar } from "@/components/social/avatar";
import { houseIcon, HOUSE_TOP_N } from "@/lib/data/houses";
import type { ClashRow, ClashCadence } from "@/lib/houses/view";
import { cadenceCountdown, clashCountdown } from "@/lib/houses/view";

/* Weekly House Clashes, the shared component behind two surfaces: the
   realm-wide list at /houses?view=clashes and, as its own Underline tab, one
   House's own hall. A Clash always scores every House at once (house_clash
   results carry a full board, never a 1v1 pairing), so there is nothing to
   filter down to for a single House's tab, only something to point at:
   `highlightSlug` marks that House's own row in every card's scoreboard
   rather than hiding the other five. */

export function Clashes({ highlightSlug }: { highlightSlug?: string }) {
  const [clashes, setClashes] = useState<ClashRow[] | null>(null);
  const [cadence, setCadence] = useState<ClashCadence | null>(null);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedLoading(loading);

  useEffect(() => {
    let live = true;
    void fetch("/api/houses/clashes")
      .then((r) => r.json())
      .then((payload: { clashes?: ClashRow[]; cadence?: ClashCadence }) => {
        if (!live) return;
        setClashes(payload.clashes ?? []);
        setCadence(payload.cadence ?? null);
        setLoading(false);
      })
      .catch(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  if (showSkeleton) return <BoardSkeleton rows={6} columns={6} />;
  if (loading) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {cadence ? <Cadence cadence={cadence} /> : null}

      {!clashes || clashes.length === 0 ? (
        <Card>
          <EmptyState
            icon="swords"
            title="No Clash has been called yet"
            body={
              cadence
                ? "The calendar opens the next one. Nothing has been called before now, so there is no record to show."
                : "A Clash is a 48 hour window in which every Call sealed counts toward its House, with the scoreboard running live throughout."
            }
          />
        </Card>
      ) : (
        clashes.map((clash) => (
          <ClashCard key={clash.id} clash={clash} highlightSlug={highlightSlug} />
        ))
      )}
    </div>
  );
}

/* The weekly clock, above the Clashes and present whether or not one exists.
 *
 * This is the honest empty state the surface never had. A Clashes tab that can
 * only say "none has been called" gives a member no reason to look again, and
 * the reason it could only say that is that Clashes had no schedule at all:
 * every one had to be typed by a steward, so in practice none was ever called.
 * Now that they are on the calendar, the calendar is a fact worth publishing,
 * and publishing a rule is not the same as inventing a record.
 *
 * `scheduled` keeps it honest in the other direction. When the row for the
 * next window has not been written yet the card says the Clash is due rather
 * than showing a countdown to something that does not exist. */
export function Cadence({ cadence }: { cadence: ClashCadence }) {
  /* Re-render on the minute so the countdown does not go stale behind a member
     who leaves the tab open. Motion is not involved: this is a number
     changing, and nothing on the Ledger register animates. */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card variant="warm" pad="sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Icon name="swords" className="h-4 w-4 shrink-0 text-gold" />
        <p className="text-sm text-bone">Clashes run every weekend</p>
        <span className="tnum text-xs text-bone-faint">
          {cadenceCountdown(cadence)}
        </span>
        {cadence.scheduled ? null : <Badge variant="default">Due</Badge>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-bone-mut">
        A Clash opens on Friday at 18:00 UTC and runs for {cadence.hours} hours.
        Every Call sealed inside the window counts toward its House, scored on
        the same top {HOUSE_TOP_N}{" "}
        rule as the season, and the result is frozen when it closes.
      </p>
    </Card>
  );
}

function ClashCard({
  clash,
  highlightSlug,
}: {
  clash: ClashRow;
  highlightSlug?: string;
}) {
  const board = clash.houses.filter((h) => h.calls > 0 || h.score !== 0);
  const leader = board[0];
  const top = Math.max(1, ...board.map((h) => Math.max(0, h.score)));
  const settled = clash.settled_at !== null;
  /* Closed and settled are different facts and the card says which. A Clash
     that has closed but has not settled has no result yet, and calling that
     "final" would be claiming a board the realm has not frozen. */
  const winner = settled && board.length > 0 ? board[0] : null;

  return (
    <Card pad="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-5">
        <Icon name="swords" className="h-4 w-4 shrink-0 text-gold" />
        <h2 className="font-display text-base font-semibold text-bone">
          {clash.title}
        </h2>
        {clash.phase === "live" ? (
          <Badge variant="gold" icon="flame">
            Live
          </Badge>
        ) : clash.phase === "upcoming" ? (
          <Badge variant="default">Upcoming</Badge>
        ) : settled ? (
          <Badge variant="gold">Final</Badge>
        ) : (
          <Badge variant="default">Closed</Badge>
        )}
      </div>

      <p className="px-4 pt-1.5 text-xs text-bone-mut sm:px-5">
        {clash.token ? `Calls on $${clash.token}` : clash.theme}
        {" · "}
        {clashCountdown(clash)}
        {winner ? (
          <>
            {" · "}
            <b className="font-semibold text-gold">{winner.name}</b> took it
          </>
        ) : null}
      </p>

      <div className="px-4 py-4 sm:px-5">
        {board.length === 0 ? (
          <EmptyState
            size="sm"
            bordered
            icon="raven"
            title="No Calls inside the window yet"
            body={
              settled
                ? "This Clash closed with no Calls made under it, so no House took it."
                : clash.phase === "closed"
                  ? "This Clash closed with no Calls made under it. Its result is not frozen yet."
                  : "The first Call made inside the window opens the scoreboard."
            }
          />
        ) : (
          <>
            <ol className="flex flex-col gap-2">
              {board.map((house) => {
                const mine = highlightSlug && house.slug === highlightSlug;
                return (
                  <li
                    key={house.slug}
                    className={`flex items-center gap-3 ${
                      mine
                        ? "-mx-2 rounded-md border border-gold/30 bg-panel-warm/40 px-2 py-1"
                        : ""
                    }`}
                  >
                    <span className="tnum w-4 shrink-0 text-center text-xs text-bone-faint">
                      {house.rank}
                    </span>
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm"
                      style={{
                        background: `linear-gradient(160deg, ${house.color}22, #101017)`,
                        border: `1px solid ${house.color}44`,
                        color: house.color,
                      }}
                    >
                      <Icon name={houseIcon(house.slug)} className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-bone">
                        {house.name}
                        {mine ? (
                          <span className="ml-1.5 text-[10px] font-normal uppercase tracking-[0.14em] text-gold">
                            Your House
                          </span>
                        ) : null}
                      </p>
                      <Meter
                        value={house.score}
                        max={top}
                        size="xs"
                        floor={3}
                        className="mt-1"
                      />
                    </div>
                    <p className="tnum shrink-0 text-right text-xs text-bone-mut">
                      <b className="text-gold">{house.score.toLocaleString()}</b>
                      <span className="ml-2 text-bone-faint">
                        {house.hits}/{house.calls}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ol>

            {/* Named contributors. A scoreboard without names is a table. */}
            {clash.contributors.length > 0 ? (
              <div className="mt-4 border-t border-steel-line pt-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                  Carrying it
                  {leader ? ` · ${leader.name} lead` : ""}
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {clash.contributors.slice(0, 5).map((c) => (
                    <li key={c.profile_id} className="flex items-center gap-2.5">
                      <Avatar
                        author={{
                          handle: c.member?.handle ?? null,
                          display_name: c.member?.display_name ?? null,
                          avatar_url: c.member?.avatar_url ?? null,
                          house_slug: c.house_slug,
                        }}
                        size={26}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-bone">
                        {c.member?.handle ? (
                          <Link
                            href={`/u/${c.member.handle}`}
                            className="hover:text-gold"
                          >
                            {c.member.display_name ?? `@${c.member.handle}`}
                          </Link>
                        ) : (
                          "A member of the realm"
                        )}
                        <span className="ml-1.5 text-bone-faint">
                          {c.house_name}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-xs text-bone-mut">
                        {c.hits}/{c.calls} ·{" "}
                        <b className="text-gold">{c.glory.toLocaleString()}</b>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
