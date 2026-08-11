"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/cx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/tabs";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  ConsolePage,
  CONSOLE_META,
  CONSOLE_PAD,
} from "@/components/console/console-shell";
import { BackButton } from "@/components/shell/back-button";
import { WatchBadge } from "@/components/tools/watch-badge";
import { TokenLogo } from "@/components/coin/token-logo";
import { WatchStar } from "@/components/coin/watch-star";
import { type ChartPoint } from "@/components/coin/price-chart";
import { InteractiveChart } from "@/components/coin/interactive-chart";
import { TradePanel } from "@/components/trade/trade-panel";
import { RavenTake } from "@/components/trade/raven-take";
import { TokenSafety } from "@/components/trade/token-safety";
import { shareOrCopy } from "@/lib/share";

interface CoinData {
  address: string;
  symbol: string;
  name: string;
  chainId: string | null;
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
  dexId: string | null;
  dexUrl: string | null;
  explorerUrl: string | null;
  chart: { source: "geckoterminal"; points: ChartPoint[] } | null;
  evmChainId: number | null;
  decimals: number | null;
  pairCreatedAt: number | null;
  fetchedAt: number;
}

/* GoldRush watch-network id from the DexScreener chainId, so the defenses
   badge can scan the right chain. Null where The Watch has no coverage. */
const WATCH_CHAIN: Record<string, string> = {
  ethereum: "1",
  base: "8453",
  arbitrum: "42161",
  optimism: "10",
  bsc: "56",
};

