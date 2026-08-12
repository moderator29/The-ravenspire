"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/social/avatar";
import { CommentThread } from "@/components/social/comment-thread";
import { RichBody } from "@/components/social/rich-body";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { Tab, Tabs, TabsList, TabsPanel } from "@/components/ui/tabs";
import { Ceremony } from "@/components/realm/ceremony";
import { CallAnalysis } from "@/components/calls/call-analysis";
import { CATEGORY_LABEL, claimSentence, percent, resolverLine } from "@/components/calls/claim";
import { realmFetch } from "@/lib/auth/api";
import { timeAgo } from "@/lib/social/types";
import {
  callProgress,
  difficultyBand,
  scoreOutlook,
  sourceLabel,
} from "@/lib/calls/analytics";
import type { CallData } from "@/lib/calls/types";

/* The Call detail page: the spectator surface (V2 section 9.7).

   Until now a Call could not be opened. It was a card in a list, linking to the
   raven it rode on, so a reader could see that someone had Called something and
   nothing about whether the claim was hard, what the caller was staking, who
   disagreed, or what it finally scored.

   Dossier archetype: hero band, then tabs, then panels, always that order. The
   hero is the one place a Dossier may use the Forge register and it is spent on
   the two things that carry weight, the live line while the window runs and the
   score once it closes. Everything below it is Ledger: flat, quiet, dense.

   Real data only. A Call with no evidence says so, a caller with nothing
   settled has an empty record, and a subject the realm cannot price right now
   carries no live line rather than an invented one. */

interface Author {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier?: string;
}

interface Consensus {
  independent: number;
  eligible: boolean;
  needed: number;
  mean_confidence: number | null;
  callers: {
    id: string;
    confidence: number | null;
    verdict: string;
    author: Author | null;
  }[];
}

interface Record_ {
  hits: number;
  misses: number;
  total: number;
  score: number;
  hit_rate: number;
  streak: number;
  best_streak: number;
}

export interface CallDetail {
  id: string;
  body: string;
  created_at: string;
  closes_at: number;
  like_count: number;
  reply_count: number;
  view_count: number;
  author_id: string;
  author: Author | null;
  /* Server resolved: is the reader the caller. The client never decides this. */
  is_yours: boolean;
  data: CallData;
  live: { price: number; at: string } | null;
  consensus: Consensus;
  record: Record_;
}

const EMPTY_AUTHOR = {
  handle: null,
  display_name: null,
  avatar_url: null,
  house_slug: null,
};

