"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  isViewer: boolean;
}

const METRICS = [
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
  const [metric, setMetric] = useState<MetricKey>("renown");
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
      <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl border border-steel-line bg-void p-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
              metric === m.key
                ? "bg-panel-warm text-gold-bright"
                : "text-bone-faint hover:text-bone-mut"
            }`}
          >
            <Icon name={m.icon} className="h-4 w-4" />
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {entries === null ? (
          [0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="glass glass-sm h-16 animate-pulse" />
          ))
        ) : error ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            The roll could not be read right now.
            <button
              type="button"
              onClick={() => void load(metric)}
              className="mt-3 block w-full text-gold underline"
            >
              Try again
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            No standings yet. Earn {active.label} and claim your place on the
            roll.
          </div>
        ) : (
          entries.map((e) => {
            const name =
              e.displayName ?? (e.handle ? `@${e.handle}` : "A member");
            const top3 = e.rank <= 3;
            return (
              <Link
                key={e.id}
                href={e.handle ? `/u/${e.handle}` : "#"}
                className={`glass glass-sm flex items-center gap-3 px-3.5 py-3 transition hover:border-gold/30 ${
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
                <span className="tnum shrink-0 gold-text text-sm font-semibold">
                  {fmt(e.value)}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
