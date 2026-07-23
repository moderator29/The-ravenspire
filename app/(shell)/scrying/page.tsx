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

interface ScryCoin {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidityUsd: number;
  marketCap: number | null;
  fdv: number | null;
  chainId: number;
  chainName: string;
  chainShort: string;
  chainLogo: string | null;
  network: string;
  watchChain: string | null;
  logo: string | null;
  address: string;
  url: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  spark: number[] | null;
}

interface ScryResponse {
  heating?: ScryCoin[];
  trending?: ScryCoin[];
  top?: ScryCoin[];
  error?: string;
}

type Tab = "heating" | "trending" | "top";

const TABS: { key: Tab; label: string; blurb: string }[] = [
  { key: "heating", label: "Heating up", blurb: "Biggest 24h movers, live" },
  { key: "trending", label: "Trending", blurb: "What the market rotates into" },
  { key: "top", label: "Top volume", blurb: "Deepest active markets < $100M" },
];

function coinHref(t: ScryCoin): string {
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
  if (n > 0) return `$${n.toPrecision(2)}`;
  return "?";
}

const PAGE = 20;

/* A coin logo with the small chain mark tucked into its corner, so a member
   sees at a glance which chain the coin lives on. */
function CoinMark({ t }: { t: ScryCoin }) {
  return (
    <span className="relative inline-flex shrink-0">
      <TokenLogo src={t.logo} symbol={t.symbol} size={40} />
      {t.chainLogo && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border border-obsidian bg-obsidian">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={t.chainLogo}
            alt={t.chainName}
            width={16}
            height={16}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        </span>
      )}
    </span>
  );
}

function Socials({ t }: { t: ScryCoin }) {
  const links: { href: string; icon: string; label: string }[] = [];
  if (t.website) links.push({ href: t.website, icon: "compass", label: "Website" });
  if (t.twitter) links.push({ href: t.twitter, icon: "xlogo", label: "X" });
  if (t.telegram) links.push({ href: t.telegram, icon: "send", label: "Telegram" });
  if (links.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {links.map((l) => (
        <a
          key={l.icon}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${t.symbol} ${l.label}`}
          className="flex h-6 w-6 items-center justify-center rounded-full text-bone-faint transition hover:bg-panel hover:text-gold"
        >
          <Icon name={l.icon} className="h-3.5 w-3.5" />
        </a>
      ))}
    </div>
  );
}

/* A tiny real-trend spark drawn from the coin's reconstructed 24h price path.
   Green when it closes up over the window, ember when down. Pure SVG, no lib. */
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const w = 56;
  const h = 22;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / span) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = up ? "var(--gold-bright, #f0d68c)" : "#c65f4a";
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ScryingPage() {
  const [data, setData] = useState<ScryResponse | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("heating");
  const [chainFilter, setChainFilter] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch("/api/scrying");
      const body = (await res.json()) as ScryResponse;
      if (body.error) {
        setError(true);
        setData({ heating: [], trending: [], top: [] });
      } else {
        setData(body);
      }
    } catch {
      setError(true);
      setData({ heating: [], trending: [], top: [] });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh the glass every 60s so it reads live.
  useEffect(() => {
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    setShown(PAGE);
  }, [tab, chainFilter]);

  const coins = useMemo(() => {
    if (!data) return null;
    const list = data[tab] ?? [];
    return chainFilter === null
      ? list
      : list.filter((c) => c.chainId === chainFilter);
  }, [data, tab, chainFilter]);

  /* Only offer chain chips for chains that actually have coins in this tab. */
  const availableChains = useMemo(() => {
    if (!data) return [];
    const present = new Set((data[tab] ?? []).map((c) => c.chainId));
    return TRADE_CHAINS.filter((c) => present.has(c.id));
  }, [data, tab]);

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
        Live altcoin discovery
      </p>
      <p className="mt-3 text-sm text-bone-mut">
        Active, tradable EVM coins under $100M market cap — no stablecoins, no
        majors. Tap any coin to read it, chart it and swap it in-app,
        non-custodially.
      </p>

      <Link
        href="/swap"
        className="btn-glass mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-gold"
      >
        <Icon name="repost" className="h-3.5 w-3.5" />
        Open The Swap
        <Icon name="arrow" className="h-3.5 w-3.5" />
      </Link>

      {/* Category tabs */}
      <div
        role="tablist"
        aria-label="Discovery lenses"
        className="mt-4 grid grid-cols-3 gap-1.5 rounded-2xl border border-steel-line/70 bg-void/50 p-1"
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-2 py-2 text-center transition ${
                active
                  ? "bg-gold/15 text-gold-bright"
                  : "text-bone-mut hover:text-bone"
              }`}
            >
              <span className="block text-xs font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[11px] text-bone-faint">
        {TABS.find((t) => t.key === tab)?.blurb}
      </p>

      {/* Chain filter — only chains present in the current lens are shown. */}
      {availableChains.length > 1 && (
        <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setChainFilter(null)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              chainFilter === null
                ? "border-gold/60 bg-panel-warm text-gold-bright"
                : "border-steel-line bg-void text-bone-mut hover:border-gold/40"
            }`}
          >
            All chains
          </button>
          {availableChains.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChainFilter(c.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                chainFilter === c.id
                  ? "border-gold/60 bg-panel-warm text-gold-bright"
                  : "border-steel-line bg-void text-bone-mut hover:border-gold/40"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {coins === null ? (
          [0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass glass-sm h-16 animate-pulse" />
          ))
        ) : error ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            The glass clouded over and no coins could be read.
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 block w-full text-gold underline"
            >
              Look again
            </button>
          </div>
        ) : coins.length === 0 ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            The glass is quiet here right now. Try another lens.
          </div>
        ) : (
          <>
            {coins.slice(0, shown).map((t, i) => {
              const up = (t.change24h ?? 0) >= 0;
              const cap = t.marketCap ?? t.fdv;
              return (
                <div
                  key={`${t.chainId}-${t.address}-${i}`}
                  className="glass glass-sm flex items-center gap-3 px-3.5 py-3"
                >
                  <span className="tnum w-5 shrink-0 text-center text-xs text-bone-faint">
                    {i + 1}
                  </span>
                  <CoinMark t={t} />
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
                        <span className="shrink-0 rounded-full border border-steel-line/70 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-bone-faint">
                          {t.chainShort}
                        </span>
                        {t.watchChain && (
                          <WatchBadge
                            address={t.address}
                            chain={t.watchChain}
                            linkToWatch={false}
                          />
                        )}
                      </div>
                      <p className="truncate text-[11px] text-bone-faint">
                        {cap ? (
                          <span className="tnum">MC {formatUsd(cap)}</span>
                        ) : null}
                        {t.volume24h ? (
                          <span className="ml-1.5 tnum">
                            Vol {formatUsd(t.volume24h)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {t.spark && t.spark.length > 1 && (
                      <Sparkline points={t.spark} up={up} />
                    )}
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
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <WatchStar id={t.address} symbol={t.symbol} />
                    <Socials t={t} />
                  </div>
                </div>
              );
            })}
            {coins.length > shown && (
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE)}
                className="btn-glass mt-1 w-full py-2.5 text-sm text-bone-mut"
              >
                Show more coins
              </button>
            )}
            <p className="mt-1 text-center text-[11px] text-bone-faint">
              {coins.length} coins live. Market data via GeckoTerminal &amp;
              DexScreener, refreshed every 60 seconds.
            </p>
          </>
        )}
      </div>

      <RealmTrades />
    </div>
  );
}
