"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from "viem";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/cx";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton, INLINE_TOUCH_TARGET } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  Chip,
  ChipRail,
  ConsoleHeader,
  ConsolePage,
  ConsoleStat,
  ConsoleToolbar,
  CONSOLE_META,
  CONSOLE_PAD,
} from "@/components/console/console-shell";
import { realmFetch } from "@/lib/auth/api";
import { useVaultPrefs } from "@/components/wallet/wallet-prefs";
import { useWalletTokens } from "@/components/wallet/use-wallet-tokens";
import { TokenLogo } from "@/components/wallet/token-logo";
import { WatchBadge } from "@/components/tools/watch-badge";
import { txExplorerUrlFor, shortAddress } from "@/components/wallet/chains";
import {
  NATIVE_TOKEN_SENTINEL,
  PLATFORM_FEE_BPS,
  TRADE_CHAINS,
  tradeChainById,
} from "@/lib/trade/config";
import {
  tokensForChain,
  nativeToken,
  defaultQuoteToken,
  type ListedToken,
} from "@/lib/trade/token-list";

/* The Swap: trade any EVM coin for any other, non-custodially, best price via
   0x (which routes Uniswap and every major DEX). Opens on ETH to USDC, never
   gated on holdings. Both sides pick from a base token list, your own holdings,
   or a live search of any coin by ticker or contract address. BETA.

   Console archetype: compact above `md`, controls on a toolbar rail that
   collapses to a Sheet on a phone, zero ornament. */

const SLIPPAGE_BPS = 100;
const NATIVE_DECIMALS = 18;

export interface TokenRef {
  chainId: number;
  address: string | null; // null = native
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  priceUsd?: number | null;
}

interface SearchResult {
  address: string;
  symbol: string;
  name: string;
  chainId: number;
  chainLabel: string;
  logo: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
}

interface NormalizedQuote {
  buyAmount: string | null;
  sellAmount: string | null;
  minBuyAmount: string | null;
  totalNetworkFee: string | null;
  feeBps: number;
  feeAmount: string | null;
  allowanceTarget: string | null;
  allowanceNeeded: boolean;
  transaction: { to: string; data: string; value: string } | null;
}

type Phase = "idle" | "confirm" | "approving" | "swapping" | "success" | "error";

