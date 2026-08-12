"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/social/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { Tab, Tabs, TabsList, TabsPanel } from "@/components/ui/tabs";
import { CATEGORY_LABEL, claimSentence } from "@/components/calls/claim";
import { realmFetch } from "@/lib/auth/api";
import { timeAgo } from "@/lib/social/types";
import type { CalibrationBucket } from "@/lib/calls/analytics";
import type { CallData } from "@/lib/calls/types";

/* The prediction profile (V2 section 9.8).

   Everything here is computed on the server from every Call the member has
   ever settled, so the accuracy shown on a profile is the same accuracy the
   caller board ranks by. Nothing is illustrative and nothing is projected: a
   member with an empty record gets an empty record.

   Two currencies, kept visibly apart, because collapsing them is what made
   Renown farmable in the first place. Renown never falls and is a legacy.
   Season Rating carries the downside and resets. */

interface Caller {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier: string;
  renown: number;
  season_rating: number;
}

interface Record_ {
  total: number;
  hits: number;
  misses: number;
  open: number;
  hit_rate: number;
  score: number;
  ranked: boolean;
  ranked_minimum: number;
  mean_score: number | null;
  scored: number;
  mean_confidence: number | null;
  streak: number;
  best_streak: number;
  on_fire: boolean;
}

interface HistoryEntry {
  id: string;
  created_at: string;
  body: string;
  call: CallData;
}

interface Payload {
  caller: Caller;
  record: Record_;
  calibration: CalibrationBucket[];
  categories: {
    category: string;
    hits: number;
    total: number;
    hit_rate: number;
  }[];
  history: HistoryEntry[];
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "gold" | "up" | "down";
}) {
  return (
    <div className="min-w-0">
      <p
        className={`tnum font-display text-xl font-semibold leading-none ${
          tone === "gold"
            ? "text-gold-bright"
            : tone === "up"
              ? "text-chart-up"
              : tone === "down"
                ? "text-chart-down"
                : "text-bone"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-bone-faint">{hint}</p> : null}
    </div>
  );
}

/* The calibration curve: stated probability against realized frequency, with
   the diagonal drawn (section 9.8).

   Only buckets that hold real settled Calls are plotted. An empty bucket is
   not drawn at zero, because a point at zero is a claim the member was wrong
   every time and they were never there at all. */
function CalibrationChart({ buckets }: { buckets: CalibrationBucket[] }) {
  const W = 260;
  const H = 200;
  const PAD_L = 30;
  const PAD_B = 26;
  const PAD_T = 10;
  const PAD_R = 10;

  /* The x axis starts at the confidence floor, because no Call below it can
     exist. */
  const X_MIN = 0.5;
  const x = (v: number) =>
    PAD_L + ((v - X_MIN) / (1 - X_MIN)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - v) * (H - PAD_T - PAD_B);

  const maxCount = Math.max(...buckets.map((b) => b.total), 1);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Calibration curve across ${buckets.length} confidence bands`}
      >
        {/* Frame. */}
        <line
          x1={PAD_L}
          y1={y(0)}
          x2={W - PAD_R}
          y2={y(0)}
          stroke="var(--steel-line)"
        />
        <line
          x1={PAD_L}
          y1={y(0)}
          x2={PAD_L}
          y2={y(1)}
          stroke="var(--steel-line)"
        />
        {/* Perfect calibration. */}
        <line
          x1={x(X_MIN)}
          y1={y(X_MIN)}
          x2={x(1)}
          y2={y(1)}
          stroke="var(--steel)"
          strokeDasharray="3 3"
        />
        {/* The member's curve. */}
        {buckets.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--gold)"
            strokeWidth="1.5"
            points={buckets
              .map((b) => `${x(b.stated)},${y(b.realized)}`)
              .join(" ")}
          />
        )}
        {buckets.map((b) => (
          <circle
            key={b.from}
            cx={x(b.stated)}
            cy={y(b.realized)}
            r={3 + (b.total / maxCount) * 3}
            fill="var(--gold-bright)"
          />
        ))}
        {/* Axis ends only. A dense axis on a small chart is noise. */}
        <text x={PAD_L} y={H - 8} fill="var(--bone-faint)" fontSize="9">
          50%
        </text>
        <text
          x={W - PAD_R}
          y={H - 8}
          textAnchor="end"
          fill="var(--bone-faint)"
          fontSize="9"
        >
          100%
        </text>
        <text x={4} y={y(1) + 4} fill="var(--bone-faint)" fontSize="9">
          100
        </text>
        <text x={10} y={y(0)} fill="var(--bone-faint)" fontSize="9">
          0
        </text>
      </svg>
      <figcaption className="mt-2 text-xs leading-relaxed text-bone-faint">
        Stated confidence across, realized frequency up, with perfect
        calibration on the diagonal. Points above the line mean the caller was
        more right than they claimed, below it means less. Point size is how
        many Calls sit in that band.
      </figcaption>
    </figure>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Card pad="md" className="flex items-center gap-3">
        <Skeleton radius="full" className="h-12 w-12" />
        <div className="flex-1">
          <Skeleton radius="sm" className="h-4 w-40" />
          <Skeleton radius="sm" className="mt-2 h-3 w-24" />
        </div>
      </Card>
      <Card pad="md" className="flex flex-col gap-2">
        <Skeleton radius="sm" className="h-3 w-32" />
        <Skeleton radius="sm" className="h-3 w-full" />
      </Card>
    </div>
  );
}

