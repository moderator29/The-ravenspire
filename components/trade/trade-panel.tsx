"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from "viem";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/tabs";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";
import { useVaultPrefs } from "@/components/wallet/wallet-prefs";
import { useWalletTokens } from "@/components/wallet/use-wallet-tokens";
import { txExplorerUrlFor, shortAddress } from "@/components/wallet/chains";
import { TopUpButton } from "@/components/trade/top-up-button";
import {
  NATIVE_TOKEN_SENTINEL,
  PLATFORM_FEE_BPS,
  tradeChainById,
} from "@/lib/trade/config";

/* The in-app trading panel for a coin page. Buy and sell an EVM coin in
   platform, non-custodially: the member's own Privy embedded wallet signs and
   sends every transaction through the 0x route, with the 0.5% platform fee
   attached transparently. BETA.

   Real data only: live quotes come from /api/trade/quote (0x). When decimals
   or price cannot be read we decline to guess amounts rather than fabricate a
   figure. Every completed trade is written to the Vault's transaction history
   and the member's live balances refresh, so The Vault and The Coffers update
   themselves. */

const NATIVE_DECIMALS = 18;
const USD_PRESETS = [10, 25, 50, 100];
const SELL_PCTS = [25, 50, 100];
const SLIPPAGE_BPS = 100; // 1%

export interface TradeCoin {
  address: string;
  symbol: string;
  name: string;
  evmChainId: number;
  decimals: number | null;
  priceUsd: number | null;
  logo: string | null;
  chainLabel: string | null;
  liquidityUsd: number | null;
  pairCreatedAt: number | null;
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
  chainId: number;
}

type Side = "buy" | "sell";
type Phase = "idle" | "confirm" | "approving" | "swapping" | "success" | "error";