function nowMs(): number {
  return Date.now();
}
function toBig(raw: string | null | undefined): bigint {
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}
function fmtUsd(n: number): string {
  if (n >= 1_000_000)
    return `$${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (n >= 1_000)
    return `$${(n / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
function fmtToken(raw: string | null, decimals: number): string {
  if (!raw) return "0";
  try {
    const n = Number(formatUnits(BigInt(raw), decimals));
    if (!Number.isFinite(n)) return "0";
    if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
    if (n >= 0.0001) return n.toFixed(6);
    return n.toPrecision(3);
  } catch {
    return "0";
  }
}
function parseAmount(amount: string, decimals: number): bigint {
  const v = amount.trim();
  if (!v) return 0n;
  try {
    const wei = parseUnits(v, decimals);
    return wei > 0n ? wei : 0n;
  } catch {
    return 0n;
  }
}
function listedToRef(t: ListedToken): TokenRef {
  return {
    chainId: t.chainId,
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    logo: t.logo,
  };
}
function zeroxToken(t: TokenRef): string {
  return t.address === null ? NATIVE_TOKEN_SENTINEL : t.address;
}
function fmtPriceUsd(price: number | null | undefined): string | undefined {
  if (price === null || price === undefined) return undefined;
  return price >= 1
    ? `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : `$${price.toPrecision(2)}`;
}

export default function SwapPage() {
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();

  const sender = useMemo(() => {
    const embedded = wallets.find(
      (w) =>
        w.walletClientType === "privy" ||
        w.walletClientType === "privy-v2" ||
        w.connectorType === "embedded"
    );
    return embedded ?? wallets[0] ?? null;
  }, [wallets]);
  const walletAddress = sender?.address;

  const { custom, recordTx } = useVaultPrefs(walletAddress);
  const { tokens: heldTokens, refresh } = useWalletTokens(walletAddress, custom);

  const [chainId, setChainId] = useState(1);
  const [from, setFrom] = useState<TokenRef>(() =>
    listedToRef(nativeToken(1)!)
  );
  const [to, setTo] = useState<TokenRef>(() =>
    listedToRef(defaultQuoteToken(1)!)
  );
  const [amount, setAmount] = useState("");

  const [quote, setQuote] = useState<NormalizedQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [pickerSide, setPickerSide] = useState<"from" | "to" | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [execError, setExecError] = useState<string | null>(null);
  const [approvalHash, setApprovalHash] = useState<string | null>(null);
  const approvalSent = useRef(false);
  const [swapHash, setSwapHash] = useState<string | null>(null);

  const chain = tradeChainById(chainId);

  // Switch chains: reset both sides to that chain's native and USDC.
  const switchChain = (id: number) => {
    setChainId(id);
    const nat = nativeToken(id);
    const usdc = defaultQuoteToken(id);
    if (nat) setFrom(listedToRef(nat));
    if (usdc) setTo(listedToRef(usdc));
    setAmount("");
    setQuote(null);
  };

  // Hydrate a token's USD price from /api/coin (native uses the wrapped coin).
  const hydratePrice = useCallback(
    async (t: TokenRef, set: (r: TokenRef) => void) => {
      const c = tradeChainById(t.chainId);
      const addr = t.address ?? c?.wrappedNative;
      if (!addr || !c) return;
      try {
        const res = await fetch(
          `/api/coin?address=${addr}&net=${c.gecko}`
        );
        const body = (await res.json()) as {
          coin?: { priceUsd?: number | null };
        };
        if (typeof body.coin?.priceUsd === "number") {
          set({ ...t, priceUsd: body.coin.priceUsd });
        }
      } catch {
        /* price is a nicety */
      }
    },
    []
  );

  useEffect(() => {
    if (from.priceUsd === undefined) void hydratePrice(from, setFrom);
  }, [from, hydratePrice]);
  useEffect(() => {
    if (to.priceUsd === undefined) void hydratePrice(to, setTo);
  }, [to, hydratePrice]);

  // Live balance for a side from the member's holdings (0 when not held).
  const balanceOf = useCallback(
    (t: TokenRef) => {
      const match = heldTokens.find(
        (h) =>
          h.chainId === t.chainId &&
          (t.address === null
            ? h.isNative
            : h.contract?.toLowerCase() === t.address.toLowerCase())
      );
      return match ?? null;
    },
    [heldTokens]
  );
  const fromHeld = balanceOf(from);
  const fromBalanceRaw = toBig(fromHeld?.balanceRaw);
  const toHeld = balanceOf(to);

  const sellRaw = useMemo(
    () => parseAmount(amount, from.decimals),
    [amount, from.decimals]
  );
  const overBalance = fromHeld ? sellRaw > fromBalanceRaw : false;

  const fetchQuote = useCallback(async () => {
    if (sellRaw <= 0n) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    const res = await realmFetch<{
      quote?: NormalizedQuote;
      error?: string;
      message?: string;
    }>(
      "/api/trade/quote",
      {
        method: "POST",
        json: {
          mode: "price",
          chainId,
          sellToken: zeroxToken(from),
          buyToken: zeroxToken(to),
          sellAmount: sellRaw.toString(),
          feeToken: to.address ?? from.address ?? undefined,
          slippageBps: SLIPPAGE_BPS,
        },
      }
    );
    if (res.ok && res.data?.quote) setQuote(res.data.quote);
    else {
      setQuote(null);
      setQuoteError(
        res.data?.message ?? res.data?.error ?? "No quote right now."
      );
    }
    setQuoteLoading(false);
  }, [sellRaw, chainId, from, to]);

  useEffect(() => {
    const t = setTimeout(() => void fetchQuote(), 350);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  const receiveAmount = quote?.buyAmount
    ? Number(formatUnits(toBig(quote.buyAmount), to.decimals))
    : 0;
  const payUsd =
    from.priceUsd && sellRaw > 0n
      ? Number(formatUnits(sellRaw, from.decimals)) * from.priceUsd
      : null;
  const receiveUsd =
    to.priceUsd && receiveAmount > 0 ? receiveAmount * to.priceUsd : null;

  const rate =
    quote?.buyAmount && sellRaw > 0n
      ? receiveAmount / Number(formatUnits(sellRaw, from.decimals))
      : null;

  const flip = () => {
    setFrom(to);
    setTo(from);
    setAmount("");
    setQuote(null);
  };

  const pickToken = (side: "from" | "to", t: TokenRef) => {
    if (side === "from") {
      if (
        t.address === to.address &&
        t.chainId === to.chainId
      )
        setTo(from);
      setFrom({ ...t, priceUsd: undefined });
    } else {
      if (t.address === from.address && t.chainId === from.chainId)
        setFrom(to);
      setTo({ ...t, priceUsd: undefined });
    }
    setChainId(t.chainId);
    setPickerSide(null);
    setQuote(null);
  };

  const reset = () => {
    setPhase("idle");
    setExecError(null);
    setApprovalHash(null);
    setSwapHash(null);
    approvalSent.current = false;
  };

  const execute = async () => {
    if (!walletAddress || !chain) return;
    setExecError(null);
    setPhase("swapping");
    const res = await realmFetch<{ quote?: NormalizedQuote; error?: string }>(
      "/api/trade/quote",
      {
        method: "POST",
        json: {
          mode: "quote",
          chainId,
          sellToken: zeroxToken(from),
          buyToken: zeroxToken(to),
          sellAmount: sellRaw.toString(),
          taker: walletAddress,
          feeToken: to.address ?? from.address ?? undefined,
          slippageBps: SLIPPAGE_BPS,
        },
      }
    );
    const firm = res.data?.quote;
    if (!res.ok || !firm || !firm.transaction) {
      setExecError(res.data?.error ?? "The swap could not be prepared.");
      setPhase("error");
      return;
    }
    try {
      await sender?.switchChain?.(chainId);
    } catch {
      /* provider may switch in its own window */
    }
    if (
      from.address !== null &&
      firm.allowanceNeeded &&
      firm.allowanceTarget &&
      !approvalSent.current
    ) {
      try {
        setPhase("approving");
        const approval = await sendTransaction(
          {
            to: from.address as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [firm.allowanceTarget as `0x${string}`, sellRaw],
            }),
            value: 0n,
            chainId,
          },
          { address: walletAddress }
        );
        approvalSent.current = true;
        setApprovalHash(approval.hash);
        setPhase("confirm");
        return;
      } catch (e) {
        setExecError(readError(e, chain.native));
        setPhase("error");
        return;
      }
    }
    try {
      setPhase("swapping");
      const result = await sendTransaction(
        {
          to: firm.transaction.to as `0x${string}`,
          data: firm.transaction.data as `0x${string}`,
          value: BigInt(firm.transaction.value || "0"),
          chainId,
        },
        { address: walletAddress }
      );
      setSwapHash(result.hash);
      recordTx({
        hash: result.hash,
        chainId,
        to: firm.transaction.to,
        symbol: to.symbol,
        amount: firm.buyAmount
          ? formatUnits(toBig(firm.buyAmount), to.decimals)
          : "0",
        contract: to.address,
        at: nowMs(),
      });
      void realmFetch("/api/trade/record", {
        method: "POST",
        json: {
          kind: "swap",
          chainId,
          txHash: result.hash,
          sellSymbol: from.symbol,
          sellAmount: amount,
          sellContract: from.address,
          buySymbol: to.symbol,
          buyAmount: firm.buyAmount
            ? formatUnits(toBig(firm.buyAmount), to.decimals)
            : null,
          buyContract: to.address,
          usdValue: payUsd ?? receiveUsd ?? undefined,
        },
      });
      setPhase("success");
      setTimeout(() => refresh(), 4000);
    } catch (e) {
      setExecError(readError(e, chain.native));
      setPhase("error");
    }
  };

  const canReview =
    !!walletAddress && sellRaw > 0n && !overBalance && !quoteLoading && !!quote;

  return (
    <ConsolePage width="form">
      <ConsoleHeader
        title="The Swap"
        kicker="Trade any EVM coin"
        /* Cold entry falls back to the Vault: the Swap trades the wallet the
           Vault holds. */
        backHref="/vault"
        badge={<Badge variant="beta">Beta</Badge>}
      />

      <div className="mt-4 md:mt-3">
        <ConsoleToolbar label="Network" summary={chain?.name}>
          <ChipRail label="Network">
            {TRADE_CHAINS.map((c) => (
              <Chip
                key={c.id}
                active={chainId === c.id}
                onClick={() => switchChain(c.id)}
              >
                {c.name}
              </Chip>
            ))}
          </ChipRail>
        </ConsoleToolbar>
      </div>

      {/* From */}
      <Card pad="none" className={cx("mt-3 md:mt-2", CONSOLE_PAD)}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            You pay
          </span>
          <span className="tnum text-[11px] text-bone-faint">
            Balance{" "}
            {fromHeld
              ? Number(fromHeld.balanceDisplay).toLocaleString("en-US", {
                  maximumFractionDigits: 4,
                })
              : "0"}
            {fromHeld && Number(fromHeld.balanceDisplay) > 0 && (
              <button
                type="button"
                onClick={() =>
                  setAmount(formatUnits(fromBalanceRaw, from.decimals))
                }
                className={`${INLINE_TOUCH_TARGET} ml-1.5 font-semibold text-gold hover:underline`}
              >
                Max
              </button>
            )}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3 md:mt-1.5">
          <TokenSelect token={from} onClick={() => setPickerSide("from")} />
          <input
            inputMode="decimal"
            aria-label={`Amount of ${from.symbol} to pay`}
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
            }}
            placeholder="0"
            className={cx(
              /* The amount field is the whole point of this screen and it
                 measured 21px tall, because a bare input takes its height from
                 its line box and nothing here asked for more. The floor on a
                 finger only, so the desktop console stays as dense as it is. */
              "tnum min-w-0 flex-1 bg-transparent text-right font-display text-2xl outline-none touch:min-h-11 placeholder-bone-faint md:text-xl",
              overBalance ? "text-ember" : "text-bone"
            )}
          />
        </div>
        <div
          className={cx(
            "mt-1 flex items-center justify-between text-bone-faint",
            CONSOLE_META
          )}
        >
          <span>{chain?.name}</span>
          {payUsd !== null && <span className="tnum">{fmtUsd(payUsd)}</span>}
        </div>
        {overBalance && (
          <p className={cx("mt-1 text-ember", CONSOLE_META)}>
            More than your {from.symbol} balance.
          </p>
        )}
      </Card>

      {/* Flip */}
      <div className="relative z-10 -my-2.5 flex justify-center">
        <IconButton
          icon="repost"
          label="Swap direction"
          variant="glass"
          size="sm"
          onClick={flip}
          className="text-gold"
        />
      </div>

      {/* To */}
      <Card pad="none" className={CONSOLE_PAD}>
        <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
          You receive
        </span>
        <div className="mt-2 flex items-center gap-3 md:mt-1.5">
          <TokenSelect token={to} onClick={() => setPickerSide("to")} />
          <span className="tnum min-w-0 flex-1 truncate text-right font-display text-2xl text-bone md:text-xl">
            {quoteLoading
              ? "..."
              : quote
                ? fmtToken(quote.buyAmount, to.decimals)
                : "0"}
          </span>
        </div>
        <div
          className={cx(
            "mt-1 flex items-center justify-between text-bone-faint",
            CONSOLE_META
          )}
        >
          <span className="flex items-center gap-1.5">
            {toHeld
              ? `Balance ${Number(toHeld.balanceDisplay).toLocaleString("en-US", { maximumFractionDigits: 4 })}`
              : chain?.name}
            {to.address && (
              <WatchBadge
                address={to.address}
                chain={String(to.chainId)}
                linkToWatch={false}
              />
            )}
          </span>
          {receiveUsd !== null && <span className="tnum">{fmtUsd(receiveUsd)}</span>}
        </div>
      </Card>

      {/* Rate + fee line */}
      {quote && rate !== null && (
        <div
          className={cx(
            "mt-2 flex items-center justify-between rounded-lg border border-steel-line bg-void/60 px-3 py-2 text-bone-mut",
            CONSOLE_META
          )}
        >
          <span className="tnum">
            1 {from.symbol} ={" "}
            {rate >= 1
              ? rate.toLocaleString("en-US", { maximumFractionDigits: 2 })
              : rate.toPrecision(3)}{" "}
            {to.symbol}
          </span>
          <span className="tnum text-bone-faint">
            {(PLATFORM_FEE_BPS / 100).toFixed(1)}% fee
          </span>
        </div>
      )}

      {quoteError && sellRaw > 0n && (
        <p className={cx("mt-2 text-ember", CONSOLE_META)}>{quoteError}</p>
      )}

      <Button
        variant="gold"
        size="lg"
        block
        disabled={!canReview}
        onClick={() => setPhase("confirm")}
        className="mt-3 md:h-9 md:text-sm"
      >
        <Icon name="repost" className="h-4 w-4" />
        {overBalance ? `Not enough ${from.symbol}` : "Review swap"}
      </Button>

      {!walletAddress && (
        <p className={cx("mt-2 text-center text-ember", CONSOLE_META)}>
          No embedded wallet is ready to swap yet.
        </p>
      )}
      <p className="mt-3 text-center text-[11px] text-bone-faint">
        Signed by your own wallet. Non-custodial. Best price via 0x across
        Uniswap and every major DEX.
      </p>

      <TokenPicker
        side={pickerSide}
        chainId={chainId}
        held={heldTokens}
        onClose={() => setPickerSide(null)}
        onPick={(t) => pickerSide && pickToken(pickerSide, t)}
      />

      {chain && (
        <AdaptiveDialog
          open={phase !== "idle"}
          onOpenChange={(next) => {
            if (!next) reset();
          }}
          title={
            phase === "success"
              ? `Swapped ${from.symbol} to ${to.symbol}`
              : `${from.symbol} to ${to.symbol}`
          }
          description={phase === "success" ? undefined : "Swap preview"}
        >
          {phase === "success" ? (
            <SwapSuccess
              to={to}
              receive={`${fmtToken(quote?.buyAmount ?? null, to.decimals)} ${to.symbol}`}
              chainId={chainId}
              hash={swapHash}
              onClose={reset}
            />
          ) : (
            <>
              <div className="flex flex-col gap-2 rounded-lg border border-steel-line bg-void/60 p-3">
                <ConsoleStat
                  label="You pay"
                  value={`${amount} ${from.symbol}`}
                />
                <ConsoleStat
                  label="You receive"
                  tone="strong"
                  value={`${fmtToken(quote?.buyAmount ?? null, to.decimals)} ${to.symbol}`}
                />
                {quote?.minBuyAmount && (
                  <ConsoleStat
                    label="Minimum received"
                    value={`${fmtToken(quote.minBuyAmount, to.decimals)} ${to.symbol}`}
                  />
                )}
                <ConsoleStat
                  label={`Platform fee (${(PLATFORM_FEE_BPS / 100).toFixed(1)}%)`}
                  value={
                    quote?.feeAmount
                      ? `${fmtToken(quote.feeAmount, to.decimals)} ${to.symbol}`
                      : "included"
                  }
                />
                {quote?.totalNetworkFee && (
                  <ConsoleStat
                    label="Network fee (est.)"
                    value={`~${fmtToken(quote.totalNetworkFee, NATIVE_DECIMALS)} ${chain.native}`}
                  />
                )}
                <ConsoleStat label="Network" value={chain.name} />
                {/* Order routing */}
                <div className="mt-1 flex items-center justify-between border-t border-steel-line pt-2 text-[11px] text-bone-faint">
                  <span>Route</span>
                  <span className="flex items-center gap-1.5">
                    {from.symbol}
                    <Icon name="arrow" className="h-3 w-3" />
                    <span className="rounded-sm bg-panel px-1.5 py-0.5 text-gold">
                      0x
                    </span>
                    <Icon name="arrow" className="h-3 w-3" />
                    {to.symbol}
                  </span>
                </div>
              </div>

              {approvalHash && (
                <p className="mt-3 rounded-lg border border-gold/25 bg-panel-warm/50 p-3 text-xs text-bone-mut">
                  Approval sent. Once it confirms (about 15 seconds), confirm
                  the swap below.
                </p>
              )}
              {execError && (
                <p className="mt-3 text-xs text-ember">{execError}</p>
              )}

              <Button
                variant="gold"
                size="lg"
                block
                loading={phase === "swapping" || phase === "approving"}
                onClick={() => void execute()}
                className="mt-4"
              >
                {phase === "approving"
                  ? "Approving..."
                  : phase === "swapping"
                    ? "Confirm in your wallet..."
                    : "Confirm swap"}
              </Button>
              <p className="mt-3 text-center text-[11px] text-bone-faint">
                Signed by your own wallet. Non-custodial.
              </p>
            </>
          )}
        </AdaptiveDialog>
      )}
    </ConsolePage>
  );
}

function TokenSelect({
  token,
  onClick,
}: {
  token: TokenRef;
  onClick: () => void;
}) {
  return (
    <Button
      variant="glass"
      size="md"
      onClick={onClick}
      className="shrink-0 pl-2 pr-2.5"
    >
      <TokenLogo logo={token.logo} symbol={token.symbol} size={22} />
      <span className="font-semibold text-bone">{token.symbol}</span>
      <Icon name="chevron-down" className="h-3.5 w-3.5 text-bone-faint" />
    </Button>
  );
}

function TokenPicker({
  side,
  chainId,
  held,
  onClose,
  onPick,
}: {
  side: "from" | "to" | null;
  chainId: number;
  held: ReturnType<typeof useWalletTokens>["tokens"];
  onClose: () => void;
  onPick: (t: TokenRef) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState<SearchResult[]>([]);
  const [activeLoading, setActiveLoading] = useState(true);

  const open = side !== null;
  const showSearchSkeleton = useDelayedLoading(searching, 300);
  const showActiveSkeleton = useDelayedLoading(activeLoading, 300);

  /* The live active-coin roll for the selected chain, so the picker opens like
     a real DEX token list rather than a handful of majors. Refetched when the
     chain changes. Gated on `open` because the dialog now stays mounted for its
     enter and exit transitions, and a closed picker must not call the roll. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setActiveLoading(true);
    void realmFetch<{ results?: SearchResult[] }>(
      `/api/trade/top-tokens?chain=${chainId}`
    ).then((res) => {
      if (cancelled) return;
      setActive(res.data?.results ?? []);
      setActiveLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [chainId, open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await realmFetch<{ results?: SearchResult[] }>(
        `/api/trade/tokens?q=${encodeURIComponent(query.trim())}`
      );
      if (cancelled) return;
      setResults(res.data?.results ?? []);
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const base = tokensForChain(chainId);
  const heldOnChain = held.filter(
    (h) => h.chainId === chainId && Number(h.balanceDisplay) > 0
  );

  /* The active roll, minus anything already surfaced in Popular or Holdings, so
     the list never repeats a coin. */
  const seen = new Set<string>();
  for (const t of base) if (t.address) seen.add(t.address.toLowerCase());
  for (const h of heldOnChain) if (h.contract) seen.add(h.contract.toLowerCase());
  const activeCoins = active.filter(
    (r) => r.address && !seen.has(r.address.toLowerCase())
  );

  const pickListed = (t: ListedToken) => onPick(listedToRef(t));
  const pickHeld = (h: (typeof held)[number]) =>
    onPick({
      chainId: h.chainId,
      address: h.isNative ? null : h.contract,
      symbol: h.symbol,
      name: h.name,
      decimals: h.decimals,
      logo: h.logo,
    });
  const pickResult = (r: SearchResult) =>
    onPick({
      chainId: r.chainId,
      address: r.address,
      symbol: r.symbol,
      name: r.name,
      decimals: 18, // hydrated by the coin page on the way in
      logo: r.logo,
      priceUsd: r.priceUsd,
    });

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        /* A reopened picker starts blank, the way a freshly mounted one did. */
        setQuery("");
        onClose();
      }}
      title="Select a coin"
      description={
        side === "to" ? "Receiving on EVM chains only." : "Paying with, on EVM chains only."
      }
    >
      <div className="relative">
        <Icon
          name="search"
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-bone-faint"
        />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ticker, name or contract address"
          aria-label="Search coins"
          spellCheck={false}
          className="h-11 pl-10 md:h-9"
        />
      </div>

      <div className="mt-3 max-h-[52vh] overflow-y-auto sm:max-h-[56vh]">
        {query.trim().length >= 2 ? (
          searching ? (
            showSearchSkeleton ? (
              <ChoiceSkeleton />
            ) : null
          ) : results.length === 0 ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No coin found"
              body="Nothing matched that. Try the full contract address."
            />
          ) : (
            <Section label="Search results">
              {results.map((r) => (
                <Choice
                  key={`${r.chainId}:${r.address}`}
                  logo={r.logo}
                  symbol={r.symbol}
                  sub={`${r.name} · ${r.chainLabel}`}
                  right={fmtPriceUsd(r.priceUsd)}
                  onClick={() => pickResult(r)}
                />
              ))}
            </Section>
          )
        ) : (
          <>
            {heldOnChain.length > 0 && (
              <Section label="Your holdings">
                {heldOnChain.map((h) => (
                  <Choice
                    key={h.key}
                    logo={h.logo}
                    symbol={h.symbol}
                    sub={h.name}
                    right={Number(h.balanceDisplay).toLocaleString("en-US", {
                      maximumFractionDigits: 4,
                    })}
                    onClick={() => pickHeld(h)}
                  />
                ))}
              </Section>
            )}
            <Section label="Popular on this chain">
              {base.map((t) => (
                <Choice
                  key={t.symbol}
                  logo={t.logo}
                  symbol={t.symbol}
                  sub={t.name}
                  onClick={() => pickListed(t)}
                />
              ))}
            </Section>
            <Section label="Active coins, live by volume">
              {activeLoading ? (
                showActiveSkeleton ? (
                  <ChoiceSkeleton />
                ) : null
              ) : activeCoins.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon="eye"
                  title="No live coins"
                  body="None could be read for this chain right now."
                />
              ) : (
                activeCoins.map((r) => (
                  <Choice
                    key={`${r.chainId}:${r.address}`}
                    logo={r.logo}
                    symbol={r.symbol}
                    sub={`${r.name} · ${r.chainLabel}`}
                    right={fmtPriceUsd(r.priceUsd)}
                    onClick={() => pickResult(r)}
                  />
                ))
              )}
            </Section>
          </>
        )}
      </div>
    </AdaptiveDialog>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 md:mb-3">
      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
        {label}
      </p>
      <div className="flex flex-col gap-1 md:gap-0.5">{children}</div>
    </div>
  );
}

function Choice({
  logo,
  symbol,
  sub,
  right,
  onClick,
}: {
  logo: string | null;
  symbol: string;
  sub: string;
  right?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-fast hover:bg-panel-warm/60 md:min-h-9 md:py-1.5"
    >
      <TokenLogo logo={logo} symbol={symbol} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-bone md:text-[13px]">
          {symbol}
        </p>
        <p className="truncate text-[11px] text-bone-faint">{sub}</p>
      </div>
      {right && (
        <span className="tnum shrink-0 text-xs text-bone-mut md:text-[11px]">
          {right}
        </span>
      )}
    </button>
  );
}

/* Shaped like the rows it stands in for, not a grey slab the size of the list. */
function ChoiceSkeleton() {
  return (
    <div className="flex flex-col gap-1 md:gap-0.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex min-h-11 items-center gap-3 px-2 md:min-h-9">
          <Skeleton radius="full" className="h-7 w-7 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton radius="sm" className="h-2.5 w-16" />
            <Skeleton radius="sm" className="h-2 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SwapSuccess({
  to,
  receive,
  chainId,
  hash,
  onClose,
}: {
  to: TokenRef;
  receive: string;
  chainId: number;
  hash: string | null;
  onClose: () => void;
}) {
  const explorer = hash ? txExplorerUrlFor(chainId, hash) : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-bone-mut">
        You received {receive}. Your Vault and Coffers will update as the chain
        confirms.
      </p>
      {hash && (
        <div className="rounded-lg border border-steel-line bg-panel/50 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            Transaction
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <code className="tnum min-w-0 truncate font-mono text-xs text-bone-mut">
              {shortAddress(hash, 10, 8)}
            </code>
            {explorer && (
              <Button
                size="sm"
                render={
                  <a href={explorer} target="_blank" rel="noreferrer">
                    <Icon name="arrow" className="h-3.5 w-3.5" />
                    View
                  </a>
                }
              />
            )}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <TokenLogo logo={to.logo} symbol={to.symbol} size={20} />
        <span className="text-xs text-bone-faint">{to.symbol} is in your Vault.</span>
      </div>
      <Button variant="gold" size="lg" block onClick={onClose}>
        Done
      </Button>
    </div>
  );
}

function readError(e: unknown, native: string): string {
  const msg = e instanceof Error ? e.message : "";
  if (/reject|denied|cancel/i.test(msg))
    return "You closed the wallet window. Nothing was sent.";
  if (/insufficient|funds|balance/i.test(msg))
    return `Your wallet lacks the ${native} to cover this swap and gas.`;
  return msg || "The swap could not be completed.";
}
