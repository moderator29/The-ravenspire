"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";
import { txExplorerUrlFor } from "@/components/wallet/chains";
import { WatchBadge } from "@/components/tools/watch-badge";

/* How many rows the tape keeps. New trades are prepended and the tail is
   trimmed, rather than the whole card growing without bound while a member
   leaves the page open. */
const TAPE_SIZE = 20;
const POLL_MS = 15_000;

/* The realm's shared trade feed: real, on-chain buys, sells and swaps made in
   platform by members, newest first. Reads the members-only feed route; never
   seeded or invented. Honest empty state when the realm has not traded yet. */

/* No amounts and no dollar figure, by the feed route's own decision. The
   verifier proves the transaction happened; the sizes and the USD value were
   client-supplied claims riding under that verified badge, so GET
   /api/trade/record now returns them as null and this card never drew a slot
   for them. What remains is exactly what is proven: who, which symbols, which
   kind, on which chain, with the hash one tap away. */
interface RealmTrade {
  id: string;
  kind: "buy" | "sell" | "swap";
  chainId: number;
  txHash: string;
  sellSymbol: string | null;
  buySymbol: string | null;
  buyContract: string | null;
  createdAt: string;
  trader: {
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

function timeAgo(iso: string, now: number): string {
  if (!now) return "";
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/* Symbols and kind only, and never a blank: a missing symbol reads as
   "a token" rather than as a hole in the sentence. */
function tradeLine(t: RealmTrade): string {
  const sell = t.sellSymbol ?? "a token";
  const buy = t.buySymbol ?? "a token";
  if (t.kind === "buy") return `bought ${buy}`;
  if (t.kind === "sell") return `sold ${sell}`;
  return `swapped ${sell} for ${buy}`;
}

export function RealmTrades() {
  const [trades, setTrades] = useState<RealmTrade[] | null>(null);
  const [now, setNow] = useState(0);

  /* A real tape, not a one-time read: repolls the same members-only feed and
     merges by id, newest first, so a trade another member makes while this
     card is open slides into view instead of needing a page reload to
     appear. Merging (rather than replacing wholesale) is what lets
     AnimatePresence below tell "a row that was already here" from "a row
     that just arrived" and animate only the latter in. */
  useEffect(() => {
    setNow(Date.now());
    let cancelled = false;
    const load = async () => {
      const res = await realmFetch<{ trades?: RealmTrade[] }>(
        `/api/trade/record?limit=${TAPE_SIZE}`
      );
      if (cancelled) return;
      const fresh = res.data?.trades ?? [];
      setTrades((prev) => {
        const byId = new Map((prev ?? []).map((t) => [t.id, t] as const));
        for (const t of fresh) byId.set(t.id, t);
        const merged = Array.from(byId.values())
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          .slice(0, TAPE_SIZE);
        return merged;
      });
    };
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Keeps "12s ago" honest while the card sits open, at a cadence too coarse
  // to matter for render cost.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Icon name="coin" className="h-5 w-5 shrink-0 text-gold" />
        <h2 className="font-display text-lg font-semibold text-bone">
          The realm is trading
        </h2>
        <span className="inline-flex items-center rounded-sm border border-gold/40 bg-panel-warm/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          Beta
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-bone-faint">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
          live
        </span>
      </div>
      <p className="mt-2 text-sm text-bone-mut">
        Real, on-chain trades made in platform by members. Newest first.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {trades === null ? (
          [0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))
        ) : trades.length === 0 ? (
          <EmptyState
            icon3d="market"
            bordered
            title="No trades in the realm yet"
            body="Make the first move through the Scrying Glass or The Swap."
          />
        ) : (
          /* initial={false}: the first mount (the tape's own first load)
             never plays an entrance, only rows that arrive afterward,
             through a later poll, do. `layout` lets an existing row glide to
             its new position (a transform, same as the entrance) rather than
             snapping when a fresher trade is inserted above it. */
          <AnimatePresence initial={false}>
            {trades.map((t) => {
              const name =
                t.trader.displayName ??
                (t.trader.handle ? `@${t.trader.handle}` : "A member");
              const explorer = txExplorerUrlFor(t.chainId, t.txHash);
              const up = t.kind === "buy";
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <Card
                    pad="none"
                    className="flex items-center gap-3 px-3.5 py-3"
                  >
                    {t.trader.avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={t.trader.avatarUrl}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full border border-steel-line object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-void text-bone-mut">
                        <Icon name="user" className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-bone">
                        <span className="font-medium">
                          {t.trader.handle ? (
                            <Link
                              href={`/u/${t.trader.handle}`}
                              className="hover:underline"
                            >
                              {name}
                            </Link>
                          ) : (
                            name
                          )}
                        </span>{" "}
                        <span
                          className={up ? "text-gold-bright" : "text-bone-mut"}
                        >
                          {tradeLine(t)}
                        </span>
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="truncate text-[11px] text-bone-faint">
                          {timeAgo(t.createdAt, now)} ago
                        </p>
                        {t.buyContract && (
                          <WatchBadge
                            address={t.buyContract}
                            chain={String(t.chainId)}
                            linkToWatch={false}
                          />
                        )}
                      </div>
                    </div>
                    {explorer && (
                      <a
                        href={explorer}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="View transaction"
                        className="shrink-0 text-bone-faint transition-colors hover:text-gold"
                      >
                        <Icon name="arrow" className="h-4 w-4" />
                      </a>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
