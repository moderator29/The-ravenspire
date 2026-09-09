"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/tabs";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ConsolePage,
  ConsoleHeader,
  ConsoleStack,
} from "@/components/console/console-shell";
import { RavenMark } from "@/components/brand/raven-mark";
import { PumpfunMark } from "@/components/pumpfun/mark";
import { pumpfunContractAddress, pumpfunUrl } from "@/lib/pumpfun";

/* $RSP on Pump.fun: a view-only trading dossier for the realm's own coin.
 *
 * VIEW ONLY, DELIBERATELY. Pump.fun's own bonding curve and, later, its own
 * AMM pool are where a buy or sell actually executes; duplicating that here
 * would be a second, subtly different order path for the same coin, which is
 * exactly how two flows drift and one of them ends up promising a fill the
 * other cannot honour (rule 6's spirit, the same reasoning
 * app/(shell)/market/[id]/page.tsx already states for a Bazaar listing). So
 * this page shows the real chart and the real stats, and the one action is a
 * link out to Pump.fun's own page, where the member's own wallet signs the
 * trade.
 *
 * THE CHART IS A REAL EMBED, NOT A REDRAWN ONE. Two tabs, Pump.fun and
 * Dexscreener, each a plain iframe pointed at that platform's own public
 * page for this mint. Neither is reimplemented here: an embed is what it
 * says it is, the source's own live chart, rather than this realm's guess
 * at redrawing it from a data feed. Dexscreener documents its `?embed=1`
 * parameter publicly; Pump.fun does not document an embed API, so its tab
 * carries an honest fallback link for the case where its page declines to
 * be framed. Real data only in either case: no chart renders here that this
 * page invented.
 *
 * FAILS CLOSED with lib/pumpfun.ts: with no real mint configured yet, this
 * renders an honest "not live yet" state rather than reaching for the trade
 * panel's `notfound` styling, which would read as "we launched and then
 * vanished" instead of "we have not launched yet".
 */

interface CoinStats {
  symbol: string;
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
  marketCapIsFdv: boolean;
  liquidityUsd: number | null;
  txns24h: { buys: number; sells: number } | null;
}

type ChartSource = "pumpfun" | "dexscreener";

