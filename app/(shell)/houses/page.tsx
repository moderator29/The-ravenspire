"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/tabs";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { Avatar } from "@/components/social/avatar";
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
    <Suspense fallback={<HousesSkeleton />}>
      <HousesSurface />
    </Suspense>
  );
}

function HousesSurface() {
  const router = useRouter();
  const params = useSearchParams();
  const view: View = params.get("view") === "clashes" ? "clashes" : "standings";

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
            Houses
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
            Six banners, one season
          </p>
        </div>
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
      </header>

      {view === "standings" ? <Standings /> : <Clashes />}
    </div>
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
    <>
      <Card variant="warm" pad="sm" className="mt-4">
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
        <Card className="mt-4">
          <EmptyState
            icon="banner"
            title="No standings yet"
            body="The realm has not opened a season, so no House has a score to defend."
          />
        </Card>
      ) : (
        <ol className="mt-4 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.slug}>
              <StandingRow row={row} top={top} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function StandingRow({ row, top }: { row: HouseStandingRow; top: number }) {
  const meta = houseBySlug(row.slug);
  const rivalMeta = row.rival ? houseBySlug(row.rival.slug) : null;
  const color = meta?.color ?? "#D9B040";
  const width = Math.max(3, (Math.max(0, row.score) / top) * 100);

  return (
    <Card
      interactive
      pad="none"
      render={<Link href={`/houses/${row.slug}`} />}
      className="block p-3.5 sm:p-4"
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="tnum w-5 shrink-0 text-center font-display text-lg text-bone-faint">
          {row.rank}
        </span>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11"
          style={{
            background: `linear-gradient(160deg, ${color}22, #101017)`,
            border: `1px solid ${color}44`,
            color,
          }}
        >
          <Icon name={houseIcon(row.slug)} className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-display text-[15px] font-semibold text-bone sm:text-base">
              {meta?.name ?? row.slug}
            </p>
            <Badge variant="default">Lv {row.level.level}</Badge>
          </div>
          <p className="mt-0.5 hidden truncate text-xs italic text-bone-faint sm:block">
            {meta?.motto}
          </p>
          <div className="bar-track mt-2 h-1.5 w-full">
            <div className="bar-gold h-full" style={{ width: `${width}%` }} />
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="tnum text-sm font-semibold text-gold sm:text-base">
            {row.score.toLocaleString()}
          </p>
          <p className="tnum text-[11px] text-bone-faint">
            {row.counted} of {row.member_count} counting
          </p>
        </div>
      </div>

      {/* Naming the nearest House is what turns a table into a race. */}
      {row.rival && rivalMeta ? (
        <p className="mt-2.5 flex items-center gap-1.5 border-t border-steel-line pt-2.5 text-xs text-bone-mut">
          <Icon name="swords" className="h-3.5 w-3.5 shrink-0 text-gold" />
          {row.rival.ahead ? (
            <>
              Holding off{" "}
              <b className="font-semibold text-bone">{rivalMeta.name}</b> by{" "}
              <span className="tnum">{row.rival.gap.toLocaleString()}</span>
            </>
          ) : (
            <>
              <span className="tnum">{row.rival.gap.toLocaleString()}</span>{" "}
              behind <b className="font-semibold text-bone">{rivalMeta.name}</b>
            </>
          )}
        </p>
      ) : null}
    </Card>
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
                    <div className="bar-track mt-1 h-1 w-full">
                      <div
                        className="bar-gold h-full"
                        style={{
                          width: `${Math.max(3, (Math.max(0, house.score) / top) * 100)}%`,
                        }}
                      />
                    </div>
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

function HousesSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
      <Skeleton radius="sm" className="h-6 w-28" />
      <div className="mt-5 flex flex-col gap-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} radius="xl" className="h-[86px] w-full" />
        ))}
      </div>
    </div>
  );
}
