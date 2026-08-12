"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { Avatar } from "@/components/social/avatar";
import { realmFetch } from "@/lib/auth/api";
import { timeAgo } from "@/lib/social/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  StreamCard,
  StreamCardSkeleton,
  StreamColumn,
  StreamEmpty,
  StreamList,
} from "@/components/stream/stream-shell";
import {
  Board,
  BoardCard,
  BoardPage,
  BoardSkeleton,
} from "@/components/board/board-shell";
import { claimSentence, CATEGORY_LABEL } from "@/components/calls/claim";
import { difficultyBand } from "@/lib/calls/analytics";
import type { CallData } from "@/lib/calls/types";

/* The Calls index.

   Calls were the stated flagship of the realm and had no home: no route, no
   leaderboard, no detail, nothing but a post kind inside the feed. This is the
   surface where an open Call reads as a live event rather than a receipt.

   Real data only. Every view has an honest empty state, because a realm that
   has not made a Call yet should say so rather than invent one. */

const VIEWS = [
  { key: "live", label: "Live" },
  { key: "closing", label: "Closing soon" },
  { key: "trending", label: "Trending" },
  { key: "leaderboard", label: "Callers" },
  { key: "mine", label: "Mine" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

interface Author {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier: string;
}

interface CallItem {
  id: string;
  body: string;
  created_at: string;
  closes_at: number;
  like_count: number;
  reply_count: number;
  author: Author | null;
  call: CallData | null;
}

/* Author rows come back from the API nullable, and Avatar needs a shape rather
   than a null. This is an honest unknown, not a placeholder identity. */
const EMPTY_AUTHOR = {
  handle: null,
  display_name: null,
  avatar_url: null,
  house_slug: null,
};

interface Caller {
  profile_id: string;
  author: Author | null;
  hits: number;
  misses: number;
  total: number;
  hit_rate: number;
  score: number;
}

function price(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(3)}`;
}

/* A live countdown to the moment the window closes. This is the difference
   between a Call that sits there and a Call you want to watch. */
function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = to - now;
  if (ms <= 0) return <span className="text-bone-faint">settling</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="tnum text-gold-rich">
      {d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`}
    </span>
  );
}

function VerdictChip({ verdict }: { verdict?: string }) {
  if (verdict === "hit") return <Badge variant="success">Hit</Badge>;
  if (verdict === "miss") return <Badge variant="danger">Miss</Badge>;
  if (verdict === "void") return <Badge>Void</Badge>;
  return <Badge variant="gold">Open</Badge>;
}

/* One Call in the stream. Ember rail, because that is what a Call is in the
   card chassis (design system section 5). The claim reads as a sentence, and
   the two figures that decide what it is worth, the frozen difficulty and the
   stated confidence, are on the card rather than buried in the row. */