function formatUsd(value: number): string {
  if (value >= 1_000_000_000)
    return `$${(value / 1_000_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}B`;
  if (value >= 1_000_000)
    return `$${(value / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (value >= 1_000)
    return `$${(value / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatPrice(value: number): string {
  if (value >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (value >= 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toPrecision(3)}`;
}

function ChangeText({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value))
    return <span className="text-bone-faint">n/a</span>;
  const up = value >= 0;
  return (
    <span style={{ color: up ? "var(--chart-up)" : "var(--chart-down)" }}>
      {up ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card pad="sm" radius="md" className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </span>
      <span className="tnum text-sm font-semibold text-bone">{value}</span>
    </Card>
  );
}

export default function PumpfunPage() {
  const ca = useMemo(() => pumpfunContractAddress(), []);
  const buyUrl = useMemo(() => pumpfunUrl(), []);
  const dexscreenerUrl = useMemo(
    () => (ca ? `https://dexscreener.com/solana/${ca}` : null),
    [ca]
  );

  const [chartSource, setChartSource] = useState<ChartSource>("pumpfun");
  const [stats, setStats] = useState<CoinStats | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!ca) return;
    let alive = true;
    const load = () => {
      const qs = new URLSearchParams({ address: ca, net: "solana" });
      fetch(`/api/coin?${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { coin?: CoinStats } | null) => {
          if (!alive) return;
          if (body?.coin) {
            setStats(body.coin);
            setStatus("ready");
          } else {
            setStatus("error");
          }
        })
        .catch(() => {
          if (alive) setStatus("error");
        });
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ca]);

  const showSkeleton = useDelayedLoading(status === "loading", 300);

  if (!ca) {
    return (
      <ConsolePage width="data">
        <ConsoleHeader
          title="$RSP on Pump.fun"
          kicker="The realm's own listing"
          backHref="/home"
        />
        <Card pad="lg" className="mt-4">
          <EmptyState
            icon="coin"
            title="Not live yet"
            body="The realm has not launched on Pump.fun yet. Once it does, the real chart and price will appear here."
          />
        </Card>
      </ConsolePage>
    );
  }

  return (
    <ConsolePage width="data">
      <ConsoleHeader
        title={
          <span className="flex items-center gap-2">
            <RavenMark className="h-6 w-6" />
            <span aria-hidden className="text-bone-faint">
              ×
            </span>
            <PumpfunMark className="h-6 w-6" />
            {stats?.symbol ?? "$RSP"} on Pump.fun
          </span>
        }
        kicker="View only. Wallet to wallet on Pump.fun, non-custodial."
        backHref="/home"
      />

      <ConsoleStack className="mt-4">
        <Card pad="lg" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              {showSkeleton ? (
                <Skeleton className="h-9 w-32" />
              ) : (
                <p className="tnum font-display text-3xl font-semibold text-bone sm:text-4xl">
                  {stats?.priceUsd !== null && stats?.priceUsd !== undefined
                    ? formatPrice(stats.priceUsd)
                    : "n/a"}
                </p>
              )}
              <p className="mt-1 text-sm">
                <ChangeText value={stats?.change24h ?? null} />
                <span className="ml-1.5 text-bone-faint">24h</span>
              </p>
            </div>
            <Badge variant="gold">Live on Pump.fun</Badge>
          </div>

          <SegmentedControl
            size="sm"
            value={chartSource}
            onValueChange={(v) => setChartSource(v as ChartSource)}
            items={[
              { value: "pumpfun", label: "Pump.fun" },
              { value: "dexscreener", label: "Dexscreener" },
            ]}
          />

          {/* THE EMBED. A plain iframe onto the source's own live page, not a
              chart this realm redrew from a data feed. Pump.fun does not
              publish an embed API, so its tab carries the fallback link
              below for the case its page declines to be framed; Dexscreener
              documents `?embed=1` and is the reliable option of the two. */}
          <div className="overflow-hidden rounded-lg border border-steel-line bg-obsidian">
            {chartSource === "pumpfun" ? (
              <iframe
                key="pumpfun"
                src={`https://pump.fun/coin/${ca}`}
                title="$RSP on Pump.fun"
                className="h-[420px] w-full"
                sandbox="allow-scripts allow-same-origin allow-popups"
                loading="lazy"
              />
            ) : (
              <iframe
                key="dexscreener"
                src={`https://dexscreener.com/solana/${ca}?embed=1&theme=dark&trades=0&info=0`}
                title="$RSP on Dexscreener"
                className="h-[420px] w-full"
                sandbox="allow-scripts allow-same-origin allow-popups"
                loading="lazy"
              />
            )}
          </div>
          <p className="text-center text-[11px] text-bone-faint">
            Chart not loading?{" "}
            <a
              href={chartSource === "pumpfun" ? (buyUrl ?? "#") : (dexscreenerUrl ?? "#")}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gold underline decoration-gold/40 underline-offset-2 hover:text-gold-bright"
            >
              Open it directly on {chartSource === "pumpfun" ? "Pump.fun" : "Dexscreener"}
            </a>
            .
          </p>
        </Card>

        {status === "error" ? (
          <Card pad="lg">
            <EmptyState
              icon="alert"
              title="Could not read the chain"
              body="The stats could not be read right now. The chart above is unaffected."
            />
          </Card>
        ) : (
          <Card pad="lg" className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bone-faint">
              The stats
            </p>
            {showSkeleton ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat
                  label={stats?.marketCapIsFdv ? "FDV" : "Market cap"}
                  value={stats?.marketCap != null ? formatUsd(stats.marketCap) : "n/a"}
                />
                <Stat
                  label="Liquidity"
                  value={stats?.liquidityUsd != null ? formatUsd(stats.liquidityUsd) : "n/a"}
                />
                <Stat
                  label="Volume (24h)"
                  value={stats?.volume24h != null ? formatUsd(stats.volume24h) : "n/a"}
                />
                <Stat
                  label="Txns (24h)"
                  value={
                    stats?.txns24h
                      ? `${stats.txns24h.buys + stats.txns24h.sells}`
                      : "n/a"
                  }
                />
              </div>
            )}
          </Card>
        )}

        {buyUrl && (
          <Button
            variant="gold"
            size="lg"
            block
            render={<a href={buyUrl} target="_blank" rel="noopener noreferrer" />}
          >
            <Icon name="arrow" className="h-4 w-4" />
            Buy on Pump.fun
          </Button>
        )}
        <p className="text-center text-[11px] leading-relaxed text-bone-faint">
          This page only shows what is real on chain. The buy itself happens
          on Pump.fun, signed by your own wallet. The realm never takes
          custody.
        </p>
      </ConsoleStack>
    </ConsolePage>
  );
}