function fmtUsd(n: number): string {
  if (n >= 1_000_000)
    return `$${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (n >= 1_000)
    return `$${(n / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/* Event-time timestamp, read through a module helper so the purity lint does
   not mistake this handler-only call for a render-time impurity. */
function nowMs(): number {
  return Date.now();
}

/* Pure BigInt helpers kept at module scope (not inside a useMemo) so the React
   Compiler can preserve memoization; try/catch inside a hook body defeats it. */
function toBig(raw: string | null | undefined): bigint {
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

function pctOf(raw: string | null | undefined, pct: number): bigint {
  const bal = toBig(raw);
  return (bal * BigInt(pct)) / 100n;
}

function usdToBuyRaw(
  usd: number,
  price: number | null,
  decimals: number | null
): bigint {
  if (decimals === null || price === null || usd <= 0) return 0n;
  const qty = usd / price;
  if (!Number.isFinite(qty) || qty <= 0) return 0n;
  try {
    return parseUnits(qty.toFixed(Math.min(decimals, 18)), decimals);
  } catch {
    return 0n;
  }
}

function fmtToken(raw: string | null, decimals: number): string {
  if (!raw) return "0";
  try {
    const n = Number(formatUnits(BigInt(raw), decimals));
    if (!Number.isFinite(n)) return "0";
    if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
    if (n >= 0.0001) return n.toFixed(6);
    return n.toPrecision(3);
  } catch {
    return "0";
  }
}

export function TradePanel({ coin }: { coin: TradeCoin }) {
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
  const { tokens, refresh } = useWalletTokens(walletAddress, custom);

  const chain = tradeChainById(coin.evmChainId);

  const nativeToken = useMemo(
    () =>
      tokens.find((t) => t.chainId === coin.evmChainId && t.isNative) ?? null,
    [tokens, coin.evmChainId]
  );
  const heldToken = useMemo(
    () =>
      tokens.find(
        (t) =>
          t.chainId === coin.evmChainId &&
          t.contract?.toLowerCase() === coin.address.toLowerCase()
      ) ?? null,
    [tokens, coin.evmChainId, coin.address]
  );

  const [side, setSide] = useState<Side>("buy");
  const [usdChoice, setUsdChoice] = useState<number | null>(25);
  const [customUsd, setCustomUsd] = useState("");
  const [sellPct, setSellPct] = useState<number>(50);

  const [quote, setQuote] = useState<NormalizedQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [execError, setExecError] = useState<string | null>(null);
  const [approvalHash, setApprovalHash] = useState<string | null>(null);
  const approvalSent = useRef(false);
  const [swapHash, setSwapHash] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const tradable = coin.decimals !== null && coin.priceUsd !== null;

  // The chosen buy amount in USD (preset or custom).
  const usdAmount = useMemo(() => {
    if (usdChoice !== null) return usdChoice;
    const n = Number(customUsd);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [usdChoice, customUsd]);

  // Sell amount in the token's base units: a percentage of the live balance.
  const sellRaw = useMemo(
    () => (heldToken ? pctOf(heldToken.balanceRaw, sellPct) : 0n),
    [heldToken, sellPct]
  );

  // Buy amount (target token quantity) in base units from USD / price.
  const buyRaw = useMemo(
    () => usdToBuyRaw(usdAmount, coin.priceUsd, coin.decimals),
    [coin.decimals, coin.priceUsd, usdAmount]
  );

  const amountKey =
    side === "buy" ? `buy:${buyRaw.toString()}` : `sell:${sellRaw.toString()}`;

  // Live indicative quote, debounced. Never cached.
  const fetchQuote = useCallback(async () => {
    if (!tradable || coin.decimals === null) return;
    const active = side === "buy" ? buyRaw > 0n : sellRaw > 0n && !!heldToken;
    if (!active) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    const payload =
      side === "buy"
        ? {
            mode: "price",
            chainId: coin.evmChainId,
            sellToken: NATIVE_TOKEN_SENTINEL,
            buyToken: coin.address,
            buyAmount: buyRaw.toString(),
            feeToken: coin.address,
            slippageBps: SLIPPAGE_BPS,
          }
        : {
            mode: "price",
            chainId: coin.evmChainId,
            sellToken: coin.address,
            buyToken: NATIVE_TOKEN_SENTINEL,
            sellAmount: sellRaw.toString(),
            feeToken: coin.address,
            slippageBps: SLIPPAGE_BPS,
          };
    const res = await realmFetch<{ quote?: NormalizedQuote; error?: string }>(
      "/api/trade/quote",
      { method: "POST", json: payload }
    );
    if (res.ok && res.data?.quote) {
      setQuote(res.data.quote);
    } else {
      setQuote(null);
      setQuoteError(res.data?.error ?? "No quote right now.");
    }
    setQuoteLoading(false);
  }, [
    tradable,
    side,
    buyRaw,
    sellRaw,
    heldToken,
    coin.evmChainId,
    coin.address,
    coin.decimals,
  ]);

  useEffect(() => {
    const t = setTimeout(() => void fetchQuote(), 350);
    return () => clearTimeout(t);
  }, [amountKey, fetchQuote]);

  // Does the member hold enough native to cover a buy's cost?
  const nativeBalanceRaw = useMemo(
    () => toBig(nativeToken?.balanceRaw),
    [nativeToken]
  );

  const buyCostRaw = useMemo(
    () => (side === "buy" ? toBig(quote?.sellAmount) : 0n),
    [side, quote]
  );

  const needsTopUp =
    side === "buy" && buyCostRaw > 0n && buyCostRaw > nativeBalanceRaw;

  const reset = () => {
    setPhase("idle");
    setExecError(null);
    setApprovalHash(null);
    setSwapHash(null);
    approvalSent.current = false;
  };

  // Fetch a firm quote (with calldata) and execute. For sells that need an
  // ERC-20 approval, the first press sends the approval; once it confirms the
  // member presses again to send the swap.
  const execute = async () => {
    if (!walletAddress || !chain) return;
    setExecError(null);
    const payload =
      side === "buy"
        ? {
            mode: "quote",
            chainId: coin.evmChainId,
            sellToken: NATIVE_TOKEN_SENTINEL,
            buyToken: coin.address,
            buyAmount: buyRaw.toString(),
            taker: walletAddress,
            feeToken: coin.address,
            slippageBps: SLIPPAGE_BPS,
          }
        : {
            mode: "quote",
            chainId: coin.evmChainId,
            sellToken: coin.address,
            buyToken: NATIVE_TOKEN_SENTINEL,
            sellAmount: sellRaw.toString(),
            taker: walletAddress,
            feeToken: coin.address,
            slippageBps: SLIPPAGE_BPS,
          };

    setPhase("swapping");
    const res = await realmFetch<{ quote?: NormalizedQuote; error?: string }>(
      "/api/trade/quote",
      { method: "POST", json: payload }
    );
    const firm = res.data?.quote;
    if (!res.ok || !firm || !firm.transaction) {
      setExecError(res.data?.error ?? "The trade could not be prepared.");
      setPhase("error");
      return;
    }

    // Land on the token's chain first.
    try {
      await sender?.switchChain?.(coin.evmChainId);
    } catch {
      /* provider may switch inside its own window */
    }

    // Sells: approve the allowance target before the swap, once.
    if (
      side === "sell" &&
      firm.allowanceNeeded &&
      firm.allowanceTarget &&
      !approvalSent.current
    ) {
      try {
        setPhase("approving");
        const approveTx = {
          to: coin.address as `0x${string}`,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [firm.allowanceTarget as `0x${string}`, sellRaw],
          }),
          value: 0n,
          chainId: coin.evmChainId,
        };
        const approval = await sendTransaction(approveTx, {
          address: walletAddress,
        });
        approvalSent.current = true;
        setApprovalHash(approval.hash);
        // Stop here: the member confirms the swap once the approval lands.
        setPhase("confirm");
        return;
      } catch (e) {
        setExecError(readError(e, chain.native));
        setPhase("error");
        return;
      }
    }

    // Send the swap.
    try {
      setPhase("swapping");
      const tx = {
        to: firm.transaction.to as `0x${string}`,
        data: firm.transaction.data as `0x${string}`,
        value: BigInt(firm.transaction.value || "0"),
        chainId: coin.evmChainId,
      };
      const result = await sendTransaction(tx, { address: walletAddress });
      setSwapHash(result.hash);

      // Record to the Vault's history so it survives without a provider feed,
      // then refresh balances so holdings update themselves. buyAmount is what
      // the member receives on both sides (the buyToken).
      const receivedRaw = firm.buyAmount;
      const receivedDecimals =
        side === "buy" ? coin.decimals ?? 18 : NATIVE_DECIMALS;
      recordTx({
        hash: result.hash,
        chainId: coin.evmChainId,
        to: firm.transaction.to,
        symbol: side === "buy" ? coin.symbol : chain.native,
        amount: receivedRaw ? formatUnits(toBig(receivedRaw), receivedDecimals) : "0",
        contract: side === "buy" ? coin.address : null,
        at: nowMs(),
      });

      // Also record to the platform-wide trade feed (real receipt, idempotent
      // on the hash). Best-effort: the on-chain trade is the source of truth,
      // so a failed write here never undoes a completed trade.
      const isBuy = side === "buy";
      void realmFetch("/api/trade/record", {
        method: "POST",
        json: {
          kind: side,
          chainId: coin.evmChainId,
          txHash: result.hash,
          sellSymbol: isBuy ? chain.native : coin.symbol,
          sellAmount: firm.sellAmount
            ? formatUnits(toBig(firm.sellAmount), isBuy ? NATIVE_DECIMALS : decimals)
            : null,
          sellContract: isBuy ? null : coin.address,
          buySymbol: isBuy ? coin.symbol : chain.native,
          buyAmount: firm.buyAmount
            ? formatUnits(toBig(firm.buyAmount), isBuy ? decimals : NATIVE_DECIMALS)
            : null,
          buyContract: isBuy ? coin.address : null,
          usdValue: isBuy
            ? usdAmount
            : heldToken
              ? (heldToken.quoteUsd * sellPct) / 100
              : undefined,
        },
      });

      setPhase("success");
      setTimeout(() => refresh(), 4000);
    } catch (e) {
      setExecError(readError(e, chain.native));
      setPhase("error");
    }
  };

  if (!tradable) {
    return (
      <Card variant="warm" pad="md" className="mt-3 flex items-start gap-3">
        <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-bone-faint" />
        <p className="text-xs text-bone-mut">
          In-app trading needs this token&apos;s decimals and a live price, which
          could not be read right now, so we will not guess an amount. Use the
          DEX link above to trade it for the moment.
        </p>
      </Card>
    );
  }

  const decimals = coin.decimals ?? 18;
  const receiveText =
    side === "buy"
      ? `${fmtToken(quote?.buyAmount ?? null, decimals)} ${coin.symbol}`
      : `${fmtToken(quote?.buyAmount ?? null, NATIVE_DECIMALS)} ${chain?.native ?? "ETH"}`;
  const payText =
    side === "buy"
      ? `${fmtToken(quote?.sellAmount ?? null, NATIVE_DECIMALS)} ${chain?.native ?? "ETH"}`
      : `${fmtToken(quote?.sellAmount ?? null, decimals)} ${coin.symbol}`;
  const sellUsd =
    side === "sell" && heldToken
      ? (heldToken.quoteUsd * sellPct) / 100
      : 0;

  const canReview =
    !!walletAddress &&
    !quoteLoading &&
    !!quote &&
    (side === "buy" ? buyRaw > 0n && !needsTopUp : sellRaw > 0n);

  return (
    <Card pad="md" className="mt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="coin" className="h-4 w-4 text-gold" />
          <h2 className="font-display text-base font-semibold text-bone">
            Trade {coin.symbol}
          </h2>
        </div>
        <span className="inline-flex items-center rounded-[--radius-sm] border border-gold/40 bg-panel-warm/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          Beta
        </span>
      </div>

      {/* Buy and sell are two mutually exclusive modes, which is exactly what
          SegmentedControl models. The hand rolled version also lost the arrow
          key handling and the roving tabindex that come with it. */}
      <SegmentedControl
        label="Trade side"
        block
        className="mt-3"
        value={side}
        onValueChange={(next) => {
          setSide(next as "buy" | "sell");
          setQuote(null);
          setQuoteError(null);
        }}
        items={[
          { value: "buy", label: "Buy" },
          { value: "sell", label: "Sell" },
        ]}
      />

      {/* Amount controls */}
      {side === "buy" ? (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {USD_PRESETS.map((p) => {
              const active = usdChoice === p;
              return (
                <Button
                  key={p}
                  size="lg"
                  variant={active ? "glass" : "ghost"}
                  aria-pressed={active}
                  className={
                    active
                      ? "tnum border-gold/60 text-gold-bright"
                      : "tnum border border-steel-line"
                  }
                  onClick={() => {
                    setUsdChoice(p);
                    setCustomUsd("");
                  }}
                >
                  ${p}
                </Button>
              );
            })}
          </div>
          <Field label="Custom amount in USD" className="mt-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-bone-mut">$</span>
              <Input
                inputMode="decimal"
                value={customUsd}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) {
                    setCustomUsd(v);
                    setUsdChoice(null);
                  }
                }}
                placeholder="0"
                className="tnum flex-1 text-right"
              />
              <span className="text-xs font-semibold text-bone-mut">USD</span>
            </div>
          </Field>
        </>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {SELL_PCTS.map((p) => {
              const active = sellPct === p;
              return (
                <Button
                  key={p}
                  size="lg"
                  variant={active ? "glass" : "ghost"}
                  aria-pressed={active}
                  className={
                    active
                      ? "tnum border-ember/60 text-ember-deep"
                      : "tnum border border-steel-line"
                  }
                  onClick={() => setSellPct(p)}
                >
                  {p === 100 ? "Max" : `${p}%`}
                </Button>
              );
            })}
          </div>
          <p className="mt-2.5 text-xs text-bone-faint">
            {heldToken && Number(heldToken.balanceDisplay) > 0
              ? `You hold ${Number(heldToken.balanceDisplay).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${coin.symbol} (${fmtUsd(heldToken.quoteUsd)}).`
              : `You do not hold any ${coin.symbol} on ${coin.chainLabel ?? "this chain"} yet.`}
          </p>
        </>
      )}

      {/* Quote readout */}
      <Card variant="inset" pad="none" className="mt-3 p-3.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-bone-faint">You pay</span>
          <span className="tnum text-bone">
            {quoteLoading ? "..." : quote ? payText : "-"}
            {side === "buy" && usdAmount > 0 && (
              <span className="ml-1.5 text-bone-faint">
                ({fmtUsd(usdAmount)})
              </span>
            )}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-bone-faint">You receive</span>
          <span className="tnum font-semibold text-bone">
            {quoteLoading ? "..." : quote ? receiveText : "-"}
            {side === "sell" && sellUsd > 0 && (
              <span className="ml-1.5 font-normal text-bone-faint">
                ({fmtUsd(sellUsd)})
              </span>
            )}
          </span>
        </div>
        {quoteError && (
          <p role="alert" className="mt-2 text-xs text-state-warning">
            {quoteError}
          </p>
        )}
      </Card>

      {needsTopUp && chain && walletAddress && (
        <Card variant="warm" pad="none" className="mt-3 flex flex-col gap-2 p-3.5">
          <p className="text-xs text-bone-mut">
            To buy {coin.symbol} you need more {chain.native} on {chain.name}.
            Add it with a card in a tap.
          </p>
          <TopUpButton
            chainId={coin.evmChainId}
            walletAddress={walletAddress}
            amountUsd={usdAmount > 0 ? usdAmount : undefined}
          />
        </Card>
      )}

      {/* Primary action */}
      <Button
        variant={side === "buy" ? "gold" : "glass"}
        size="lg"
        block
        className={side === "buy" ? "mt-3" : "mt-3 text-ember-deep"}
        disabled={!canReview}
        onClick={() => setPhase("confirm")}
      >
        {side === "buy" ? (
          <>
            <Icon name="coin" className="h-4 w-4" />
            Buy {coin.symbol}
          </>
        ) : (
          <>
            <Icon name="arrow" className="h-4 w-4" />
            Sell {coin.symbol}
          </>
        )}
      </Button>

      {!walletAddress && (
        <p className="mt-2 text-center text-xs text-state-warning">
          No embedded wallet is ready to trade yet.
        </p>
      )}

      {/* Footer */}
      <p className="mt-3 text-center text-[11px] leading-relaxed text-bone-faint">
        Signed by your own wallet. Non-custodial.{" "}
        {(PLATFORM_FEE_BPS / 100).toFixed(1)}% fee. You approve every trade
        yourself.
      </p>

      {/* Confirm / progress / success overlay */}
      {mounted && phase !== "idle" && chain && (
        <AdaptiveDialog
          open
          onOpenChange={(next) => {
            if (!next) reset();
          }}
          size="md"
          title={
            phase === "success"
              ? `${side === "buy" ? "Bought" : "Sold"} ${coin.symbol}`
              : `${side === "buy" ? "Buy" : "Sell"} ${coin.symbol}`
          }
          description={phase === "success" ? undefined : "Preview"}
        >
          <div>
              {phase === "success" ? (
                <TradeSuccess
                  side={side}
                  symbol={coin.symbol}
                  logo={coin.logo}
                  receive={receiveText}
                  chainId={coin.evmChainId}
                  hash={swapHash}
                  onClose={reset}
                />
              ) : (
                <>
                  <div className="flex flex-col gap-2.5 rounded-[--radius-xl] border border-steel-line bg-void/60 p-4">
                    <Row label="You pay" value={payText} />
                    <Row label="You receive" value={receiveText} strong />
                    {quote?.minBuyAmount && (
                      <Row
                        label="Minimum received"
                        value={`${fmtToken(quote.minBuyAmount, side === "buy" ? decimals : NATIVE_DECIMALS)} ${side === "buy" ? coin.symbol : chain.native}`}
                      />
                    )}
                    <Row
                      label={`Platform fee (${(PLATFORM_FEE_BPS / 100).toFixed(1)}%)`}
                      value={
                        quote?.feeAmount && quote.feeBps > 0
                          ? `${fmtToken(quote.feeAmount, decimals)} ${coin.symbol}`
                          : quote?.feeBps
                            ? `${(quote.feeBps / 100).toFixed(1)}%`
                            : "included"
                      }
                    />
                    {quote?.totalNetworkFee && (
                      <Row
                        label="Network fee (est.)"
                        value={`~${fmtToken(quote.totalNetworkFee, NATIVE_DECIMALS)} ${chain.native}`}
                      />
                    )}
                    <Row label="Network" value={chain.name} />
                  </div>

                  {approvalHash && (
                    <div className="mt-3 rounded-[--radius-lg] border border-gold/25 bg-panel-warm/50 p-3 text-xs text-bone-mut">
                      Approval sent. Once it confirms (about 15 seconds), confirm
                      the swap below.
                    </div>
                  )}

                  {execError && (
                    <p role="alert" className="mt-3 text-xs text-state-warning">
                      {execError}
                    </p>
                  )}

                  <Button
                    variant={side === "buy" ? "gold" : "glass"}
                    size="lg"
                    block
                    className={side === "buy" ? "mt-4" : "mt-4 text-ember-deep"}
                    loading={phase === "swapping" || phase === "approving"}
                    onClick={() => void execute()}
                  >
                    {phase === "approving" ? (
                      "Approving..."
                    ) : phase === "swapping" ? (
                      "Confirm in your wallet..."
                    ) : approvalHash ? (
                      <>
                        <Icon name="coin" className="h-4 w-4" />
                        Confirm swap
                      </>
                    ) : (
                      <>
                        <Icon name="coin" className="h-4 w-4" />
                        Confirm {side}
                      </>
                    )}
                  </Button>

                  <p className="mt-3 text-center text-[11px] text-bone-faint">
                    Signed by your own wallet. Non-custodial. You can cancel in
                    the wallet window.
                  </p>
                </>
              )}
          </div>
        </AdaptiveDialog>
      )}

      {/* The Raven's read + risk banners are rendered by the coin page around
          this panel to keep the trade controls tight. */}
    </Card>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-bone-faint">{label}</span>
      <span
        className={`tnum text-right ${strong ? "font-semibold text-bone" : "text-bone-mut"}`}
      >
        {value}
      </span>
    </div>
  );
}

