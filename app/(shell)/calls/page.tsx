"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { Avatar } from "@/components/social/avatar";
import { realmFetch } from "@/lib/auth/api";
import { timeAgo } from "@/lib/social/types";

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
  call: {
    token?: string;
    stance?: "up" | "down";
    timeframe?: string;
    entry_price?: number;
    verdict?: "open" | "hit" | "miss";
    settled_price?: number;
  } | null;
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
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "Open", cls: "border-gold/35 bg-gold/12 text-gold-bright" },
    hit: { label: "Hit", cls: "border-gold/50 bg-gold/20 text-gold-bright" },
    miss: {
      label: "Miss",
      cls: "border-steel-line bg-panel text-bone-faint",
    },
  };
  const v = map[verdict ?? "open"] ?? map.open;
  return (
    <span
      className={`rounded-[--radius-sm] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

function CallCard({ item }: { item: CallItem }) {
  const c = item.call;
  const up = c?.stance === "up";
  const settled = c?.verdict && c.verdict !== "open";
  const move =
    settled && c?.settled_price && c?.entry_price
      ? ((c.settled_price - c.entry_price) / c.entry_price) * 100
      : null;

  return (
    <Link
      href={`/post/${item.id}`}
      className="glass block rounded-[--radius-xl] p-4 transition-colors duration-150 hover:border-gold/25"
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-base font-semibold text-bone">
          ${c?.token}
        </span>
        <span
          className={`flex items-center gap-1 rounded-[--radius-sm] border px-2 py-0.5 text-[11px] font-semibold ${
            up
              ? "border-gold/35 bg-gold/12 text-gold-bright"
              : "border-ember/35 bg-ember/12 text-ember"
          }`}
        >
          <Icon name="arrow" className={`h-3 w-3 ${up ? "" : "rotate-180"}`} />
          {up ? "Rises" : "Falls"}
        </span>
        <span className="text-[11px] text-bone-faint">{c?.timeframe}</span>
        <div className="ml-auto">
          <VerdictChip verdict={c?.verdict} />
        </div>
      </div>

      {item.body && (
        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-bone-mut">
          {item.body}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
        <span className="text-bone-faint">
          Sealed at <span className="tnum text-bone">{price(c?.entry_price)}</span>
        </span>
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
        <span className="truncate text-[12px] text-bone-mut">
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
    </Link>
  );
}

function CallerRow({ caller, rank }: { caller: Caller; rank: number }) {
  return (
    <Link
      href={`/u/${caller.author?.handle ?? ""}`}
      className="glass flex items-center gap-3 rounded-[--radius-lg] p-3 transition-colors duration-150 hover:border-gold/25"
    >
      <span className="tnum w-6 shrink-0 text-center font-display text-sm font-semibold text-gold">
        {rank}
      </span>
      <Avatar author={caller.author ?? EMPTY_AUTHOR} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-bone">
          {caller.author?.display_name ?? caller.author?.handle ?? "Unknown"}
        </p>
        <p className="text-[11px] text-bone-faint">
          {caller.hits} hit, {caller.misses} missed
        </p>
      </div>
      <div className="text-right">
        <p className="tnum font-display text-base font-semibold text-gold-bright">
          {Math.round(caller.hit_rate * 100)}%
        </p>
        <p className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
          {caller.total} settled
        </p>
      </div>
    </Link>
  );
}

function Empty({ view }: { view: ViewKey }) {
  const copy: Record<ViewKey, { title: string; body: string }> = {
    live: {
      title: "No Calls are open",
      body: "A Call is a public, timestamped read you put your name to. Seal the first one and the realm will watch it settle.",
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
    <div className="glass flex flex-col items-center rounded-[--radius-xl] px-6 py-12 text-center">
      <div className="glass glass-sm flex h-14 w-14 items-center justify-center rounded-[--radius-lg] text-gold">
        <Icon name="orb" className="h-7 w-7" />
      </div>
      <h2 className="mt-4 font-display text-lg font-semibold text-bone">
        {c.title}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-bone-mut">
        {c.body}
      </p>
      <Link
        href="/compose"
        className="btn-gold mt-6 rounded-[--radius-md] px-5 py-2.5 text-sm"
      >
        Seal a Call
      </Link>
    </div>
  );
}

function CallsBody() {
  const params = useSearchParams();
  const view = (params.get("view") ?? "live") as ViewKey;
  const [calls, setCalls] = useState<CallItem[] | null>(null);
  const [callers, setCallers] = useState<Caller[] | null>(null);
  const [loading, setLoading] = useState(true);

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

  const isEmpty = useMemo(() => {
    if (loading) return false;
    return view === "leaderboard"
      ? !callers || callers.length === 0
      : !calls || calls.length === 0;
  }, [loading, view, calls, callers]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
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

      <div className="mt-4 flex flex-col gap-2.5">
        {loading && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="glass h-36 animate-pulse rounded-[--radius-xl]"
              />
            ))}
          </>
        )}

        {!loading && isEmpty && <Empty view={view} />}

        {!loading &&
          view === "leaderboard" &&
          callers?.map((c, i) => (
            <CallerRow key={c.profile_id} caller={c} rank={i + 1} />
          ))}

        {!loading &&
          view !== "leaderboard" &&
          calls?.map((c) => <CallCard key={c.id} item={c} />)}
      </div>
    </div>
  );
}

export default function CallsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          <div className="glass h-36 animate-pulse rounded-[--radius-xl]" />
        </div>
      }
    >
      <CallsBody />
    </Suspense>
  );
}
