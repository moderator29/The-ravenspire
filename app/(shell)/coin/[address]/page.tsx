"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { WatchBadge } from "@/components/tools/watch-badge";
import { TokenLogo } from "@/components/coin/token-logo";
import { WatchStar } from "@/components/coin/watch-star";
import { type ChartPoint } from "@/components/coin/price-chart";
import { InteractiveChart } from "@/components/coin/interactive-chart";
import { TradePanel } from "@/components/trade/trade-panel";
import { RavenTake } from "@/components/trade/raven-take";
import { TokenSafety } from "@/components/trade/token-safety";

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

function ChangeText({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value))
    return <span className="text-bone-faint">n/a</span>;
  const up = value >= 0;
  return (
    <span className={up ? "text-gold-bright" : "text-ember-deep"}>
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

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton href="/scrying" />
      </div>

      {status === "loading" && (
        <div className="flex flex-col gap-3">
          <div className="glass h-24 animate-pulse" />
          <div className="glass h-40 animate-pulse" />
          <div className="glass h-32 animate-pulse" />
        </div>
      )}

      {status === "notfound" && (
        <div className="glass p-8 text-center text-sm text-bone-mut">
          The glass could not find a trustworthy market for this token. It may
          be too thinly traded to read, or the address is not one the markets
          recognise.
        </div>
      )}

      {status === "error" && (
        <div className="glass p-8 text-center text-sm text-bone-mut">
          The glass clouded over and this coin could not be read right now.
        </div>
      )}

      {status === "ready" && coin && (
        <>
          {/* Identity */}
          <div className="glass flex items-center gap-3.5 p-4">
            <TokenLogo src={coin.logo} symbol={coin.symbol} size={52} />
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
              {coin.chainLabel && (
                <span className="mt-1 inline-block rounded-full border border-steel-line px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                  {coin.chainLabel}
                </span>
              )}
            </div>
            <WatchStar id={coin.address} symbol={coin.symbol} />
          </div>

          {/* Price + chart */}
          <div className="glass mt-3 p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                  Price
                </p>
                <p className="tnum mt-1 font-display text-2xl font-semibold text-bone">
                  {formatPrice(scrub ? scrub.c : coin.priceUsd)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                  {scrub ? "At point" : "24h"}
                </p>
                <p className="tnum mt-1 text-lg font-semibold">
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

            <div className="mt-4">
              {chart ? (
                <>
                  <InteractiveChart
                    points={chart.points}
                    up={up}
                    onScrub={setScrub}
                  />
                  <p className="mt-2 text-[11px] text-bone-faint">
                    {chart.implied
                      ? "Implied 24h line from current price and 24h change. Full price history is not available for this pair yet."
                      : "Recent price, hourly closes from the deepest pool. Source: GeckoTerminal."}
                  </p>
                </>
              ) : (
                <p className="py-6 text-center text-xs text-bone-faint">
                  No price history is available to chart for this token.
                </p>
              )}
            </div>

            {/* Timeframe changes */}
            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-steel-line pt-3">
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
          </div>

          {/* Transactions (24h): real buys vs sells */}
          {coin.txns24h &&
            coin.txns24h.buys + coin.txns24h.sells > 0 && (
              <TxnsBar buys={coin.txns24h.buys} sells={coin.txns24h.sells} />
            )}

          {/* Market data */}
          <div className="mt-3 grid grid-cols-2 gap-2">
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
            <div className="glass-warm mt-3 flex items-start gap-3 p-4">
              <Icon
                name="shield"
                className="mt-0.5 h-4 w-4 shrink-0 text-bone-faint"
              />
              <p className="text-xs text-bone-mut">
                In-app trading is EVM only. This token is not on a chain the
                realm trades, so buy and sell are not offered here.
              </p>
            </div>
          )}

          {/* Secondary external actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {coin.dexUrl && (
              <a
                href={coin.dexUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-bone-mut hover:text-bone"
              >
                <Icon name="signal" className="h-3.5 w-3.5" />
                {coin.dexId ? `View on ${coin.dexId}` : "View on DEX"}
                <Icon name="arrow" className="h-3.5 w-3.5" />
              </a>
            )}
            {coin.explorerUrl && (
              <a
                href={coin.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-bone-mut hover:text-bone"
              >
                <Icon name="search" className="h-3.5 w-3.5" />
                Explorer
                <Icon name="arrow" className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {/* Honest empty state */}
          <div className="glass-warm mt-4 flex items-start gap-3 p-4">
            <Icon name="scroll" className="mt-0.5 h-4 w-4 shrink-0 text-bone-faint" />
            <div>
              <p className="text-xs font-medium text-bone-mut">
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
          </div>

          <p className="mt-3 text-center text-[10px] text-bone-faint">
            Market data via DexScreener. A watchlist star is kept on this device.
          </p>
        </>
      )}
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
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-ember-deep/40 bg-panel p-4">
      <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
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

/* Real 24h buys vs sells, a proportional bar (gold buys, ember sells). */
function TxnsBar({ buys, sells }: { buys: number; sells: number }) {
  const total = buys + sells || 1;
  const buyPct = (buys / total) * 100;
  return (
    <div className="glass mt-3 p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
        Transactions (24h)
      </p>
      <div className="mt-2 flex items-center justify-between text-sm font-semibold">
        <span className="tnum text-gold-bright">
          {buys.toLocaleString("en-US")} buys
        </span>
        <span className="tnum text-ember-deep">
          {sells.toLocaleString("en-US")} sells
        </span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-void">
        <div className="h-full bg-gold-bright" style={{ width: `${buyPct}%` }} />
        <div className="h-full flex-1 bg-ember-deep" />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass glass-sm p-3.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </p>
      <p className="tnum mt-1 text-sm font-semibold text-bone">{value}</p>
    </div>
  );
}
