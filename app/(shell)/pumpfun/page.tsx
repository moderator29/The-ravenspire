"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { InteractiveChart, type ChartPoint } from "@/components/coin/interactive-chart";
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
 * this page shows the real chart, the real price and the real stats, and the
 * one action is a link out to Pump.fun's own page, where the member's own
 * wallet signs the trade.
 *
 * REAL DATA, the same GeckoTerminal-backed /api/coin route every other coin
 * page reads, keyed to the Solana network so it works the same way it
 * already does for any other non-EVM coin the Scrying Glass can show
 * (evmChainId null, in-app TradePanel never mounts, exactly this page's
 * shape without the panel at all).
 *
 * FAILS CLOSED with lib/pumpfun.ts: with no real mint configured yet, this
 * renders an honest "not live yet" state rather than reaching for the trade
 * panel's `notfound` styling, which would read as "we launched and then
 * vanished" instead of "we have not launched yet".
 */

const CHART_TIMEFRAMES = ["1H", "4H", "1D", "1W"] as const;
type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number];
const DEFAULT_TIMEFRAME: ChartTimeframe = "1D";

interface CoinData {
  address: string;
  symbol: string;
  name: string;
  chainLabel: string | null;
  logo: string | null;
  priceUsd: number | null;
  change24h: number | null;
  change: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  volume24h: number | null;
  txns24h: { buys: number; sells: number } | null;
  liquidityUsd: number | null;
  marketCap: number | null;
  marketCapIsFdv: boolean;
  fdv: number | null;
  chart: { source: "geckoterminal"; timeframe: ChartTimeframe; points: ChartPoint[] } | null;
  pairCreatedAt: number | null;
  fetchedAt: number;
}

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
    <div className="flex flex-col gap-0.5 rounded-md border border-steel-line bg-panel/40 px-3 py-2.5">
      <span className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </span>
      <span className="tnum text-sm font-semibold text-bone">{value}</span>
    </div>
  );
}

export default function PumpfunPage() {
  const ca = useMemo(() => pumpfunContractAddress(), []);
  const buyUrl = useMemo(() => pumpfunUrl(), []);

  const [coin, setCoin] = useState<CoinData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(DEFAULT_TIMEFRAME);

  const tfRef = useRef(timeframe);
  useEffect(() => {
    tfRef.current = timeframe;
  }, [timeframe]);

  useEffect(() => {
    if (!ca) return;
    let alive = true;
    setStatus("loading");
    const qs = new URLSearchParams({ address: ca, net: "solana", tf: tfRef.current });
    fetch(`/api/coin?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { coin?: CoinData } | null) => {
        if (!alive) return;
        if (body?.coin) {
          setCoin(body.coin);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [ca]);

  /* Live poll every 30s, same cadence as the coin dossier, so price and chart
     stay fresh without ever flashing back to the loading skeleton. */
  useEffect(() => {
    if (status !== "ready" || !ca) return;
    let alive = true;
    const tick = () => {
      const qs = new URLSearchParams({ address: ca, net: "solana", tf: tfRef.current });
      fetch(`/api/coin?${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { coin?: CoinData } | null) => {
          if (alive && body?.coin) setCoin(body.coin);
        })
        .catch(() => {});
    };
    const t = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [status, ca]);

  const mountedTf = useRef(false);
  useEffect(() => {
    if (!mountedTf.current) {
      mountedTf.current = true;
      return;
    }
    if (status !== "ready" || !ca) return;
    let alive = true;
    const qs = new URLSearchParams({ address: ca, net: "solana", tf: timeframe });
    fetch(`/api/coin?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { coin?: CoinData } | null) => {
        if (alive && body?.coin) setCoin(body.coin);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

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

  const up = (coin?.change24h ?? 0) >= 0;

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
            {coin?.symbol ?? "$RSP"} on Pump.fun
          </span>
        }
        kicker="View only. Wallet to wallet on Pump.fun, non-custodial."
        backHref="/home"
      />

      <ConsoleStack className="mt-4">
        {status === "error" && (
          <Card pad="lg">
            <EmptyState
              icon="alert"
              title="Could not read the chain"
              body="The chart and price could not be read right now. Try again shortly."
            />
          </Card>
        )}

        {(showSkeleton || !coin) && status !== "error" ? (
          <Card pad="lg" className="flex flex-col gap-4">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-48 w-full" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </Card>
        ) : coin && status === "ready" ? (
          <>
            <Card pad="lg" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="tnum font-display text-3xl font-semibold text-bone sm:text-4xl">
                    {coin.priceUsd !== null ? formatPrice(coin.priceUsd) : "n/a"}
                  </p>
                  <p className="mt-1 text-sm">
                    <ChangeText value={coin.change24h} />
                    <span className="ml-1.5 text-bone-faint">24h</span>
                  </p>
                </div>
                <Badge variant="gold">Live on Pump.fun</Badge>
              </div>

              <SegmentedControl
                size="sm"
                value={timeframe}
                onValueChange={(v) => setTimeframe(v as ChartTimeframe)}
                items={CHART_TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
              />

              {coin.chart && coin.chart.points.length >= 2 ? (
                <InteractiveChart points={coin.chart.points} up={up} height={220} />
              ) : (
                <div className="flex h-[220px] items-center justify-center text-xs text-bone-faint">
                  Not enough chart data yet.
                </div>
              )}
            </Card>

            <Card pad="lg" className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bone-faint">
                The stats
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat
                  label={coin.marketCapIsFdv ? "FDV" : "Market cap"}
                  value={coin.marketCap !== null ? formatUsd(coin.marketCap) : "n/a"}
                />
                <Stat
                  label="Liquidity"
                  value={coin.liquidityUsd !== null ? formatUsd(coin.liquidityUsd) : "n/a"}
                />
                <Stat
                  label="Volume (24h)"
                  value={coin.volume24h !== null ? formatUsd(coin.volume24h) : "n/a"}
                />
                <Stat
                  label="Txns (24h)"
                  value={
                    coin.txns24h
                      ? `${coin.txns24h.buys + coin.txns24h.sells}`
                      : "n/a"
                  }
                />
              </div>
            </Card>

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
              This page only shows what is real on chain. The buy itself
              happens on Pump.fun, signed by your own wallet. The realm never
              takes custody.
            </p>
          </>
        ) : null}
      </ConsoleStack>
    </ConsolePage>
  );
}
