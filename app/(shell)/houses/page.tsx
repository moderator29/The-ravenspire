"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Meter } from "@/components/ui/meter";
import { SegmentedControl } from "@/components/ui/tabs";
import { useDelayedLoading } from "@/components/ui/skeleton";
import { Avatar } from "@/components/social/avatar";
import {
  Board,
  BoardCard,
  BoardHeader,
  BoardPage,
  BoardSkeleton,
  BoardStack,
} from "@/components/board/board-shell";
import { houseBySlug, houseIcon, HOUSE_TOP_N } from "@/lib/data/houses";
import type { HouseStandingRow, ClashRow } from "@/lib/houses/view";
import { clashCountdown, seasonCountdown } from "@/lib/houses/view";

/* The Houses surface.
 *
 * It used to be six rows ordered by houses.glory, an all-time counter that six
 * Houses of unequal membership turn into a headcount contest. The standing
 * here is the sum of each House's top 20 contributors only, which is exactly
 * size neutral, and the rival named on every row is what turns a table into a
 * race with someone in it.
 *
 * Real data only: a House that has contributed nothing this season reads zero
 * and stays on the board. */

type View = "standings" | "clashes";

export default function HousesPage() {
  return (
    <Suspense
      fallback={
        <BoardPage width="wide">
          <HousesSkeleton />
        </BoardPage>
      }
    >
      <HousesSurface />
    </Suspense>
  );
}

function HousesSurface() {
  const router = useRouter();
  const params = useSearchParams();
  const view: View = params.get("view") === "clashes" ? "clashes" : "standings";

  return (
    <BoardPage width="wide">
      <BoardStack>
        <BoardHeader
          title="Houses"
          kicker="Six banners, one season"
          actions={
            <SegmentedControl
              label="Houses view"
              size="sm"
              value={view}
              onValueChange={(next) =>
                router.replace(
                  next === "clashes" ? "/houses?view=clashes" : "/houses",
                  { scroll: false }
                )
              }
              items={[
                { value: "standings", label: "Standings" },
                { value: "clashes", label: "Clashes" },
              ]}
            />
          }
        />

        {view === "standings" ? <Standings /> : <Clashes />}
      </BoardStack>
    </BoardPage>
  );
}

/* ------------------------------------------------------------------
   Standings
   ------------------------------------------------------------------ */

interface StandingsPayload {
  season: { id: number; name: string; ends_at: string } | null;
  offSeason: boolean;
  houses: HouseStandingRow[];
}

function Standings() {
  const [data, setData] = useState<StandingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedLoading(loading);

  useEffect(() => {
    let live = true;
    void fetch("/api/houses")
      .then((r) => r.json())
      .then((payload: StandingsPayload) => {
        if (!live) return;
        setData(payload);
        setLoading(false);
      })
      .catch(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  if (showSkeleton) return <HousesSkeleton />;
  if (loading) return null;

  const rows = data?.houses ?? [];
  const top = Math.max(1, ...rows.map((r) => Math.max(0, r.score)));

  return (
    <BoardStack>
      <Card variant="warm" pad="sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Icon name="scroll" className="h-4 w-4 shrink-0 text-gold" />
          <p className="text-sm text-bone">
            {data?.season ? data.season.name : "No season is running"}
          </p>
          {data?.season ? (
            <span className="text-xs text-bone-faint">
              {seasonCountdown(data.season.ends_at)}
            </span>
          ) : null}
          {data?.offSeason ? <Badge variant="gold">Off-season</Badge> : null}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-bone-mut">
          A House scores the sum of its top {HOUSE_TOP_N} contributors only, so
          a large House cannot outrank a sharp one on headcount. Ties break on
          those members&apos; mean.
        </p>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="banner"
            title="No standings yet"
            body="The realm has not opened a season, so no House has a score to defend."
          />
        </Card>
      ) : (
        <Board
          label="The six Houses ranked by their season score"
          rows={rows}
          rowKey={(row) => row.slug}
          rowHref={(row) => `/houses/${row.slug}`}
          rowLabel={(row) =>
            `${houseBySlug(row.slug)?.name ?? row.slug}, rank ${row.rank}`
          }
          columns={[
            {
              key: "rank",
              header: "#",
              className: "w-10 whitespace-nowrap",
              cell: (row) => (
                <span className="tnum font-display text-base text-bone-faint">
                  {row.rank}
                </span>
              ),
            },
            {
              key: "house",
              header: "House",
              cell: (row) => (
                <span className="flex items-center gap-2.5">
                  <Sigil slug={row.slug} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-display font-semibold text-bone">
                      {houseBySlug(row.slug)?.name ?? row.slug}
                    </span>
                    <span className="block truncate text-[11px] italic text-bone-faint">
                      {houseBySlug(row.slug)?.motto}
                    </span>
                  </span>
                </span>
              ),
            },
            {
              key: "level",
              header: "Level",
              numeric: true,
              className: "whitespace-nowrap",
              cell: (row) => row.level.level,
            },
            {
              key: "score",
              header: `Top ${HOUSE_TOP_N}`,
              numeric: true,
              className: "whitespace-nowrap font-semibold text-gold",
              cell: (row) => row.score.toLocaleString(),
            },
            {
              key: "counting",
              header: "Counting",
              numeric: true,
              className: "whitespace-nowrap",
              cell: (row) => `${row.counted} of ${row.member_count}`,
            },
            {
              key: "rival",
              header: "The race",
              className: "min-w-[13rem] text-xs",
              cell: (row) => <Rival row={row} />,
            },
          ]}
          /* Below md the columns become a card, and the bar comes back with
             them: cards sit one under another and cannot be compared by eye
             the way a column of right aligned figures can, so the share of
             the leader is what carries the comparison on a phone. */
          card={(row) => (
            <BoardCard
              href={`/houses/${row.slug}`}
              leading={<Sigil slug={row.slug} size="md" />}
              title={houseBySlug(row.slug)?.name ?? row.slug}
              subtitle={houseBySlug(row.slug)?.motto}
              trailing={
                <>
                  <span className="block text-sm font-semibold text-gold">
                    {row.score.toLocaleString()}
                  </span>
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                    Lv {row.level.level}
                  </span>
                </>
              }
            >
              <Meter value={row.score} max={top} className="mt-2.5" floor={3} />
              <p className="tnum mt-1.5 text-[11px] text-bone-faint">
                {row.counted} of {row.member_count} counting
              </p>
              {row.rival ? (
                <div className="mt-2.5 border-t border-steel-line pt-2.5 text-xs">
                  <Rival row={row} />
                </div>
              ) : null}
            </BoardCard>
          )}
        />
      )}
    </BoardStack>
  );
}

/* The House sigil in its own colour. Two sizes, matching the two densities. */
function Sigil({ slug, size }: { slug: string; size: "sm" | "md" }) {
  const color = houseBySlug(slug)?.color ?? "#D9B040";
  const box = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const glyph = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${box}`}
      style={{
        background: `linear-gradient(160deg, ${color}22, #101017)`,
        border: `1px solid ${color}44`,
        color,
      }}
    >
      <Icon name={houseIcon(slug)} className={glyph} />
    </span>
  );
}

