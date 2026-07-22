"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { WatchBadge } from "@/components/tools/watch-badge";
import { BackButton } from "@/components/shell/back-button";
import { TokenLogo } from "@/components/coin/token-logo";
import { WatchStar } from "@/components/coin/watch-star";
import { RealmTrades } from "@/components/trade/realm-trades";
import { TRADE_CHAINS } from "@/lib/trade/config";

interface TrendingToken {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidityUsd: number;
  marketCap: number | null;
  fdv: number | null;
  chain: string;
  watchChain: string | null;
  network: string;
  logo: string | null;
  address: string;
  url: string;
}

function coinHref(t: TrendingToken): string {
  const qs = new URLSearchParams();
  if (t.network) qs.set("net", t.network);
  if (t.symbol && t.symbol !== "?") qs.set("sym", t.symbol);
  const suffix = qs.toString();
  return `/coin/${encodeURIComponent(t.address)}${suffix ? `?${suffix}` : ""}`;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000)
    return `$${(value / 1_000_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}B`;
  if (value >= 1_000_000)
    return `$${(value / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (value >= 1_000)
    return `$${(value / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatPrice(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "?";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(2)}`;
}

const PAGE = 40;

export default function ScryingPage() {
  const [trending, setTrending] = useState<TrendingToken[] | null>(null);
  const [trendingError, setTrendingError] = useState(false);
  const [chainFilter, setChainFilter] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  const loadTrending = useCallback(async () => {
    setTrending(null);
    setTrendingError(false);
    try {
      const res = await fetch("/api/scrying");
      const body = (await res.json()) as {
        trending?: TrendingToken[];
        error?: string;
      };
      if (body.error) {
        setTrendingError(true);
        setTrending([]);
      } else {
        setTrending(body.trending ?? []);
      }
    } catch {
      setTrendingError(true);
      setTrending([]);
    }
  }, []);

  useEffect(() => {
    void loadTrending();
  }, [loadTrending]);

  // Refresh the glass every 45s so it reads live.
  useEffect(() => {
    const t = setInterval(() => void loadTrending(), 45_000);
    return () => clearInterval(t);
  }, [loadTrending]);

  const filtered = useMemo(() => {
    if (!trending) return trending;
    if (!chainFilter) return trending;
    return trending.filter((t) => t.network === chainFilter);
  }, [trending, chainFilter]);

  useEffect(() => {
    setShown(PAGE);
  }, [chainFilter]);

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>
      <div className="flex items-center gap-2.5">
        <h1 className="font-display text-xl font-semibold text-bone">
          The Scrying Glass
        </h1>
        <span className="inline-flex items-center rounded-full border border-gold/40 bg-panel-warm/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          Beta
        </span>
      </div>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Market watch
      </p>
      <p className="mt-3 text-sm text-bone-mut">
        Live EVM coins across every chain, ranked by real volume. Tap any coin to
        read it, see its chart and trade in-app, non-custodially.
      </p>

      <Link
        href="/swap"
        className="btn-glass mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-gold"
      >
        <Icon name="repost" className="h-3.5 w-3.5" />
        Open The Swap
        <Icon name="arrow" className="h-3.5 w-3.5" />
      </Link>

      {/* Chain filter chips */}
      <div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => setChainFilter(null)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            chainFilter === null
              ? "border-gold/60 bg-panel-warm text-gold-bright"
              : "border-steel-line bg-void text-bone-mut hover:border-gold/40"
          }`}
        >
          All
        </button>
        {TRADE_CHAINS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChainFilter(c.gecko)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              chainFilter === c.gecko
                ? "border-gold/60 bg-panel-warm text-gold-bright"
                : "border-steel-line bg-void text-bone-mut hover:border-gold/40"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {trending === null ? (
          [0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass glass-sm h-16 animate-pulse" />
          ))
        ) : trendingError ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            The glass clouded over and no coins could be read.
            <button
              type="button"
              onClick={() => void loadTrending()}
              className="mt-3 block w-full text-gold underline"
            >
              Look again
            </button>
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            No coins on this chain right now. Try another.
          </div>
        ) : (
          <>
            {filtered.slice(0, shown).map((t, i) => {
              const up = (t.change24h ?? 0) >= 0;
              const cap = t.marketCap ?? t.fdv;
              return (
                <div
                  key={`${t.network}-${t.address}-${i}`}
                  className="glass glass-sm flex items-center gap-3 px-3.5 py-3"
                >
                  <span className="tnum w-6 shrink-0 text-center text-xs text-bone-faint">
                    {i + 1}
                  </span>
                  <TokenLogo src={t.logo} symbol={t.symbol} size={36} />
                  <Link
                    href={coinHref(t)}
                    aria-label={`Open ${t.symbol} coin page`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-bone">
                          {t.symbol}
                        </p>
                        {t.watchChain && (
                          <WatchBadge
                            address={t.address}
                            chain={t.watchChain}
                            linkToWatch={false}
                          />
                        )}
                      </div>
                      <p className="truncate text-[11px] text-bone-faint">
                        {t.chain}
                        {cap ? (
                          <span className="ml-1.5 tnum">
                            MC {formatUsd(cap)}
                          </span>
                        ) : t.volume24h !== null ? (
                          <span className="ml-1.5 tnum">
                            Vol {formatUsd(t.volume24h)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tnum text-sm text-bone">
                        {formatPrice(t.priceUsd)}
                      </p>
                      {t.change24h !== null && (
                        <p
                          className={`tnum text-[11px] font-medium ${up ? "text-gold-bright" : "text-ember-deep"}`}
                        >
                          {up ? "+" : ""}
                          {t.change24h.toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </Link>
                  <WatchStar id={t.address} symbol={t.symbol} className="shrink-0" />
                </div>
              );
            })}
            {filtered.length > shown && (
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE)}
                className="btn-glass mt-1 w-full py-2.5 text-sm text-bone-mut"
              >
                Show more coins
              </button>
            )}
            <p className="mt-1 text-center text-[11px] text-bone-faint">
              {filtered.length} coins live. Market data via GeckoTerminal,
              refreshed every 45 seconds.
            </p>
          </>
        )}
      </div>

      <RealmTrades />
    </div>
  );
}