function CallCard({ item }: { item: CallItem }) {
  const c = item.call;
  const settled = c?.verdict && c.verdict !== "open";
  const move =
    settled && c?.settled_price && c?.entry_price
      ? ((c.settled_price - c.entry_price) / c.entry_price) * 100
      : null;
  const band = typeof c?.pi_0 === "number" ? difficultyBand(c.pi_0) : null;

  return (
    <StreamCard
      rail="ember"
      interactive
      render={<Link href={`/calls/${item.id}`} />}
      className="block"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{CATEGORY_LABEL[c?.category ?? "markets"] ?? "Markets"}</Badge>
        {band && <Badge variant="gold">{band.label}</Badge>}
        <div className="ml-auto">
          <VerdictChip verdict={c?.verdict} />
        </div>
      </div>

      <p className="mt-2 font-display text-[15px] font-semibold leading-snug text-bone">
        {c ? claimSentence(c) : "A Call"}
      </p>

      {c?.rationale ? (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-bone-mut">
          {c.rationale}
        </p>
      ) : item.body ? (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-bone-mut">
          {item.body}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {typeof c?.confidence === "number" && (
          <span className="tnum text-bone-faint">
            Stated{" "}
            <span className="text-bone">{Math.round(c.confidence * 100)}%</span>
          </span>
        )}
        {typeof c?.entry_price === "number" && (
          <span className="text-bone-faint">
            Sealed at <span className="tnum text-bone">{price(c.entry_price)}</span>
          </span>
        )}
        {settled ? (
          <span className="text-bone-faint">
            Settled at{" "}
            <span className="tnum text-bone">{price(c?.settled_price)}</span>
            {move !== null && (
              <span
                className={`tnum ml-1.5 ${move >= 0 ? "text-chart-up" : "text-chart-down"}`}
              >
                {move >= 0 ? "+" : ""}
                {move.toFixed(2)}%
              </span>
            )}
          </span>
        ) : (
          <span className="text-bone-faint">
            Closes in <Countdown to={item.closes_at} />
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-steel-line/60 pt-3">
        <Avatar author={item.author ?? EMPTY_AUTHOR} size={22} />
        <span className="truncate text-xs text-bone-mut">
          {item.author?.display_name ?? item.author?.handle ?? "Unknown"}
        </span>
        <span className="text-[11px] text-bone-faint">
          {timeAgo(item.created_at)}
        </span>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-bone-faint">
          <span className="flex items-center gap-1">
            <Icon name="heart" className="h-3.5 w-3.5" />
            {item.like_count}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="reply" className="h-3.5 w-3.5" />
            {item.reply_count}
          </span>
        </span>
      </div>
    </StreamCard>
  );
}

/* The board answers already ranked, so the rank travels on the row rather
   than being an index the renderer happens to be holding. */
type RankedCaller = Caller & { rank: number };

function callerName(caller: Caller): string {
  return caller.author?.display_name ?? caller.author?.handle ?? "Unknown";
}

function callerHref(caller: Caller): string | null {
  return caller.author?.handle ? `/calls/caller/${caller.author.handle}` : null;
}

/* The caller board. A Board, not a Stream: the whole point of it is comparing
   one record against another, and a stack of cards at every width made that
   impossible on the surface with the most room to do it. */
function CallerBoard({ callers }: { callers: RankedCaller[] }) {
  return (
    <Board
      label="Callers ranked by their record on settled Calls"
      rows={callers}
      rowKey={(c) => c.profile_id}
      rowHref={callerHref}
      rowLabel={(c) => `${callerName(c)}, rank ${c.rank}`}
      columns={[
        {
          key: "rank",
          header: "#",
          className: "w-10 whitespace-nowrap",
          cell: (c) => <span className="tnum text-bone-faint">{c.rank}</span>,
        },
        {
          key: "caller",
          header: "Caller",
          cell: (c) => (
            <span className="flex items-center gap-2.5">
              <Avatar author={c.author ?? EMPTY_AUTHOR} size={26} />
              <span className="truncate font-medium text-bone">
                {callerName(c)}
              </span>
            </span>
          ),
        },
        {
          key: "hits",
          header: "Hit",
          numeric: true,
          className: "whitespace-nowrap",
          cell: (c) => c.hits,
        },
        {
          key: "misses",
          header: "Missed",
          numeric: true,
          className: "whitespace-nowrap",
          cell: (c) => c.misses,
        },
        {
          key: "total",
          header: "Settled",
          numeric: true,
          className: "whitespace-nowrap",
          cell: (c) => c.total,
        },
        {
          key: "rate",
          header: "Rate",
          numeric: true,
          className: "whitespace-nowrap font-semibold text-gold",
          cell: (c) => `${Math.round(c.hit_rate * 100)}%`,
        },
      ]}
      card={(c) => (
        <BoardCard
          {...(callerHref(c) ? { href: callerHref(c)! } : {})}
          leading={
            <span className="flex items-center gap-2.5">
              <span className="tnum w-5 text-center text-xs text-bone-faint">
                {c.rank}
              </span>
              <Avatar author={c.author ?? EMPTY_AUTHOR} size={36} />
            </span>
          }
          title={callerName(c)}
          subtitle={`${c.hits} hit, ${c.misses} missed`}
          trailing={
            <>
              <span className="block text-sm font-semibold text-gold">
                {Math.round(c.hit_rate * 100)}%
              </span>
              <span className="block text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                {c.total} settled
              </span>
            </>
          }
        />
      )}
    />
  );
}

function Empty({ view }: { view: ViewKey }) {
  const copy: Record<ViewKey, { title: string; body: string }> = {
    live: {
      title: "No Calls are open",
      body: "A Call is a public, timestamped read you put your name to, sealed against a difficulty the realm measures before you commit. Seal the first one and the realm will watch it settle.",
    },
    closing: {
      title: "Nothing is closing yet",
      body: "Open Calls appear here as their windows run down, soonest first.",
    },
    trending: {
      title: "No Calls are moving",
      body: "When the realm starts arguing about a Call, it surfaces here.",
    },
    leaderboard: {
      title: "No records yet",
      body: "The board ranks callers once their Calls have settled. It rewards judgment over volume, so a long honest record beats a lucky streak.",
    },
    mine: {
      title: "You have not sealed a Call",
      body: "Make a read, put your name on it, and let the record speak for you.",
    },
  };
  const c = copy[view];
  return (
    <StreamEmpty
      icon="call-orb"
      title={c.title}
      body={c.body}
      action={
        <Button variant="gold" size="lg" render={<Link href="/compose" />}>
          Seal a Call
        </Button>
      }
    />
  );
}

function CallsBody() {
  const params = useSearchParams();
  const view = (params.get("view") ?? "live") as ViewKey;
  const [calls, setCalls] = useState<CallItem[] | null>(null);
  const [callers, setCallers] = useState<Caller[] | null>(null);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedLoading(loading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await realmFetch<{ calls?: CallItem[]; callers?: Caller[] }>(
        `/api/calls?view=${view}`
      );
      if (cancelled) return;
      setCalls(res.data?.calls ?? null);
      setCallers(res.data?.callers ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [view]);

  const board = view === "leaderboard";

  const isEmpty = useMemo(() => {
    if (loading) return false;
    return board
      ? !callers || callers.length === 0
      : !calls || calls.length === 0;
  }, [loading, board, calls, callers]);

  const ranked: RankedCaller[] = (callers ?? []).map((c, i) => ({
    ...c,
    rank: i + 1,
  }));

  const head = (
    <>
      <BackButton />

      <header className="mt-4">
        <h1 className="gold-text font-display text-2xl font-semibold tracking-wide">
          Calls
        </h1>
        <p className="mt-1 text-sm text-bone-mut">
          Public reads, sealed against a live price and settled by the realm.
        </p>
      </header>

      {/* Desktop view switcher. On mobile the dock carries this as its sub
          navigation, so it is hidden below the large breakpoint. */}
      <div
        role="tablist"
        aria-label="Calls views"
        className="scrollbar-none mt-4 hidden gap-1.5 overflow-x-auto lg:flex"
      >
        {VIEWS.map((v) => {
          const active = v.key === view;
          return (
            <Link
              key={v.key}
              role="tab"
              aria-selected={active}
              href={v.key === "live" ? "/calls" : `/calls?view=${v.key}`}
              className={`shrink-0 rounded-[--radius-md] border px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                active
                  ? "border-gold/40 bg-gold/15 text-gold-bright"
                  : "border-steel-line/70 bg-void/60 text-bone-mut hover:text-bone"
              }`}
            >
              {v.label}
            </Link>
          );
        })}
      </div>
    </>
  );

  /* Callers is the one view here that is not a Stream. Four of the five views
     are a column of Calls and keep the 640px law; the fifth is a ranking, and
     a ranking wants the room its columns can use. Same page, same header, a
     different frame under it, which is what responsive is not a resize means
     applied to a view rather than to a breakpoint. */
  if (board) {
    return (
      <BoardPage width="wide" className="px-4 py-5">
        {head}
        <div className="mt-4">
          {showSkeleton ? (
            <BoardSkeleton rows={8} columns={6} />
          ) : !loading && isEmpty ? (
            <Empty view={view} />
          ) : !loading ? (
            <CallerBoard callers={ranked} />
          ) : null}
        </div>
      </BoardPage>
    );
  }

  return (
    <StreamColumn className="px-4 py-5">
      {head}

      <StreamList className="mt-4">
        {showSkeleton && (
          <>
            {[0, 1, 2].map((i) => (
              <StreamCardSkeleton key={i} lines={i === 1 ? 3 : 2} />
            ))}
          </>
        )}

        {!loading && isEmpty && <Empty view={view} />}

        {!loading && calls?.map((c) => <CallCard key={c.id} item={c} />)}
      </StreamList>
    </StreamColumn>
  );
}

export default function CallsPage() {
  return (
    <Suspense
      fallback={
        <StreamColumn className="px-4 py-5">
          <Skeleton radius="xl" className="h-36 w-full" />
        </StreamColumn>
      }
    >
      <CallsBody />
    </Suspense>
  );
}