function TradeSuccess({
  side,
  symbol,
  logo,
  receive,
  chainId,
  hash,
  onClose,
}: {
  side: Side;
  symbol: string;
  logo: string | null;
  receive: string;
  chainId: number;
  hash: string | null;
  onClose: () => void;
}) {
  const explorer = hash ? txExplorerUrlFor(chainId, hash) : null;
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-panel-warm">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-10 w-10 rounded-full" />
        ) : (
          <Icon name="coin" className="h-7 w-7 text-gold" />
        )}
      </span>
      <div>
        <p className="font-display text-lg font-semibold text-bone">
          {side === "buy" ? "Bought" : "Sold"} {symbol}
        </p>
        <p className="mt-1 text-sm text-bone-mut">
          {side === "buy" ? "You received" : "You received"} {receive}. Your
          Vault and Coffers will update as the chain confirms.
        </p>
      </div>
      {hash && (
        <Card variant="inset" pad="none" className="w-full p-3">
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
                variant="glass"
                render={
                  <a href={explorer} target="_blank" rel="noreferrer" />
                }
              >
                <Icon name="arrow" className="h-3.5 w-3.5" />
                View
              </Button>
            )}
          </div>
        </Card>
      )}
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
    return `Your wallet lacks the ${native} to cover this trade and gas.`;
  return msg || "The trade could not be completed.";
}