/* Naming the nearest House is what turns a table into a race. */
function Rival({ row }: { row: HouseStandingRow }) {
  const rivalMeta = row.rival ? houseBySlug(row.rival.slug) : null;
  if (!row.rival || !rivalMeta)
    return <span className="text-bone-faint">Alone at the top</span>;
  return (
    <span className="flex items-center gap-1.5 text-bone-mut">
      <Icon name="swords" className="h-3.5 w-3.5 shrink-0 text-gold" />
      {row.rival.ahead ? (
        <span className="truncate">
          Holding off{" "}
          <b className="font-semibold text-bone">{rivalMeta.name}</b> by{" "}
          <span className="tnum">{row.rival.gap.toLocaleString()}</span>
        </span>
      ) : (
        <span className="truncate">
          <span className="tnum">{row.rival.gap.toLocaleString()}</span> behind{" "}
          <b className="font-semibold text-bone">{rivalMeta.name}</b>
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------
   Clashes
   ------------------------------------------------------------------ */

function Clashes() {
  const [clashes, setClashes] = useState<ClashRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedLoading(loading);

  useEffect(() => {
    let live = true;
    void fetch("/api/houses/clashes")
      .then((r) => r.json())
      .then((payload: { clashes?: ClashRow[] }) => {
        if (!live) return;
        setClashes(payload.clashes ?? []);
        setLoading(false);
      })
      .catch(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  if (showSkeleton) return <HousesSkeleton />;
  if (loading) return null;

  if (!clashes || clashes.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState
          icon="swords"
          title="No Clash has been called"
          body="A Clash is a 48 hour window on one nominated token. Only Calls made inside it count, and the scoreboard runs live while it does. The stewards call the next one."
        />
      </Card>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {clashes.map((clash) => (
        <ClashCard key={clash.id} clash={clash} />
      ))}
    </div>
  );
}

function ClashCard({ clash }: { clash: ClashRow }) {
  const board = clash.houses.filter((h) => h.calls > 0 || h.score !== 0);
  const leader = board[0];
  const top = Math.max(1, ...board.map((h) => Math.max(0, h.score)));

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
        ) : (
          <Badge variant="default">Closed</Badge>
        )}
      </div>

      <p className="px-4 pt-1.5 text-xs text-bone-mut sm:px-5">
        {clash.token ? `Calls on $${clash.token}` : clash.theme}
        {" · "}
        {clashCountdown(clash)}
      </p>

      <div className="px-4 py-4 sm:px-5">
        {board.length === 0 ? (
          <EmptyState
            size="sm"
            bordered
            icon="raven"
            title="No Calls inside the window yet"
            body={
              clash.phase === "closed"
                ? "This Clash closed with no Calls made under it."
                : "The first Call made inside the window opens the scoreboard."
            }
          />
        ) : (
          <>
            <ol className="flex flex-col gap-2">
              {board.map((house) => (
                <li key={house.slug} className="flex items-center gap-3">
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
              ))}
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

/* Six Houses, six rows. Shaped like the board it stands in for, rather than
   six generic blocks, so nothing shifts when the real standings arrive. */
function HousesSkeleton() {
  return <BoardSkeleton rows={6} columns={6} />;
}
