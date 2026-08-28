"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/tabs";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/social/avatar";
import {
  Board,
  BoardCard,
  BoardHeader,
  BoardPage,
  BoardSkeleton,
  BoardStack,
  type BoardColumn,
} from "@/components/board/board-shell";
import { houseBySlug } from "@/lib/data/houses";
import { realmFetch } from "@/lib/auth/api";

/* The Roll of Honour: real standings across the realm by accuracy, Renown,
   Glory and Points. Points are the earned balance shown as points (they convert
   to $RSP at TGE); no $RSP figure is surfaced. Real data only, honest empty
   state.

   Board archetype (design system section 2). It used to be a single stack of
   cards at every width, which is the Stream shape, so a member could never
   compare two rows without reading both of them end to end. Above `md` it is
   now a table with the metrics right aligned and tabular; below `md` it stays
   a card list, because a five column table on a phone is a horizontal scroll
   and section 10 forbids that. */

interface Entry {
  rank: number;
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  houseSlug: string | null;
  tier: string | null;
  isVerified: boolean;
  value: number;
  /* Accuracy board only: the raw rate and its sample size. The board ranks on
     a shrunk mean, but a member should see the honest numbers behind it. */
  hit_rate?: number;
  total?: number;
  isViewer: boolean;
}

const METRICS = [
  { key: "accuracy", label: "Accuracy", icon: "target", blurb: "Judgment on settled Calls, weighted so a long record beats a lucky streak" },
  { key: "renown", label: "Renown", icon: "medal", blurb: "Standing earned across the realm" },
  { key: "glory", label: "Glory", icon: "swords", blurb: "Won in the games and the War" },
  { key: "points", label: "Points", icon: "flame", blurb: "Earned toward $RSP at TGE" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function memberName(e: Entry): string {
  return e.displayName ?? (e.handle ? `@${e.handle}` : "A member");
}

function houseName(slug: string | null): string {
  return houseBySlug(slug)?.name ?? "Unsworn";
}

/* Avatar, name and the verification mark, the identity cell of every row. */
function Member({ entry, size }: { entry: Entry; size: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Avatar
        author={{
          handle: entry.handle,
          display_name: entry.displayName,
          avatar_url: entry.avatarUrl,
          house_slug: entry.houseSlug,
        }}
        size={size}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium text-bone">
            {memberName(entry)}
          </span>
          {entry.isVerified ? (
            <Icon name="medal" className="h-3.5 w-3.5 shrink-0 text-gold" />
          ) : null}
        </span>
        {entry.handle ? (
          <span className="block truncate text-[11px] text-bone-faint">
            @{entry.handle}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/* The rank badge. Top three carry the gold well, everyone else is a figure. */
function Rank({ rank }: { rank: number }) {
  return (
    <span
      className={
        rank <= 3
          ? "tnum inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-gold/50 bg-panel-warm px-1 font-semibold text-gold-bright"
          : "tnum text-bone-faint"
      }
    >
      {rank}
    </span>
  );
}

export default function LeaderboardsPage() {
  const [metric, setMetric] = useState<MetricKey>("accuracy");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async (m: MetricKey) => {
    setEntries(null);
    setError(false);
    const res = await realmFetch<{ entries?: Entry[] }>(
      `/api/leaderboards?metric=${m}`
    );
    if (res.ok && res.data?.entries) {
      setEntries(res.data.entries);
    } else {
      setEntries([]);
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load(metric);
  }, [metric, load]);

  const active = METRICS.find((m) => m.key === metric)!;
  const accuracy = metric === "accuracy";

  const columns: BoardColumn<Entry>[] = [
    {
      key: "rank",
      header: "#",
      className: "w-10 whitespace-nowrap",
      cell: (e) => <Rank rank={e.rank} />,
    },
    {
      key: "member",
      header: "Member",
      cell: (e) => <Member entry={e} size={28} />,
    },
    {
      key: "tier",
      header: "Tier",
      className: "whitespace-nowrap capitalize",
      cell: (e) => e.tier ?? "Smallfolk",
    },
    {
      key: "house",
      header: "House",
      className: "whitespace-nowrap",
      cell: (e) => houseName(e.houseSlug),
    },
    accuracy
      ? {
          key: "rate",
          header: "Rate",
          numeric: true,
          className: "whitespace-nowrap font-semibold text-gold",
          cell: (e) => `${Math.round((e.hit_rate ?? 0) * 100)}%`,
        }
      : {
          key: "value",
          header: active.label,
          numeric: true,
          className: "whitespace-nowrap font-semibold text-gold",
          cell: (e) => fmt(e.value),
        },
  ];

  if (accuracy) {
    columns.push({
      key: "settled",
      header: "Settled",
      numeric: true,
      className: "whitespace-nowrap",
      cell: (e) => fmt(e.total ?? 0),
    });
  }

  return (
    <BoardPage width="wide">
      <BoardStack>
        <BoardHeader
          title="The Roll of Honour"
          kicker="Leaderboards"
          /* Cold entry falls back to the Crossroads: the Roll ranks the
             realm's people, and finding people is the Crossroads' job. */
          backHref="/explore"
          lede={`The realm's highest standing, ranked by real deeds. ${active.blurb}.`}
        />

        {/* Four mutually exclusive rankings of the same members, switched in
            place, which is a SegmentedControl (design system section 3). */}
        <SegmentedControl
          label="Ranking"
          block
          value={metric}
          onValueChange={(next) => setMetric(next as MetricKey)}
          items={METRICS.map((m) => ({ value: m.key, label: m.label }))}
        />

        {entries === null ? (
          <BoardSkeleton rows={8} columns={accuracy ? 6 : 5} />
        ) : error ? (
          <Card pad="lg">
            <EmptyState
              icon="alert"
              title="The roll could not be read"
              body="Something went wrong reaching the standings."
              action={
                <Button variant="glass" size="md" onClick={() => void load(metric)}>
                  Try again
                </Button>
              }
            />
          </Card>
        ) : entries.length === 0 ? (
          <Card pad="lg">
            {/* The empty owns the whole surface here, which is where the 3D
                set is earned. The error state above it keeps the flat glyph:
                a failure is not a moment worth illustrating. */}
            <EmptyState
              icon3d="podium"
              title="No standings yet"
              body={`Earn ${active.label} and claim your place on the roll.`}
            />
          </Card>
        ) : (
          <Board
            label={`The realm ranked by ${active.label.toLowerCase()}`}
            rows={entries}
            rowKey={(e) => e.id}
            rowHref={(e) => (e.handle ? `/u/${e.handle}` : null)}
            rowLabel={(e) => `${memberName(e)}, rank ${e.rank}`}
            highlight={(e) => e.isViewer}
            columns={columns}
            card={(e) => (
              <BoardCard
                {...(e.handle ? { href: `/u/${e.handle}` } : {})}
                highlight={e.isViewer}
                leading={
                  <span className="flex items-center gap-2.5">
                    <span className="w-6 text-center">
                      <Rank rank={e.rank} />
                    </span>
                    <Avatar
                      author={{
                        handle: e.handle,
                        display_name: e.displayName,
                        avatar_url: e.avatarUrl,
                        house_slug: e.houseSlug,
                      }}
                      size={36}
                    />
                  </span>
                }
                title={
                  <span className="flex items-center gap-1.5">
                    {memberName(e)}
                    {e.isVerified ? (
                      <Icon name="medal" className="h-3.5 w-3.5 shrink-0 text-gold" />
                    ) : null}
                  </span>
                }
                subtitle={
                  <>
                    {e.handle ? `@${e.handle}` : ""}
                    {e.tier ? `${e.handle ? " · " : ""}${e.tier}` : ""}
                  </>
                }
                trailing={
                  accuracy ? (
                    <>
                      <span className="block text-sm font-semibold text-gold">
                        {Math.round((e.hit_rate ?? 0) * 100)}%
                      </span>
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                        {fmt(e.total ?? 0)} settled
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block text-sm font-semibold text-gold">
                        {fmt(e.value)}
                      </span>
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                        {active.label}
                      </span>
                    </>
                  )
                }
              />
            )}
          />
        )}
      </BoardStack>
    </BoardPage>
  );
}
