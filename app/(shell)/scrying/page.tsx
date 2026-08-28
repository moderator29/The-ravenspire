"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/cx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/tabs";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  Chip,
  ChipRail,
  ConsoleHeader,
  ConsolePage,
  ConsoleToolbar,
  CONSOLE_META,
} from "@/components/console/console-shell";
import { WatchBadge } from "@/components/tools/watch-badge";
import { TokenLogo } from "@/components/coin/token-logo";
import { WatchStar } from "@/components/coin/watch-star";
import { RealmTrades } from "@/components/trade/realm-trades";
import { TRADE_CHAINS } from "@/lib/trade/config";
import { realmFetch } from "@/lib/auth/api";
import { withDeadline } from "@/lib/deadline";

/* The Scrying Glass: a Console. The lens switcher and the chain filter sit on
   one toolbar rail that collapses into a Sheet below md, and the coin roll is
   a compact board above md. Zero ornament, gold for up and ember for down. */

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
      <TokenLogo src={t.logo} symbol={t.symbol} size={32} />
      {t.chainLogo && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center overflow-hidden rounded-[var(--radius-full)] border border-obsidian bg-obsidian">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={t.chainLogo}
            alt={t.chainName}
            width={14}
            height={14}
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
    <div className="flex items-center gap-0.5">
      {links.map((l) => (
        <a
          key={l.icon}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${t.symbol} ${l.label}`}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-bone-faint transition-colors duration-fast hover:bg-panel hover:text-gold"
        >
          <Icon name={l.icon} className="h-3.5 w-3.5" />
        </a>
      ))}
    </div>
  );
}

/* A tiny real-trend spark drawn from the coin's reconstructed 24h price path.
   Gold when it closes up over the window, ember when down: the chart direction
   tokens, never green. Pure SVG, no lib. */
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const w = 56;
  const h = 20;
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
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="hidden shrink-0 sm:block"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={up ? "var(--chart-up)" : "var(--chart-down)"}
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
      /* Carries the member's token when there is one, so a signed-in reader is
         metered on their account rather than sharing an address bucket with
         everyone behind the same network.

         The deadline is what makes the catch below reachable. A rejected read
         already fell to "The glass clouded over", but a read that never
         answers is not a rejection, and measured against one this page held
         thirty-six pulsing bars at thirty seconds. */
      const res = await withDeadline(realmFetch<ScryResponse>("/api/scrying"));
      const body = res.data ?? { heating: [], trending: [], top: [] };
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

  const showSkeleton = useDelayedLoading(coins === null, 300);
  const lens = TABS.find((t) => t.key === tab);
  const chainSummary =
    chainFilter === null
      ? "All chains"
      : (TRADE_CHAINS.find((c) => c.id === chainFilter)?.name ?? "All chains");

  return (
    <ConsolePage width="data">
      <ConsoleHeader
        title="The Scrying Glass"
        kicker="Live altcoin discovery"
        /* Cold entry falls back to the Crossroads: the glass is a discovery
           surface, and discovery is what the Crossroads is for. */
        backHref="/explore"
        badge={<Badge variant="beta">Beta</Badge>}
        actions={
          <Button
            size="sm"
            render={
              <Link href="/swap">
                <Icon name="repost" className="h-3.5 w-3.5 text-gold" />
                Open The Swap
              </Link>
            }
          />
        }
      />

      <p className="mt-3 text-sm text-bone-mut md:mt-2 md:text-[13px]">
        Active, tradable EVM coins under $100M market cap, no stablecoins, no
        majors. Tap any coin to read it, chart it and swap it in-app,
        non-custodially.
      </p>

      {/* The lens switcher and the chain filter, on one rail. Three exclusive
          views of the same data is a Segmented control; a growing set of chain
          filters is a chip rail. */}
      <div className="mt-3 flex flex-col gap-2 md:mt-2">
        <ConsoleToolbar
          label="Lens and chain"
          summary={`${lens?.label} · ${chainSummary}`}
          className="md:justify-between"
        >
          <SegmentedControl
            label="Discovery lens"
            size="sm"
            items={TABS.map((t) => ({ value: t.key, label: t.label }))}
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            className="w-full md:w-auto"
            block
          />
          {availableChains.length > 1 && (
            <ChipRail label="Chain filter">
              <Chip
                active={chainFilter === null}
                onClick={() => setChainFilter(null)}
              >
                All chains
              </Chip>
              {availableChains.map((c) => (
                <Chip
                  key={c.id}
                  active={chainFilter === c.id}
                  onClick={() => setChainFilter(c.id)}
                >
                  {c.name}
                </Chip>
              ))}
            </ChipRail>
          )}
        </ConsoleToolbar>
        <p className={cx("text-bone-faint", CONSOLE_META)}>{lens?.blurb}</p>
      </div>

      <div className="mt-3 flex flex-col gap-2 md:mt-2 md:gap-1">
        {coins === null ? (
          showSkeleton ? (
            <CoinRowSkeleton />
          ) : null
        ) : error ? (
          <Card pad="none">
            <EmptyState
              icon="eye"
              size="sm"
              title="The glass clouded over"
              body="No coins could be read just now."
              action={
                <Button size="sm" onClick={() => void load()}>
                  Look again
                </Button>
              }
            />
          </Card>
        ) : coins.length === 0 ? (
          <Card pad="none">
            <EmptyState
              icon="search"
              size="sm"
              title="Quiet in this lens"
              body="Nothing is moving here right now. Try another lens or another chain."
            />
          </Card>
        ) : (
          <>
            {coins.slice(0, shown).map((t, i) => {
              const up = (t.change24h ?? 0) >= 0;
              const cap = t.marketCap ?? t.fdv;
              return (
                <Card radius="lg"
                  key={`${t.chainId}-${t.address}-${i}`}
                  pad="none"
                  className="flex min-h-11 items-center gap-2.5 px-3 py-2.5 md:min-h-9 md:py-1.5"
                >
                  <span className="tnum w-5 shrink-0 text-center text-[11px] text-bone-faint">
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
                        <p className="truncate text-sm font-semibold text-bone md:text-[13px]">
                          {t.symbol}
                        </p>
                        <span className="shrink-0 rounded-sm border border-steel-line/70 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-bone-faint">
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
                          <span className="tnum ml-1.5">
                            Vol {formatUsd(t.volume24h)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {t.spark && t.spark.length > 1 && (
                      <Sparkline points={t.spark} up={up} />
                    )}
                    <div className="shrink-0 text-right">
                      <p className="tnum text-sm text-bone md:text-[13px]">
                        {formatPrice(t.priceUsd)}
                      </p>
                      {t.change24h !== null && (
                        <p
                          className="tnum text-[11px] font-medium"
                          style={{
                            color: up
                              ? "var(--chart-up)"
                              : "var(--chart-down)",
                          }}
                        >
                          {up ? "+" : ""}
                          {t.change24h.toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <WatchStar id={t.address} symbol={t.symbol} />
                    <Socials t={t} />
                  </div>
                </Card>
              );
            })}
            {coins.length > shown && (
              <Button
                block
                size="md"
                className="mt-1"
                onClick={() => setShown((s) => s + PAGE)}
              >
                Show more coins
              </Button>
            )}
            <p className={cx("mt-1 text-center text-bone-faint", CONSOLE_META)}>
              <span className="tnum">{coins.length}</span> coins live. Market
              data via GeckoTerminal and DexScreener, refreshed every 60 seconds.
            </p>
          </>
        )}
      </div>

      <RealmTrades />
    </ConsolePage>
  );
}

/* Shaped like the coin rows it stands in for. */
function CoinRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 md:gap-1">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex min-h-11 items-center gap-2.5 rounded-lg border border-gold/16 bg-void/60 px-3 py-2.5 md:min-h-9 md:py-1.5"
        >
          <Skeleton radius="sm" className="h-2 w-3 shrink-0" />
          <Skeleton radius="full" className="h-8 w-8 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton radius="sm" className="h-2.5 w-20" />
            <Skeleton radius="sm" className="h-2 w-32" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Skeleton radius="sm" className="h-2.5 w-14" />
            <Skeleton radius="sm" className="h-2 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}