function formatUsd(value: number): string {
  if (value >= 1_000_000_000)
    return `$${(value / 1_000_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}B`;
  if (value >= 1_000_000)
    return `$${(value / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (value >= 1_000)
    return `$${(value / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatPrice(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "Price unknown";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

/* Direction reads from the chart tokens, so up and down are the same two hues
   everywhere in the product. Gold up, ember down, never green. */
function ChangeText({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value))
    return <span className="text-bone-faint">n/a</span>;
  const up = value >= 0;
  return (
    <span
      style={{ color: up ? "var(--chart-up)" : "var(--chart-down)" }}
    >
      {up ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export default function CoinPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const searchParams = useSearchParams();
  const net = searchParams.get("net");
  const sym = searchParams.get("sym");

  const [coin, setCoin] = useState<CoinData | null>(null);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [chartMode, setChartMode] = useState<"line" | "candle">("line");
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">(
    "loading"
  );

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setCoin(null);
    const qs = new URLSearchParams();
    qs.set("address", address);
    if (net) qs.set("net", net);
    if (sym) qs.set("symbol", sym);
    fetch(`/api/coin?${qs.toString()}`)
      .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json() }))
      .then(({ status: code, body }) => {
        if (!alive) return;
        const data = (body as { coin?: CoinData }).coin;
        if (data) {
          setCoin(data);
          setStatus("ready");
        } else if (code === 404) {
          setStatus("notfound");
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
  }, [address, net, sym]);

  /* Keep the coin live: silently re-fetch every 30s and swap in the fresh data
     WITHOUT touching status, so price, stats and the chart update in real time
     with no loading flash. Only runs once a first load has succeeded. */
  useEffect(() => {
    if (status !== "ready") return;
    const qs = new URLSearchParams();
    qs.set("address", address);
    if (net) qs.set("net", net);
    if (sym) qs.set("symbol", sym);
    let alive = true;
    const tick = () => {
      fetch(`/api/coin?${qs.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (!alive || !body) return;
          const data = (body as { coin?: CoinData }).coin;
          if (data) setCoin(data);
        })
        .catch(() => {});
    };
    const t = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [status, address, net, sym]);

  const chart = useMemo<{ points: ChartPoint[]; implied: boolean } | null>(() => {
    if (!coin) return null;
    if (coin.chart && coin.chart.points.length >= 2) {
      return { points: coin.chart.points, implied: false };
    }
    // Honest fallback: reconstruct where the price sat 24h ago from the 24h
    // change, and draw a straight implied line clearly labelled as such.
    if (coin.priceUsd !== null && coin.change24h !== null) {
      const now = coin.fetchedAt;
      const past = coin.priceUsd / (1 + coin.change24h / 100);
      if (Number.isFinite(past) && past > 0) {
        return {
          points: [
            { t: now - 24 * 3600 * 1000, c: past },
            { t: now, c: coin.priceUsd },
          ],
          implied: true,
        };
      }
    }
    return null;
  }, [coin]);

  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const up = (coin?.change24h ?? 0) >= 0;
  const watchChain = coin?.chainId ? WATCH_CHAIN[coin.chainId] : undefined;

  // Pool age from the server's fetch time (a pure value), not Date.now() during
  // render. Used by the risk read and the Raven's take.
  const ageDays =
    coin?.pairCreatedAt != null
      ? Math.max(
          0,
          Math.floor((coin.fetchedAt - coin.pairCreatedAt) / 86_400_000)
        )
      : null;

  const showSkeleton = useDelayedLoading(status === "loading", 300);

  return (
    <ConsolePage width="data">
      <div className="mb-4 md:mb-3">
        <BackButton href="/scrying" />
      </div>

      {status === "loading" && showSkeleton && <CoinSkeleton />}

      {status === "notfound" && (
        <Card pad="none">
          <EmptyState
            icon="search"
            size="sm"
            title="No market found"
            body="The glass could not find a trustworthy market for this token. It may be too thinly traded to read, or the address is not one the markets recognise."
          />
        </Card>
      )}

      {status === "error" && (
        <Card pad="none">
          <EmptyState
            icon="alert"
            size="sm"
            title="The glass clouded over"
            body="This coin could not be read right now."
          />
        </Card>
      )}

      {status === "ready" && coin && (
        <>
          {/* Identity. The hero band stays comfortable: it is the Dossier half
              of this page, and the panels below it are the Console half. */}
          <Card className="flex items-center gap-3">
            <TokenLogo src={coin.logo} symbol={coin.symbol} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-xl font-semibold text-bone">
                  {coin.symbol}
                </h1>
                {watchChain && (
                  <WatchBadge address={coin.address} chain={watchChain} />
                )}
              </div>
              <p className="truncate text-xs text-bone-mut">{coin.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {coin.chainLabel && (
                  <span className="inline-block rounded-sm border border-steel-line px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                    {coin.chainLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void shareOrCopy(coin.address).then(() => {
                      setCopiedAddr(true);
                      window.setTimeout(() => setCopiedAddr(false), 1600);
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded-sm border border-steel-line px-2 py-0.5 text-[10px] font-medium text-bone-faint transition-colors duration-fast hover:border-gold/40 hover:text-gold"
                >
                  <Icon name={copiedAddr ? "shield" : "share"} className="h-3 w-3" />
                  {copiedAddr
                    ? "Copied"
                    : `${coin.address.slice(0, 6)}...${coin.address.slice(-4)}`}
                </button>
              </div>
            </div>
            <WatchStar id={coin.address} symbol={coin.symbol} />
          </Card>

          {/* Price + chart */}
          <Card pad="none" className={cx("mt-3 md:mt-2", CONSOLE_PAD)}>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                  Price
                </p>
                <p className="tnum mt-1 font-display text-2xl font-semibold text-bone md:text-xl">
                  {formatPrice(scrub ? scrub.c : coin.priceUsd)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                  {scrub ? "At point" : "24h"}
                </p>
                <p className="tnum mt-1 text-lg font-semibold md:text-base">
                  <ChangeText
                    value={
                      scrub && chart && chart.points[0]?.c
                        ? ((scrub.c - chart.points[0].c) / chart.points[0].c) *
                          100
                        : coin.change24h
                    }
                  />
                </p>
              </div>
            </div>

            <div className="mt-3 md:mt-2">
              {chart ? (
                <>
                  {/* Line / candle toggle, candles only when real OHLC exists
                      (never on an implied line). Two exclusive views of the
                      same data, so a Segmented control rather than a capsule
                      track of hand rolled buttons. */}
                  {!chart.implied && chart.points.some((p) => p.o != null) && (
                    <div className="mb-2 flex justify-end">
                      <SegmentedControl
                        label="Chart style"
                        size="sm"
                        items={[
                          { value: "line", label: "Line" },
                          { value: "candle", label: "Candle" },
                        ]}
                        value={chartMode}
                        onValueChange={(v) =>
                          setChartMode(v as "line" | "candle")
                        }
                      />
                    </div>
                  )}
                  <InteractiveChart
                    points={chart.points}
                    up={up}
                    mode={chart.implied ? "line" : chartMode}
                    onScrub={setScrub}
                  />
                  <p className="mt-2 text-[11px] text-bone-faint">
                    {chart.implied
                      ? "Implied 24h line from current price and 24h change. Full price history is not available for this pair yet."
                      : `Recent price, hourly ${chartMode === "candle" ? "candles" : "closes"} from the deepest pool. Source: GeckoTerminal.`}
                  </p>
                </>
              ) : (
                <p className="py-6 text-center text-xs text-bone-faint">
                  No price history is available to chart for this token.
                </p>
              )}
            </div>

            {/* Timeframe changes */}
            <div className="mt-3 grid grid-cols-4 gap-2 border-t border-steel-line pt-3 md:mt-2 md:pt-2">
              {(
                [
                  ["5m", coin.change.m5],
                  ["1h", coin.change.h1],
                  ["6h", coin.change.h6],
                  ["24h", coin.change.h24],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="text-center">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                    {label}
                  </p>
                  <p className="tnum mt-0.5 text-xs font-medium">
                    <ChangeText value={value} />
                  </p>
                </div>
              ))}
            </div>
          </Card>

          {/* Transactions (24h): real buys vs sells */}
          {coin.txns24h &&
            coin.txns24h.buys + coin.txns24h.sells > 0 && (
              <TxnsBar buys={coin.txns24h.buys} sells={coin.txns24h.sells} />
            )}

          {/* Market data. Four figures side by side once there is room. */}
          <div className="mt-3 grid grid-cols-2 gap-2 md:mt-2 md:grid-cols-4 md:gap-1.5">
            <Stat
              label={coin.marketCapIsFdv ? "Market cap (FDV)" : "Market cap"}
              value={coin.marketCap !== null ? formatUsd(coin.marketCap) : "n/a"}
            />
            <Stat
              label="Liquidity"
              value={
                coin.liquidityUsd !== null ? formatUsd(coin.liquidityUsd) : "n/a"
              }
            />
            <Stat
              label="24h volume"
              value={coin.volume24h !== null ? formatUsd(coin.volume24h) : "n/a"}
            />
            <Stat
              label="Fully diluted"
              value={coin.fdv !== null ? formatUsd(coin.fdv) : "n/a"}
            />
          </div>

          {/* Risk banner: honest, real signals only. */}
          <RiskBanner liquidityUsd={coin.liquidityUsd} ageDays={ageDays} />

          {/* Real GoPlus token-security scan (honeypot, tax, blacklist, etc.). */}
          {coin.evmChainId !== null && (
            <TokenSafety chainId={coin.evmChainId} address={coin.address} />
          )}

          {/* The Raven's read on this coin (real AI over real figures). */}
          <RavenTake
            symbol={coin.symbol}
            address={coin.address}
            chainLabel={coin.chainLabel}
            priceUsd={coin.priceUsd}
            change24h={coin.change24h}
            marketCap={coin.marketCap}
            liquidityUsd={coin.liquidityUsd}
            volume24h={coin.volume24h}
            ageDays={ageDays}
          />

          {/* In-app, non-custodial trading (EVM only, BETA). */}
          {coin.evmChainId !== null ? (
            <TradePanel
              coin={{
                address: coin.address,
                symbol: coin.symbol,
                name: coin.name,
                evmChainId: coin.evmChainId,
                decimals: coin.decimals,
                priceUsd: coin.priceUsd,
                logo: coin.logo,
                chainLabel: coin.chainLabel,
                liquidityUsd: coin.liquidityUsd,
                pairCreatedAt: coin.pairCreatedAt,
              }}
            />
          ) : (
            <Card
              variant="warm"
              pad="none"
              className={cx("mt-3 flex items-start gap-2.5 md:mt-2", CONSOLE_PAD)}
            >
              <Icon
                name="shield"
                aria-hidden
                className="mt-0.5 h-4 w-4 shrink-0 text-bone-faint"
              />
              <p className={cx("text-bone-mut", CONSOLE_META)}>
                In-app trading is EVM only. This token is not on a chain the
                realm trades, so buy and sell are not offered here.
              </p>
            </Card>
          )}

          {/* Secondary external actions */}
          <div className="mt-3 flex flex-wrap gap-2 md:mt-2">
            {coin.dexUrl && (
              <Button
                size="sm"
                render={
                  <a href={coin.dexUrl} target="_blank" rel="noopener noreferrer">
                    <Icon name="signal" className="h-3.5 w-3.5" />
                    {coin.dexId ? `View on ${coin.dexId}` : "View on DEX"}
                    <Icon name="arrow" className="h-3.5 w-3.5" />
                  </a>
                }
              />
            )}
            {coin.explorerUrl && (
              <Button
                size="sm"
                render={
                  <a
                    href={coin.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="search" className="h-3.5 w-3.5" />
                    Explorer
                    <Icon name="arrow" className="h-3.5 w-3.5" />
                  </a>
                }
              />
            )}
          </div>

          {/* Honest empty state */}
          <Card
            variant="warm"
            pad="none"
            className={cx("mt-3 flex items-start gap-2.5 md:mt-2", CONSOLE_PAD)}
          >
            <Icon
              name="scroll"
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 text-bone-faint"
            />
            <div>
              <p className={cx("font-medium text-bone-mut", CONSOLE_META)}>
                Holders and transaction history
              </p>
              <p className="mt-1 text-[11px] text-bone-faint">
                Per-holder distribution and a live trade tape are not cheaply
                available from the keyless market lens, so we do not guess at
                them. This section arrives when a dedicated on-chain feed is
                wired in. Until then, the address above opens the full ledger on
                the explorer.
              </p>
            </div>
          </Card>

          <p className="mt-3 text-center text-[10px] text-bone-faint md:mt-2">
            Market data via DexScreener. A watchlist star is kept on this device.
          </p>
        </>
      )}
    </ConsolePage>
  );
}

/* Shaped like the panels it stands in for: identity band, chart card, figures. */
function CoinSkeleton() {
  return (
    <div className="flex flex-col gap-3 md:gap-2">
      <div className="flex items-center gap-3 rounded-xl border border-gold/16 bg-void/60 p-4">
        <Skeleton radius="full" className="h-11 w-11 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton radius="sm" className="h-3.5 w-24" />
          <Skeleton radius="sm" className="h-2.5 w-40" />
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-gold/16 bg-void/60 p-4 md:p-3">
        <div className="flex items-end justify-between">
          <Skeleton radius="sm" className="h-6 w-28" />
          <Skeleton radius="sm" className="h-5 w-16" />
        </div>
        <Skeleton radius="lg" className="h-32 w-full" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} radius="lg" className="h-14" />
        ))}
      </div>
    </div>
  );
}

/* Honest, real risk read. Every coin is flagged unverified (anyone can launch
   one). Where liquidity and age are known we surface concrete caution, never a
   fabricated "safety score". */
function RiskBanner({
  liquidityUsd,
  ageDays,
}: {
  liquidityUsd: number | null;
  ageDays: number | null;
}) {
  const thinLiquidity = liquidityUsd !== null && liquidityUsd < 50_000;
  const young = ageDays !== null && ageDays < 7;

  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-ember-deep/40 bg-panel p-4 md:mt-2 md:p-3">
      <Icon
        name="shield"
        aria-hidden
        className="mt-0.5 h-4 w-4 shrink-0 text-ember"
      />
      <div>
        <p className="text-xs font-semibold text-bone">
          Unverified coin. Trade with caution.
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-bone-mut">
          Anyone can launch a coin and name it anything. The Ravenspire does not
          endorse this token.
          {thinLiquidity
            ? " Liquidity here is thin, so the price can swing hard and selling may cost you."
            : ""}
          {young
            ? ` This pool is only about ${ageDays} day${ageDays === 1 ? "" : "s"} old, a common window for rugs.`
            : ""}{" "}
          Never trade more than you can lose.
        </p>
      </div>
    </div>
  );
}

/* Real 24h buys vs sells, a proportional bar on the chart direction tokens. */
function TxnsBar({ buys, sells }: { buys: number; sells: number }) {
  const total = buys + sells || 1;
  const buyPct = (buys / total) * 100;
  return (
    <Card pad="none" className={cx("mt-3 md:mt-2", CONSOLE_PAD)}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
        Transactions (24h)
      </p>
      <div className="mt-1.5 flex items-center justify-between text-sm font-semibold md:text-[13px]">
        <span className="tnum" style={{ color: "var(--chart-up)" }}>
          {buys.toLocaleString("en-US")} buys
        </span>
        <span className="tnum" style={{ color: "var(--chart-down)" }}>
          {sells.toLocaleString("en-US")} sells
        </span>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-sm bg-void">
        <div
          className="h-full"
          style={{ width: `${buyPct}%`, background: "var(--chart-up)" }}
        />
        <div
          className="h-full flex-1"
          style={{ background: "var(--chart-down)" }}
        />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card pad="none" className="rounded-lg p-3 md:p-2.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </p>
      <p className="tnum mt-1 text-sm font-semibold text-bone md:mt-0.5 md:text-[13px]">
        {value}
      </p>
    </Card>
  );
}