export function CallerProfile({ handle }: { handle: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedLoading(loading);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await realmFetch<Payload & { error?: string }>(
        `/api/calls/caller?handle=${encodeURIComponent(handle)}`
      );
      if (cancelled) return;
      setLoading(false);
      if (res.data?.caller) setData(res.data);
      else setMissing(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  if (showSkeleton) return <ProfileSkeleton />;
  if (loading) return null;

  if (missing || !data) {
    return (
      <Card pad="lg">
        <EmptyState
          icon="user"
          title="No such caller"
          body="Nobody in the realm answers to that name."
          action={
            <Button variant="glass" size="md" render={<Link href="/calls" />}>
              Back to Calls
            </Button>
          }
        />
      </Card>
    );
  }

  const { caller, record } = data;
  const name = caller.display_name ?? caller.handle ?? "Unknown";

  return (
    <div className="flex flex-col gap-3">
      {/* Hero band. */}
      <Card pad="md" variant="warm">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar
            author={{
              handle: caller.handle,
              display_name: caller.display_name,
              avatar_url: caller.avatar_url,
              house_slug: caller.house_slug,
            }}
            size={48}
          />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold text-bone">
              {name}
            </h1>
            {caller.handle && (
              <p className="truncate text-xs text-bone-faint">
                @{caller.handle}
              </p>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {record.on_fire && (
              <Badge variant="gold" icon="flame">
                {record.streak} in a row
              </Badge>
            )}
            {record.ranked ? (
              <Badge variant="gold">Ranked</Badge>
            ) : (
              <Badge>
                {record.ranked_minimum - record.total > 0
                  ? `${record.ranked_minimum - record.total} to rank`
                  : "Unranked"}
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-steel-line pt-4 sm:grid-cols-4">
          <Stat
            label="Renown"
            value={caller.renown.toLocaleString()}
            hint="Never falls"
            tone="gold"
          />
          <Stat
            label="Season Rating"
            value={`${caller.season_rating > 0 ? "+" : ""}${caller.season_rating.toLocaleString()}`}
            hint="Carries the downside"
            tone={caller.season_rating >= 0 ? "up" : "down"}
          />
          <Stat
            label="Settled Calls"
            value={record.total.toLocaleString()}
            hint={record.open > 0 ? `${record.open} still running` : undefined}
          />
          <Stat
            label="Landed"
            value={
              record.total > 0 ? `${Math.round(record.hit_rate * 100)}%` : "None"
            }
            hint={
              record.total > 0
                ? `${record.hits} of ${record.total}`
                : "Nothing settled yet"
            }
          />
        </div>
      </Card>

      <Tabs defaultValue="record">
        <TabsList>
          <Tab value="record">The record</Tab>
          <Tab value="calibration">Calibration</Tab>
          <Tab value="history">
            History
            {data.history.length > 0 && (
              <span className="tnum ml-1.5 text-bone-faint">
                {data.history.length}
              </span>
            )}
          </Tab>
        </TabsList>

        <TabsPanel value="record" className="mt-3">
          {/* `grid-cols-1`, for the reason recorded on the same grid in
              components/calls/call-detail.tsx: an implicit `auto` track cannot
              be shrunk below its widest item's min-content width, so one long
              unbroken name inside a `truncate` widens the column and scrolls
              the whole document sideways. This surface holds member names too,
              so it is the same latent defect and it takes the same cap. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card pad="md" className="flex flex-col gap-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-bone-mut">
                Judgment, not volume
              </h2>
              {record.total > 0 ? (
                <>
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <Stat
                      label="Caller score"
                      value={record.score.toFixed(3)}
                      hint="Shrunk toward zero"
                      tone="gold"
                    />
                    <Stat
                      label="Best run"
                      value={record.best_streak.toLocaleString()}
                    />
                    {record.mean_score !== null && (
                      <Stat
                        label="Mean score"
                        value={`${record.mean_score > 0 ? "+" : ""}${record.mean_score.toFixed(1)}`}
                        hint={`over ${record.scored} scored`}
                        tone={record.mean_score >= 0 ? "up" : "down"}
                      />
                    )}
                    {record.mean_confidence !== null && (
                      <Stat
                        label="Mean confidence"
                        value={`${Math.round(record.mean_confidence * 100)}%`}
                      />
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-bone-faint">
                    The caller score divides landed Calls by the total plus
                    twenty, so three lucky Calls cannot top the board and a long
                    honest record converges on true skill. It is the same number
                    the board ranks by.
                    {!record.ranked &&
                      ` A record is not called proven until ${record.ranked_minimum} Calls have settled.`}
                  </p>
                </>
              ) : (
                <EmptyState
                  icon="target"
                  size="sm"
                  title="Nothing has settled yet"
                  body="A record starts the first time one of their Calls resolves."
                />
              )}
            </Card>

            <Card pad="md" className="flex flex-col gap-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-bone-mut">
                Where they call
              </h2>
              {data.categories.length > 0 ? (
                <ul className="flex flex-col">
                  {data.categories.map((c) => (
                    <li
                      key={c.category}
                      className="flex items-center gap-3 border-t border-steel-line py-2 first:border-t-0 first:pt-0"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-bone-mut">
                        {CATEGORY_LABEL[c.category] ?? c.category}
                      </span>
                      <span className="tnum text-xs text-bone-faint">
                        {c.hits} of {c.total}
                      </span>
                      <span className="tnum w-10 text-right text-sm font-semibold text-gold-bright">
                        {Math.round(c.hit_rate * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-bone-faint">
                  No settled Calls to break down yet.
                </p>
              )}
            </Card>
          </div>
        </TabsPanel>

        <TabsPanel value="calibration" className="mt-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card pad="md" className="flex flex-col gap-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-bone-mut">
                Calibration
              </h2>
              {data.calibration.length > 0 ? (
                <CalibrationChart buckets={data.calibration} />
              ) : (
                <EmptyState
                  icon="target"
                  size="sm"
                  title="No curve yet"
                  body="A calibration curve needs settled Calls that carried a stated confidence. This is what makes stating one worth the trouble."
                />
              )}
            </Card>

            <Card pad="md" className="flex flex-col gap-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-bone-mut">
                Band by band
              </h2>
              {data.calibration.length > 0 ? (
                <ul className="flex flex-col">
                  {data.calibration.map((b) => (
                    <li
                      key={b.from}
                      className="flex items-center gap-3 border-t border-steel-line py-2 first:border-t-0 first:pt-0"
                    >
                      <span className="tnum min-w-0 flex-1 text-sm text-bone-mut">
                        {Math.round(b.from * 100)} to {Math.round(b.to * 100)}%
                      </span>
                      <span className="tnum text-xs text-bone-faint">
                        {b.hits} of {b.total}
                      </span>
                      <span className="tnum w-10 text-right text-sm font-semibold text-bone">
                        {Math.round(b.realized * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-bone-faint">
                  Nothing to break down until a Call with a stated confidence
                  settles.
                </p>
              )}
            </Card>
          </div>
        </TabsPanel>

        <TabsPanel value="history" className="mt-3">
          {data.history.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {data.history.map((entry) => {
                const verdict = entry.call.verdict ?? "open";
                const score =
                  typeof entry.call.score === "number" &&
                  entry.call.score_basis !== "legacy"
                    ? entry.call.score
                    : null;
                return (
                  <li key={entry.id}>
                    <Card
                      pad="sm"
                      interactive
                      render={<Link href={`/calls/${entry.id}`} />}
                      className="block"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-bone">
                          {claimSentence(entry.call)}
                        </span>
                        {verdict === "hit" && (
                          <Badge variant="success">Hit</Badge>
                        )}
                        {verdict === "miss" && (
                          <Badge variant="danger">Miss</Badge>
                        )}
                        {verdict === "open" && <Badge variant="gold">Open</Badge>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-bone-faint">
                        <span className="tnum">{timeAgo(entry.created_at)}</span>
                        {typeof entry.call.confidence === "number" && (
                          <span className="tnum">
                            stated {Math.round(entry.call.confidence * 100)}%
                          </span>
                        )}
                        {typeof entry.call.pi_0 === "number" && (
                          <span className="tnum">
                            baseline {Math.round(entry.call.pi_0 * 100)}%
                          </span>
                        )}
                        {score !== null && (
                          <span
                            className={`tnum font-semibold ${
                              score >= 0 ? "text-chart-up" : "text-chart-down"
                            }`}
                          >
                            {score > 0 ? "+" : ""}
                            {score}
                          </span>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Card pad="lg">
              <EmptyState
                icon="target"
                title="No Calls yet"
                body="Nothing has been sealed under this name."
              />
            </Card>
          )}
        </TabsPanel>
      </Tabs>

      <p className="px-1 text-[11px] leading-relaxed text-bone-faint">
        <Icon name="info" className="mr-1 inline h-3 w-3" />
        Every figure here is computed from this member&apos;s real settled
        Calls. Renown is permanent and never falls. Season Rating carries both
        directions and resets with the season.
      </p>
    </div>
  );
}