function price(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  if (n >= 1)
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(3)}`;
}

/* The window running down. A Call that only sits there is a receipt; a Call
   with a clock on it is an event. */
function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = to - now;
  if (ms <= 0) return <span className="text-bone-faint">Settling</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="tnum text-gold-rich">
      {d > 0
        ? `${d}d ${h}h`
        : h > 0
          ? `${h}h ${m}m`
          : `${m}m ${String(sec).padStart(2, "0")}s`}
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict?: string }) {
  if (verdict === "hit") return <Badge variant="success">Hit</Badge>;
  if (verdict === "miss") return <Badge variant="danger">Miss</Badge>;
  if (verdict === "void") return <Badge>Void</Badge>;
  return <Badge variant="gold">Open</Badge>;
}

/* The live line: sealed price on the left, the move the Call needs on the
   right, and how far it has actually travelled. Only transform and opacity
   animate, so the fill scales rather than reflowing. */
function ProgressLine({ call, live }: { call: CallData; live: { price: number } }) {
  const p = callProgress({
    entry: call.entry_price ?? 0,
    current: live.price,
    threshold: call.threshold ?? 0,
    direction: call.stance === "down" ? "down" : "up",
  });
  if (!p) return null;

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="tnum text-bone-faint">
          Sealed {price(call.entry_price)}
        </span>
        <span
          className={`tnum font-semibold ${p.toward >= 0 ? "text-chart-up" : "text-chart-down"}`}
        >
          {price(live.price)} ({p.move >= 0 ? "+" : ""}
          {percent(p.move, 2)})
        </span>
        <span className="tnum text-bone-faint">
          {p.required > 0
            ? `Needs ${call.stance === "down" ? "-" : "+"}${percent(p.required)}`
            : "Needs any move"}
        </span>
      </div>
      {/* The track is a recess and now says so. `--shadow-well` is lit from
          the same upper left as everything else, so its occlusion falls along
          the top edge and the fill reads as sitting inside the channel rather
          than as two flat colours meeting. */}
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-steel-deep shadow-well">
        <div
          className="h-full origin-left rounded-sm bg-[image:linear-gradient(90deg,var(--gold-deep),var(--gold-bright))] transition-transform duration-base ease-out-quint"
          style={{ transform: `scaleX(${Math.max(p.fraction, 0.002)})` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-bone-faint">
        {p.clears
          ? "On this print the Call would land if the window closed now."
          : `${Math.round(p.fraction * 100)}% of the move it needs, on the last print the realm would settle against.`}
      </p>
    </div>
  );
}

function ScoreBlock({ call }: { call: CallData }) {
  const score = typeof call.score === "number" ? call.score : null;
  const basis = call.score_basis ?? "legacy";

  const explain =
    basis === "peer"
      ? "Scored against the independent members who Called the same claim. A peer score sums to zero across everyone in it, so it cannot be farmed by picking easy claims."
      : basis === "baseline"
        ? "Scored against the difficulty frozen when the Call was sealed, so being right about something easy pays what it was worth."
        : "Sealed before the realm froze difficulties, so it scored nothing. Inventing one now would be scoring against a world that did not exist.";

  return (
    <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-2 border-t border-steel-line pt-4">
      {score !== null && basis !== "legacy" ? (
        <div>
          <p
            className={`tnum font-display text-3xl font-semibold leading-none ${
              score >= 0 ? "text-chart-up" : "text-chart-down"
            }`}
          >
            {score > 0 ? "+" : ""}
            {score}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-bone-faint">
            Season Rating
          </p>
        </div>
      ) : null}
      {score !== null && basis !== "legacy" ? (
        <div>
          <p className="tnum font-display text-xl font-semibold leading-none text-bone">
            {Math.max(score, 0) > 0 ? "+" : ""}
            {Math.max(score, 0)}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-bone-faint">
            Renown, which never falls
          </p>
        </div>
      ) : null}
      <p className="min-w-[16rem] flex-1 text-xs leading-relaxed text-bone-mut">
        {explain}
      </p>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <Card pad="md" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="h-4 w-4 shrink-0 text-gold" />
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-bone-mut">
          {title}
        </h2>
      </div>
      {children}
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Card pad="md" className="flex flex-col gap-3">
        <Skeleton radius="sm" className="h-4 w-40" />
        <Skeleton radius="sm" className="h-6 w-4/5" />
        <Skeleton radius="sm" className="h-1.5 w-full" />
      </Card>
      <Card pad="md" className="flex flex-col gap-2">
        <Skeleton radius="sm" className="h-3 w-32" />
        <Skeleton radius="sm" className="h-3 w-full" />
        <Skeleton radius="sm" className="h-3 w-3/5" />
      </Card>
    </div>
  );
}

export function CallDetailView({ id }: { id: string }) {
  const [call, setCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [ceremony, setCeremony] = useState(false);
  const showSkeleton = useDelayedLoading(loading);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await realmFetch<{ call?: CallDetail; error?: string }>(
        `/api/calls/${encodeURIComponent(id)}`
      );
      if (cancelled) return;
      setLoading(false);
      if (res.data?.call) setCall(res.data.call);
      else setMissing(true);
    })();
    /* A real view, counted once per member per day, server side. */
    void realmFetch("/api/views", { method: "POST", json: { post_id: id } });
    return () => {
      cancelled = true;
    };
  }, [id]);

  /* A Call resolving is one of the few genuine Ceremony moments in the product,
     and it belongs to the caller. It fires once per Call per browser: a reward
     that reappears on every visit is ambient, and ambient ornament means
     nothing. */
  useEffect(() => {
    if (!call || !call.is_yours) return;
    const verdict = call.data.verdict;
    if (verdict !== "hit" && verdict !== "miss") return;
    const key = `ravenspire:call-ceremony:${call.id}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      return;
    }
    setCeremony(true);
  }, [call]);

  if (showSkeleton) return <DetailSkeleton />;
  if (loading) return null;

  if (missing || !call) {
    return (
      <Card pad="lg">
        <EmptyState
          icon="target"
          title="This Call is not in the realm"
          body="It was withdrawn, or it never was."
          action={
            <Button variant="glass" size="md" render={<Link href="/calls" />}>
              Back to Calls
            </Button>
          }
        />
      </Card>
    );
  }

  const data = call.data;
  const open = data.verdict === "open";
  const pi0 = typeof data.pi_0 === "number" ? data.pi_0 : null;
  const confidence = typeof data.confidence === "number" ? data.confidence : null;
  const band = pi0 !== null ? difficultyBand(pi0) : null;
  const outlook =
    pi0 !== null && confidence !== null ? scoreOutlook(confidence, pi0) : null;
  const sources = data.sources ?? [];
  const record = call.record;
  const handle = call.author?.handle;

  return (
    <div className="flex flex-col gap-3">
      {/* Hero band. */}
      <Card pad="md" variant="warm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{CATEGORY_LABEL[data.category ?? "markets"] ?? "Markets"}</Badge>
          <VerdictBadge verdict={data.verdict} />
          <span className="ml-auto text-xs text-bone-faint">
            {open ? (
              <>
                Closes in <Countdown to={call.closes_at} />
              </>
            ) : data.settled_at ? (
              `Settled ${timeAgo(data.settled_at)}`
            ) : (
              "Settled"
            )}
          </span>
        </div>

        <h1 className="mt-2.5 font-display text-xl font-semibold leading-snug text-bone sm:text-2xl">
          {claimSentence(data)}
        </h1>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bone-faint">
          {confidence !== null && (
            <span className="tnum">
              Stated at{" "}
              <span className="text-bone">{Math.round(confidence * 100)}%</span>
            </span>
          )}
          {band && (
            <span>
              Rated <span className="text-gold-rich">{band.label}</span>
            </span>
          )}
          <span className="tnum">Sealed {timeAgo(call.created_at)}</span>
        </div>

        {open && call.live && data.entry_price ? (
          <ProgressLine call={data} live={call.live} />
        ) : null}

        {!open && <ScoreBlock call={data} />}

        {open && !call.live && data.resolver !== "internal" && (
          <p className="mt-3 text-xs text-bone-faint">
            The realm has no trustworthy print for this subject right now, so
            there is no live line. The verdict waits for real data rather than
            settling on a guess.
          </p>
        )}
      </Card>

      {/* The caller. A Call is a claim with a name on it, and the name comes
          with a record. */}
      <Card pad="sm" className="flex flex-wrap items-center gap-3">
        <Avatar author={call.author ?? EMPTY_AUTHOR} size={38} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-bone">
            {call.author?.display_name ?? call.author?.handle ?? "Unknown"}
          </p>
          <p className="tnum text-[11px] text-bone-faint">
            {record.total > 0
              ? `${record.hits} of ${record.total} settled Calls landed${
                  record.streak >= 2 ? `, ${record.streak} in a row` : ""
                }`
              : "No settled Calls yet"}
          </p>
        </div>
        {handle && (
          <Button
            variant="glass"
            size="sm"
            className="ml-auto"
            render={<Link href={`/calls/caller/${handle}`} />}
          >
            The record
          </Button>
        )}
      </Card>

      <Tabs defaultValue="case">
        <TabsList>
          <Tab value="case">The case</Tab>
          <Tab value="difficulty">Difficulty</Tab>
          <Tab value="consensus">
            Consensus
            {call.consensus.callers.length > 0 && (
              <span className="tnum ml-1.5 text-bone-faint">
                {call.consensus.callers.length}
              </span>
            )}
          </Tab>
          <Tab value="discussion">
            Discussion
            {call.reply_count > 0 && (
              <span className="tnum ml-1.5 text-bone-faint">
                {call.reply_count}
              </span>
            )}
          </Tab>
        </TabsList>

        <TabsPanel value="case" className="mt-3">
          {/* `grid-cols-1` is not decoration and it is not implied by having
              one child. Without a base column definition the implicit track is
              `auto`, whose floor is the min-content contribution of its widest
              item, and a track is never shrunk below its floor. So a single
              long name inside a `truncate` (which is `white-space: nowrap`,
              and therefore has a min-content width equal to the whole string)
              pushed the column out and every ancestor with it.

              Measured on the Consensus tab at 390px: the column resolved to
              455.078px inside a 358px container and
              `document.documentElement.scrollWidth` read 472 against a
              clientWidth of 390. The page scrolled sideways by 82px and
              nothing in the class list said so. `min-w-0` on the flex child
              does not help, because that governs flex shrinking inside a
              definite width, not the min-content contribution an auto track
              sizes itself from.

              Tailwind's `grid-cols-N` is `repeat(N, minmax(0, 1fr))`, and the
              zero minimum is the whole point: it lets the track be narrower
              than its content, which is what makes `truncate` able to
              truncate. Every Dossier grid in this file and in the caller
              profile carries it for the same reason. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="The read" icon="scroll">
              {data.rationale ? (
                <p className="text-sm leading-relaxed text-bone-mut">
                  {data.rationale}
                </p>
              ) : (
                <p className="text-sm text-bone-faint">
                  The caller stated no reasoning.
                </p>
              )}
              {call.body && (
                <div className="border-t border-steel-line pt-2.5 text-sm leading-relaxed text-bone-mut">
                  <RichBody text={call.body} />
                </div>
              )}
              <p className="text-xs text-bone-faint">{resolverLine(data)}</p>
            </Panel>

            <Panel title="Evidence" icon="docs">
              {sources.length > 0 ? (
                <ul className="flex flex-col">
                  {sources.map((source) => (
                    <li key={source} className="min-w-0">
                      {/* A row of its own, so it is a row sized target. This
                          measured 324x32 at 390px: wide enough to hit by
                          accident and short enough to miss on purpose, which
                          is the worst of both. It is not the inline link in a
                          sentence that the 44px floor forgives, it is the only
                          way out of this card to the evidence, so it takes the
                          floor. The negative margin lets the hover plate reach
                          the card's padding edge without the text moving. */}
                      <a
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="-mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-gold transition-colors duration-fast hover:bg-panel hover:text-gold-bright"
                      >
                        <Icon name="share" className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{sourceLabel(source)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-bone-faint">
                  The caller cited nothing. A Call stands on its record either
                  way, but a cited one can be checked.
                </p>
              )}

              <div className="border-t border-steel-line pt-2.5">
                <dl className="flex flex-col gap-1.5 text-xs">
                  {typeof data.entry_price === "number" && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-bone-faint">Sealed at</dt>
                      <dd className="tnum text-bone">{price(data.entry_price)}</dd>
                    </div>
                  )}
                  {typeof data.settled_price === "number" && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-bone-faint">Settled at</dt>
                      <dd className="tnum text-bone">
                        {price(data.settled_price)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-bone-faint">Window</dt>
                    <dd className="tnum text-bone">{data.timeframe ?? "24h"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-bone-faint">Views</dt>
                    <dd className="tnum text-bone">
                      {call.view_count.toLocaleString()}
                    </dd>
                  </div>
                </dl>
              </div>
            </Panel>
          </div>
        </TabsPanel>

        <TabsPanel value="difficulty" className="mt-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="How hard this is" icon="ledger">
              {band && pi0 !== null ? (
                <>
                  <p className="font-display text-lg font-semibold text-gold-bright">
                    {band.label}
                  </p>
                  <p className="tnum text-sm text-bone-mut">
                    Lands on its own {Math.round(pi0 * 100)} times in 100.
                  </p>
                  <p className="text-sm leading-relaxed text-bone-mut">
                    {band.blurb}
                  </p>
                  {typeof data.sigma === "number" && data.token ? (
                    <p className="text-xs leading-relaxed text-bone-faint">
                      Measured from real trailing prices: ${data.token} moves
                      about{" "}
                      {((data.sigma / Math.sqrt(365)) * 100).toFixed(1)}% on a
                      typical day, which is{" "}
                      {(data.sigma * 100).toFixed(0)}% annualized. That
                      volatility, the {data.timeframe ?? "24h"} window and the
                      move required are the whole of the rating.
                    </p>
                  ) : data.resolver === "internal" ? (
                    <p className="text-xs leading-relaxed text-bone-faint">
                      Rated from the realm&apos;s own base rate for this claim at
                      the moment it was sealed, read off real rows rather than an
                      assumed prior.
                    </p>
                  ) : null}
                  <p className="text-xs text-bone-faint">
                    Frozen when the Call was sealed and never recomputed, so the
                    caller was scored against the world they actually saw.
                  </p>
                </>
              ) : (
                <p className="text-sm text-bone-faint">
                  This Call predates frozen difficulties, so the realm cannot say
                  how hard it was without inventing a number.
                </p>
              )}
            </Panel>

            <Panel title="What it is worth" icon="medal">
              {outlook && confidence !== null ? (
                <>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <div>
                      <p className="tnum font-display text-xl font-semibold text-chart-up">
                        {outlook.ifHit > 0 ? "+" : ""}
                        {outlook.ifHit}
                      </p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-bone-faint">
                        If it lands
                      </p>
                    </div>
                    <div>
                      <p className="tnum font-display text-xl font-semibold text-chart-down">
                        {outlook.ifMiss}
                      </p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-bone-faint">
                        If it misses
                      </p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-bone-mut">
                    At {Math.round(confidence * 100)}% stated confidence against a
                    baseline of {Math.round((pi0 ?? 0) * 100)}%. Renown takes the
                    gain and never falls; Season Rating takes both. The realm
                    settles it, not the caller.
                  </p>
                  {!open && (
                    <p className="text-xs text-bone-faint">
                      The realized score is in the hero band above. It can differ
                      from this outlook when enough independent members Called
                      the same claim, because the crowd then replaces the model
                      as the baseline.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-bone-faint">
                  No stated confidence and no frozen baseline, so there is
                  nothing honest to price this at.
                </p>
              )}
            </Panel>
          </div>

          <div className="mt-3">
            <CallAnalysis id={call.id} verdict={data.verdict ?? "open"} />
          </div>
        </TabsPanel>

        <TabsPanel value="consensus" className="mt-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="The crowd" icon="user">
              <p className="tnum text-sm text-bone-mut">
                {call.consensus.independent} independent{" "}
                {call.consensus.independent === 1 ? "member" : "members"} Called
                this claim in the same window.
              </p>
              {call.consensus.mean_confidence !== null && (
                <p className="tnum text-sm text-bone-mut">
                  They averaged{" "}
                  {Math.round(call.consensus.mean_confidence * 100)}% confidence.
                </p>
              )}
              <p className="text-xs leading-relaxed text-bone-faint">
                {call.consensus.eligible
                  ? "That is enough of a crowd, so this Call is scored against them rather than against the volatility model. A peer score sums to zero across everyone in it."
                  : `The realm needs ${call.consensus.needed} independent members before the crowd replaces the model as the baseline.`}
              </p>
              <p className="text-xs leading-relaxed text-bone-faint">
                Independent means neither the caller nor anyone sworn to their
                House. Six people in one House agreeing is not a crowd.
              </p>
            </Panel>

            <Panel title="Who else called it" icon="banner">
              {call.consensus.callers.length > 0 ? (
                <ul className="flex flex-col">
                  {call.consensus.callers.slice(0, 12).map((c) => (
                    <li
                      key={c.id}
                      className="min-w-0 border-t border-steel-line first:border-t-0"
                    >
                      {/* The whole row is the link, not the name inside it.
                          The name alone measured 286x20 at 390px, and it was
                          the one target on the row: the avatar beside it and
                          the verdict badge after it both looked like part of
                          the same control and neither did anything. A row that
                          reads as one thing should be one target, and at
                          `min-h-11` it is one that can be hit. */}
                      <Link
                        href={`/calls/${c.id}`}
                        className="-mx-2 flex min-h-11 min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-fast hover:bg-panel"
                      >
                        <Avatar author={c.author ?? EMPTY_AUTHOR} size={26} />
                        <span className="min-w-0 flex-1 truncate text-sm text-bone-mut">
                          {c.author?.display_name ??
                            c.author?.handle ??
                            "Unknown"}
                        </span>
                        {c.confidence !== null && (
                          <span className="tnum shrink-0 text-xs text-bone-faint">
                            {Math.round(c.confidence * 100)}%
                          </span>
                        )}
                        <span className="shrink-0">
                          <VerdictBadge verdict={c.verdict} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-bone-faint">
                  Nobody else has Called this claim in this window. The caller is
                  out here alone.
                </p>
              )}
            </Panel>
          </div>
        </TabsPanel>

        <TabsPanel value="discussion" className="mt-3">
          <CommentThread postId={call.id} />
        </TabsPanel>
      </Tabs>

      <Ceremony
        open={ceremony}
        onClose={() => setCeremony(false)}
        icon={data.verdict === "hit" ? "trophy" : "scales"}
        eyebrow="Your Call has settled"
        title={data.verdict === "hit" ? "It struck true" : "It missed its mark"}
        body={claimSentence(data)}
        {...(typeof data.score === "number" && data.score_basis !== "legacy"
          ? {
              figure: `${data.score > 0 ? "+" : ""}${data.score}`,
              figureLabel: "Season Rating",
            }
          : {})}
        tone={data.verdict === "hit" ? "gold" : "steel"}
        action={{ label: "See the record", href: handle ? `/calls/caller/${handle}` : "/calls" }}
      />
    </div>
  );
}
