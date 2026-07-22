"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { WatchBadge } from "@/components/tools/watch-badge";
import { BackButton } from "@/components/shell/back-button";
import { TokenLogo } from "@/components/coin/token-logo";
import { WatchStar } from "@/components/coin/watch-star";

interface TrendingToken {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidityUsd: number;
  chain: string;
  watchChain: string | null;
  network: string;
  logo: string | null;
  address: string;
  url: string;
}

/* The in-app coin page for a trending row, carrying the GeckoTerminal network
   and ticker so the page can resolve real market data and history. */
function coinHref(t: TrendingToken): string {
  const qs = new URLSearchParams();
  if (t.network) qs.set("net", t.network);
  if (t.symbol && t.symbol !== "?") qs.set("sym", t.symbol);
  const suffix = qs.toString();
  return `/coin/${encodeURIComponent(t.address)}${suffix ? `?${suffix}` : ""}`;
}

interface WalletHolding {
  symbol: string;
  quoteUsd: number;
}

interface SmartWalletView {
  name: string;
  house: string;
  address: string;
  note: string | null;
  totalUsd: number | null;
  top: WalletHolding[];
}

interface WalletsResponse {
  configured?: boolean;
  wallets?: SmartWalletView[];
}

const FOLLOW_KEY = "ravenspire.scrying.follows";

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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

export default function ScryingPage() {
  const [trending, setTrending] = useState<TrendingToken[] | null>(null);
  const [trendingError, setTrendingError] = useState(false);
  const [wallets, setWallets] = useState<SmartWalletView[] | null>(null);
  const [walletsConfigured, setWalletsConfigured] = useState(true);
  const [follows, setFollows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FOLLOW_KEY);
      if (raw) setFollows(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/scrying?wallets=1");
        const body = (await res.json()) as WalletsResponse;
        if (!cancelled) {
          setWallets(body.wallets ?? []);
          setWalletsConfigured(body.configured ?? false);
        }
      } catch {
        if (!cancelled) {
          setWallets([]);
          setWalletsConfigured(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleFollow(address: string) {
    setFollows((prev) => {
      const next = { ...prev, [address]: !prev[address] };
      if (!next[address]) delete next[address];
      try {
        window.localStorage.setItem(FOLLOW_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="font-display text-xl font-semibold text-bone">
        The Scrying Glass
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Market watch
      </p>
      <p className="mt-3 text-sm text-bone-mut">
        Pairs drawing real trading interest across the chains, ranked by the
        markets, not by who paid for a boost.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {trending === null ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="glass glass-sm h-16 animate-pulse" />
          ))
        ) : trendingError ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            The glass clouded over and no trends could be read.
            <button
              type="button"
              onClick={() => void loadTrending()}
              className="mt-3 block w-full text-gold underline"
            >
              Look again
            </button>
          </div>
        ) : trending.length === 0 ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            The glass is still for the moment. No pairs are trending across the
            realm right now.
          </div>
        ) : (
          trending.map((t, i) => {
            const up = (t.change24h ?? 0) >= 0;
            return (
              <div
                key={`${t.address}-${i}`}
                className="glass glass-sm flex items-center gap-3 px-3.5 py-3"
              >
                <span className="tnum w-5 shrink-0 text-center text-sm text-bone-faint">
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
                      {t.volume24h !== null && (
                        <span className="ml-1.5 tnum">
                          Vol {formatUsd(t.volume24h)}
                        </span>
                      )}
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
          })
        )}
      </div>

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <Icon name="eye" className="h-5 w-5 shrink-0 text-gold" />
          <h2 className="font-display text-lg font-semibold text-bone">
            Great wallets of the realm
          </h2>
        </div>
        <p className="mt-2 text-sm text-bone-mut">
          Storied treasuries and market makers, watched through the glass.
        </p>

        {!walletsConfigured && wallets !== null && (
          <div className="glass-warm mt-3 flex items-start gap-3 p-4">
            <Icon
              name="lock"
              className="mt-0.5 h-4 w-4 shrink-0 text-bone-faint"
            />
            <p className="text-xs text-bone-mut">
              The GoldRush lens is not configured, so live wallet values cannot
              be read. The wallets below are shown by label only. Add a
              GoldRush key to reveal their holdings.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {wallets === null ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="glass glass-sm h-20 animate-pulse" />
            ))
          ) : wallets.length === 0 ? (
            <div className="glass p-6 text-center text-sm text-bone-mut">
              No wallets could be read from the glass right now.
            </div>
          ) : (
            wallets.map((w) => {
              const followed = Boolean(follows[w.address]);
              return (
                <div key={w.address} className="glass glass-sm p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-bone">
                        {w.name}
                      </p>
                      <p className="tnum mt-0.5 truncate text-[11px] text-bone-faint">
                        {w.house} · {shortAddress(w.address)}
                      </p>
                    </div>
                    {w.totalUsd !== null ? (
                      <span className="tnum shrink-0 gold-text text-sm font-semibold">
                        {formatUsd(w.totalUsd)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-bone-faint">
                        {w.note ?? "tracked"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleFollow(w.address)}
                      aria-pressed={followed}
                      aria-label={
                        followed
                          ? `Unfollow ${w.name}`
                          : `Follow ${w.name}`
                      }
                      className={
                        followed
                          ? "btn-glass shrink-0 rounded-full px-3 py-1.5 text-[11px] text-gold"
                          : "btn-glass shrink-0 rounded-full px-3 py-1.5 text-[11px] text-bone-mut"
                      }
                    >
                      {followed ? "Following" : "Follow"}
                    </button>
                  </div>

                  {w.top.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {w.top.map((h) => (
                        <Link
                          key={h.symbol}
                          href={`/coin/${encodeURIComponent(h.symbol)}?sym=${encodeURIComponent(h.symbol)}`}
                          aria-label={`Open ${h.symbol} coin page`}
                          className="glass-sm rounded-full px-2 py-0.5 text-[11px] text-bone-mut transition-colors hover:text-bone"
                        >
                          <span className="text-bone">{h.symbol}</span>
                          <span className="tnum ml-1 text-bone-faint">
                            {formatUsd(h.quoteUsd)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {wallets !== null && wallets.length > 0 && (
          <p className="mt-3 text-[11px] text-bone-faint">
            Following is a personal watch mark, kept on this device. Mirroring
            their moves into your own feed arrives in a later season.
          </p>
        )}
      </section>
    </div>
  );
}
