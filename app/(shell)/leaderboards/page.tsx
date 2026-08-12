"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/tabs";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { realmFetch } from "@/lib/auth/api";

/* The Roll of Honour: real standings across the realm by Renown, Glory and
   Points. Points are the earned balance shown as points (they convert to $RSP
   at TGE); no $RSP figure is surfaced. Real data only, honest empty state. */

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

function rankGlyph(rank: number): string {
  return `${rank}`;
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

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <h1 className="font-display text-xl font-semibold text-bone">
        The Roll of Honour
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Leaderboards
      </p>
      <p className="mt-3 text-sm text-bone-mut">
        The realm&apos;s highest standing, ranked by real deeds. {active.blurb}.
      </p>

      {/* Metric tabs */}
      {/* Three mutually exclusive rankings, which is a SegmentedControl. The
          hand rolled version carried none of the arrow key handling or roving
          tabindex a member expects from a row of tabs. */}
      <SegmentedControl
        label="Ranking"
        block
        className="mt-5"
        value={metric}
        onValueChange={(next) => setMetric(next as (typeof METRICS)[number]["key"])}
        items={METRICS.map((m) => ({ value: m.key, label: m.label }))}
      />

      <div className="mt-4 flex flex-col gap-2">
        {entries === null ? (
          [0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))
        ) : error ? (
          <EmptyState
            icon="alert"
            bordered
            title="The roll could not be read"
            body="Something went wrong reaching the standings."
            action={
              <Button variant="glass" size="md" onClick={() => void load(metric)}>
                Try again
              </Button>
            }
          />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="medal"
            bordered
            title="No standings yet"
            body={`Earn ${active.label} and claim your place on the roll.`}
          />
        ) : (
          entries.map((e) => {
            const name =
              e.displayName ?? (e.handle ? `@${e.handle}` : "A member");
            const top3 = e.rank <= 3;
            return (
              <Link
                key={e.id}
                href={e.handle ? `/u/${e.handle}` : "#"}
                className={`glass glass-sm flex min-h-11 items-center gap-3 px-3.5 py-3 transition-colors duration-fast hover:border-gold/30 ${
                  e.isViewer ? "border-gold/40 bg-panel-warm/40" : ""
                }`}
              >
                <span
                  className={`tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    top3
                      ? "border border-gold/50 bg-panel-warm text-gold-bright"
                      : "text-bone-faint"
                  }`}
                >
                  {rankGlyph(e.rank)}
                </span>
                {e.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={e.avatarUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full border border-steel-line object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-void text-bone-mut">
                    <Icon name="user" className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-bone">
                      {name}
                    </p>
                    {e.isVerified && (
                      <Icon name="medal" className="h-3.5 w-3.5 shrink-0 text-gold" />
                    )}
                  </div>
                  <p className="truncate text-[11px] text-bone-faint">
                    {e.handle ? `@${e.handle}` : ""}
                    {e.tier ? `${e.handle ? " · " : ""}${e.tier}` : ""}
                  </p>
                </div>
                {metric === "accuracy" ? (
                  <span className="shrink-0 text-right">
                    <span className="tnum gold-text block text-sm font-semibold">
                      {Math.round((e.hit_rate ?? 0) * 100)}%
                    </span>
                    <span className="tnum block text-[10px] text-bone-faint">
                      {e.total ?? 0} settled
                    </span>
                  </span>
                ) : (
                  <span className="tnum shrink-0 gold-text text-sm font-semibold">
                    {fmt(e.value)}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
