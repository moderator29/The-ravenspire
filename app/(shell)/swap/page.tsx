"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from "viem";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { realmFetch } from "@/lib/auth/api";
import { useVaultPrefs } from "@/components/wallet/wallet-prefs";
import { useWalletTokens } from "@/components/wallet/use-wallet-tokens";
import { TokenLogo } from "@/components/wallet/token-logo";
import { txExplorerUrlFor, shortAddress } from "@/components/wallet/chains";
import type { WalletToken } from "@/components/wallet/wallet-token-types";
import {
  NATIVE_TOKEN_SENTINEL,
  PLATFORM_FEE_BPS,
  tradeChainById,
} from "@/lib/trade/config";

/* The Swap: a dedicated surface to trade any EVM coin for any other, in
   platform, non-custodially. The "from" side is one of the member's own
   holdings (so we know its decimals and balance); the "to" side is any EVM
   coin searched by name, symbol or address. Live 0x quote, explicit 0.5% fee,
   minimum received, price impact and gas. Same-chain only in one signature;
   cross-chain intent is guided to a top-up rather than faked. Preview then a
   success screen, both in our design. BETA. */

const SLIPPAGE_BPS = 100;
const NATIVE_DECIMALS = 18;

interface SwapTokenResult {
  address: string;
  symbol: string;
  name: string;
  chainId: number;
  chainLabel: string;
  logo: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
}

interface ToToken extends SwapTokenResult {
  decimals: number | null;
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

type Phase = "idle" | "confirm" | "approving" | "swapping" | "success" | "error";

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
    if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
    if (n >= 0.0001) return n.toFixed(6);
    return n.toPrecision(3);
  } catch {
    return "0";
  }
}

function toBig(raw: string | null | undefined): bigint {
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
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
  const { tokens, refresh } = useWalletTokens(walletAddress, custom);

  const [fromToken, setFromToken] = useState<WalletToken | null>(null);
  const [toToken, setToToken] = useState<ToToken | null>(null);
  const [amount, setAmount] = useState("");

  const [quote, setQuote] = useState<NormalizedQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [execError, setExecError] = useState<string | null>(null);
  const [approvalHash, setApprovalHash] = useState<string | null>(null);
  const approvalSent = useRef(false);
  const [swapHash, setSwapHash] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Default the "from" side to the member's largest holding.
  useEffect(() => {
    if (fromToken || tokens.length === 0) return;
    const withBalance = tokens
      .filter((t) => Number(t.balanceDisplay) > 0)
      .sort((a, b) => b.quoteUsd - a.quoteUsd);
    setFromToken(withBalance[0] ?? tokens[0] ?? null);
  }, [tokens, fromToken]);

  const sellRaw = useMemo(
    () => (fromToken ? parseAmount(amount, fromToken.decimals) : 0n),
    [amount, fromToken]
  );

  const sameChain =
    !!fromToken && !!toToken && fromToken.chainId === toToken.chainId;
  const balanceRaw = useMemo(() => toBig(fromToken?.balanceRaw), [fromToken]);
  const overBalance = sellRaw > balanceRaw;

  const chain = fromToken ? tradeChainById(fromToken.chainId) : undefined;

  const fetchQuote = useCallback(async () => {
    if (!fromToken || !toToken || toToken.decimals === null) {
      setQuote(null);
      return;
    }
    if (!sameChain || sellRaw <= 0n || overBalance) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    const res = await realmFetch<{ quote?: NormalizedQuote; error?: string }>(
      "/api/trade/quote",
      {
        method: "POST",
        json: {
          mode: "price",
          chainId: fromToken.chainId,
          sellToken: fromToken.isNative
            ? NATIVE_TOKEN_SENTINEL
            : fromToken.contract,
          buyToken: toToken.address,
          sellAmount: sellRaw.toString(),
          feeToken: toToken.address,
          slippageBps: SLIPPAGE_BPS,
        },
      }
    );
    if (res.ok && res.data?.quote) {
      setQuote(res.data.quote);
    } else {
      setQuote(null);
      setQuoteError(res.data?.error ?? "No quote right now.");
    }
    setQuoteLoading(false);
  }, [fromToken, toToken, sameChain, sellRaw, overBalance]);

  useEffect(() => {
    const t = setTimeout(() => void fetchQuote(), 350);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  // Price impact from the two known USD prices, honest and derived.
  const priceImpact = useMemo(() => {
    if (
      !fromToken ||
      !toToken ||
      !quote?.buyAmount ||
      !fromToken.priceUsd ||
      !toToken.priceUsd ||
      sellRaw <= 0n
    )
      return null;
    const payUsd =
      Number(formatUnits(sellRaw, fromToken.decimals)) * fromToken.priceUsd;
    const recvUsd =
      Number(formatUnits(toBig(quote.buyAmount), toToken.decimals ?? 18)) *
      toToken.priceUsd;
    if (payUsd <= 0 || recvUsd <= 0) return null;
    return (1 - recvUsd / payUsd) * 100;
  }, [fromToken, toToken, quote, sellRaw]);

  const setMax = () => {
    if (!fromToken) return;
    setAmount(formatUnits(balanceRaw, fromToken.decimals));
  };

  const hydrateTo = async (r: SwapTokenResult) => {
    const c = tradeChainById(r.chainId);
    setToToken({ ...r, decimals: null });
    setPickerOpen(false);
    try {
      const res = await fetch(
        `/api/coin?address=${encodeURIComponent(r.address)}&net=${c?.gecko ?? ""}`
      );
      const body = (await res.json()) as {
        coin?: { decimals?: number | null; priceUsd?: number | null };
      };
      setToToken({
        ...r,
        decimals:
          typeof body.coin?.decimals === "number" ? body.coin.decimals : null,
        priceUsd: body.coin?.priceUsd ?? r.priceUsd,
      });
    } catch {
      setToToken({ ...r, decimals: null });
    }
  };

  const reset = () => {
    setPhase("idle");
    setExecError(null);
    setApprovalHash(null);
    setSwapHash(null);
    approvalSent.current = false;
  };

  const execute = async () => {
    if (!walletAddress || !fromToken || !toToken || !chain) return;
    setExecError(null);
    setPhase("swapping");
    const res = await realmFetch<{ quote?: NormalizedQuote; error?: string }>(
      "/api/trade/quote",
      {
        method: "POST",
        json: {
          mode: "quote",
          chainId: fromToken.chainId,
          sellToken: fromToken.isNative
            ? NATIVE_TOKEN_SENTINEL
            : fromToken.contract,
          buyToken: toToken.address,
          sellAmount: sellRaw.toString(),
          taker: walletAddress,
          feeToken: toToken.address,
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
      await sender?.switchChain?.(fromToken.chainId);
    } catch {
      /* provider may switch inside its own window */
    }

    // ERC-20 "from" needs an approval to the allowance target before the swap.
    if (
      !fromToken.isNative &&
      firm.allowanceNeeded &&
      firm.allowanceTarget &&
      fromToken.contract &&
      !approvalSent.current
    ) {
      try {
        setPhase("approving");
        const approval = await sendTransaction(
          {
            to: fromToken.contract as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [firm.allowanceTarget as `0x${string}`, sellRaw],
            }),
            value: 0n,
            chainId: fromToken.chainId,
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
          chainId: fromToken.chainId,
        },
        { address: walletAddress }
      );
      setSwapHash(result.hash);
      recordTx({
        hash: result.hash,
        chainId: fromToken.chainId,
        to: firm.transaction.to,
        symbol: toToken.symbol,
        amount: firm.buyAmount
          ? formatUnits(toBig(firm.buyAmount), toToken.decimals ?? 18)
          : "0",
        contract: toToken.address,
        at: Date.now(),
      });

      // Record to the platform-wide trade feed (idempotent on the hash).
      const usd =
        fromToken.priceUsd && sellRaw > 0n
          ? Number(formatUnits(sellRaw, fromToken.decimals)) * fromToken.priceUsd
          : undefined;
      void realmFetch("/api/trade/record", {
        method: "POST",
        json: {
          kind: "swap",
          chainId: fromToken.chainId,
          txHash: result.hash,
          sellSymbol: fromToken.symbol,
          sellAmount: amount,
          sellContract: fromToken.isNative ? null : fromToken.contract,
          buySymbol: toToken.symbol,
          buyAmount: firm.buyAmount
            ? formatUnits(toBig(firm.buyAmount), toToken.decimals ?? 18)
            : null,
          buyContract: toToken.address,
          usdValue: usd,
        },
      });

      setPhase("success");
      setTimeout(() => refresh(), 4000);
    } catch (e) {
      setExecError(readError(e, chain.native));
      setPhase("error");
    }
  };

  const receiveText = toToken
    ? `${fmtToken(quote?.buyAmount ?? null, toToken.decimals ?? 18)} ${toToken.symbol}`
    : "-";
  const payUsd =
    fromToken && fromToken.priceUsd && sellRaw > 0n
      ? Number(formatUnits(sellRaw, fromToken.decimals)) * fromToken.priceUsd
      : 0;

  const canReview =
    !!walletAddress &&
    !!fromToken &&
    !!toToken &&
    toToken.decimals !== null &&
    sameChain &&
    sellRaw > 0n &&
    !overBalance &&
    !quoteLoading &&
    !!quote;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <div className="flex items-center gap-2.5">
        <h1 className="font-display text-xl font-semibold text-bone">
          The Swap
        </h1>
        <span className="inline-flex items-center rounded-full border border-gold/40 bg-panel-warm/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          Beta
        </span>
      </div>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Trade any EVM coin
      </p>
      <p className="mt-3 text-sm text-bone-mut">
        Swap from your holdings into any coin on any EVM chain, non-custodially.
        You approve every trade in your own wallet. {(PLATFORM_FEE_BPS / 100).toFixed(1)}% fee.
      </p>

      {/* From */}
      <div className="glass mt-5 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            From
          </span>
          {fromToken && (
            <button
              type="button"
              onClick={setMax}
              className="text-xs font-medium text-gold hover:underline"
            >
              Max{" "}
              {Number(fromToken.balanceDisplay).toLocaleString("en-US", {
                maximumFractionDigits: 4,
              })}{" "}
              {fromToken.symbol}
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <FromSelector
            tokens={tokens}
            value={fromToken}
            onChange={(t) => {
              setFromToken(t);
              setQuote(null);
            }}
          />
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
            }}
            placeholder="0.0"
            className={`tnum min-w-0 flex-1 bg-transparent text-right font-display text-2xl text-bone placeholder-bone-faint outline-none ${
              overBalance ? "text-ember" : ""
            }`}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-bone-faint">
          <span>{chain?.name ?? fromToken?.chainName ?? ""}</span>
          {payUsd > 0 && <span className="tnum">{fmtUsd(payUsd)}</span>}
        </div>
        {overBalance && (
          <p className="mt-1 text-xs text-ember">
            That is more than your {fromToken?.symbol} balance.
          </p>
        )}
      </div>

      {/* To */}
      <div className="glass mt-2.5 p-4">
        <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
          To
        </span>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="btn-glass inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm"
          >
            {toToken ? (
              <>
                <TokenLogo logo={toToken.logo} symbol={toToken.symbol} size={22} />
                <span className="font-semibold text-bone">{toToken.symbol}</span>
                <Icon name="dots" className="h-3.5 w-3.5 text-bone-faint" />
              </>
            ) : (
              <>
                <Icon name="search" className="h-4 w-4 text-gold" />
                <span className="text-bone-mut">Select a coin</span>
              </>
            )}
          </button>
          <span className="tnum min-w-0 flex-1 text-right font-display text-2xl text-bone">
            {quoteLoading ? "..." : toToken ? fmtToken(quote?.buyAmount ?? null, toToken.decimals ?? 18) : "0.0"}
          </span>
        </div>
        {toToken && (
          <div className="mt-1 flex items-center justify-between text-xs text-bone-faint">
            <span>{toToken.chainLabel}</span>
            {toToken.decimals === null && (
              <span className="text-ember">Reading token details...</span>
            )}
          </div>
        )}
      </div>

      {/* Cross-chain guidance */}
      {fromToken && toToken && !sameChain && (
        <div className="glass-warm mt-2.5 flex items-start gap-3 p-4">
          <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p className="text-xs text-bone-mut">
            {fromToken.symbol} sits on {fromToken.chainName} and {toToken.symbol}{" "}
            is on {toToken.chainLabel}. A single swap cannot cross chains. Pick a
            coin on {fromToken.chainName}, choose a holding on {toToken.chainLabel},
            or top up {toToken.chainLabel} with a card from the coin page.
          </p>
        </div>
      )}

      {/* Quote details */}
      {sameChain && (quote || quoteError) && (
        <div className="glass mt-2.5 p-4">
          {quoteError ? (
            <p className="text-xs text-ember">{quoteError}</p>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <Row label="You receive" value={receiveText} strong />
              {quote?.minBuyAmount && toToken && (
                <Row
                  label="Minimum received"
                  value={`${fmtToken(quote.minBuyAmount, toToken.decimals ?? 18)} ${toToken.symbol}`}
                />
              )}
              {priceImpact !== null && (
                <Row
                  label="Price impact"
                  value={`${priceImpact >= 0 ? "" : "+"}${(-priceImpact).toFixed(2)}%`}
                  warn={priceImpact > 5}
                />
              )}
              <Row
                label={`Platform fee (${(PLATFORM_FEE_BPS / 100).toFixed(1)}%)`}
                value={
                  quote?.feeAmount && toToken
                    ? `${fmtToken(quote.feeAmount, toToken.decimals ?? 18)} ${toToken.symbol}`
                    : "included"
                }
              />
              {quote?.totalNetworkFee && chain && (
                <Row
                  label="Network fee (est.)"
                  value={`~${fmtToken(quote.totalNetworkFee, NATIVE_DECIMALS)} ${chain.native}`}
                />
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={!canReview}
        onClick={() => setPhase("confirm")}
        className="btn-gold mt-3 w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="repost" className="h-4 w-4" />
        Review swap
      </button>

      {!walletAddress && (
        <p className="mt-2 text-center text-xs text-ember">
          No embedded wallet is ready to swap yet.
        </p>
      )}

      <p className="mt-3 text-center text-[11px] text-bone-faint">
        Signed by your own wallet. Non-custodial. You approve every swap yourself.
      </p>

      {/* Token picker */}
      {mounted && pickerOpen && (
        <TokenPicker onClose={() => setPickerOpen(false)} onPick={hydrateTo} />
      )}

      {/* Confirm / success overlay */}
      {mounted &&
        phase !== "idle" &&
        chain &&
        fromToken &&
        toToken &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-stretch justify-center sm:items-center sm:p-4">
            <button
              aria-label="Close"
              onClick={reset}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <div className="glass glass-warm relative flex h-full w-full flex-col overflow-y-auto p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] sm:h-auto sm:max-w-md sm:pt-6">
              {phase === "success" ? (
                <SwapSuccess
                  fromSymbol={fromToken.symbol}
                  toToken={toToken}
                  receive={receiveText}
                  chainId={fromToken.chainId}
                  hash={swapHash}
                  onClose={reset}
                />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
                        Swap · Preview
                      </p>
                      <h3 className="mt-1 font-display text-lg font-semibold text-bone">
                        {fromToken.symbol} to {toToken.symbol}
                      </h3>
                    </div>
                    <button
                      aria-label="Close"
                      onClick={reset}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-bone-faint transition hover:bg-panel hover:text-bone-mut"
                    >
                      <Icon name="plus" className="h-4 w-4 rotate-45" />
                    </button>
                  </div>

                  <div className="mt-4 flex flex-col gap-2.5 rounded-2xl border border-steel-line bg-void/60 p-4">
                    <Row
                      label="You pay"
                      value={`${amount} ${fromToken.symbol}`}
                    />
                    <Row label="You receive" value={receiveText} strong />
                    {quote?.minBuyAmount && (
                      <Row
                        label="Minimum received"
                        value={`${fmtToken(quote.minBuyAmount, toToken.decimals ?? 18)} ${toToken.symbol}`}
                      />
                    )}
                    {priceImpact !== null && (
                      <Row
                        label="Price impact"
                        value={`${(-priceImpact).toFixed(2)}%`}
                        warn={priceImpact > 5}
                      />
                    )}
                    <Row
                      label={`Platform fee (${(PLATFORM_FEE_BPS / 100).toFixed(1)}%)`}
                      value={
                        quote?.feeAmount
                          ? `${fmtToken(quote.feeAmount, toToken.decimals ?? 18)} ${toToken.symbol}`
                          : "included"
                      }
                    />
                    <Row label="Network" value={chain.name} />
                  </div>

                  {approvalHash && (
                    <div className="mt-3 rounded-xl border border-gold/25 bg-panel-warm/50 p-3 text-xs text-bone-mut">
                      Approval sent. Once it confirms (about 15 seconds), confirm
                      the swap below.
                    </div>
                  )}

                  {execError && (
                    <p className="mt-3 text-xs text-ember">{execError}</p>
                  )}

                  <button
                    type="button"
                    disabled={phase === "swapping" || phase === "approving"}
                    onClick={() => void execute()}
                    className="btn-gold mt-4 w-full py-3 text-sm disabled:opacity-60"
                  >
                    {phase === "approving" ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                        Approving...
                      </>
                    ) : phase === "swapping" ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#171204]/40 border-t-[#171204]" />
                        Confirm in your wallet...
                      </>
                    ) : approvalHash ? (
                      <>
                        <Icon name="repost" className="h-4 w-4" />
                        Confirm swap
                      </>
                    ) : (
                      <>
                        <Icon name="repost" className="h-4 w-4" />
                        Confirm swap
                      </>
                    )}
                  </button>

                  <p className="mt-3 text-center text-[11px] text-bone-faint">
                    Signed by your own wallet. Non-custodial. Cancel any time in
                    the wallet window.
                  </p>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-bone-faint">{label}</span>
      <span
        className={`tnum text-right ${
          warn
            ? "text-ember"
            : strong
              ? "font-semibold text-bone"
              : "text-bone-mut"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function FromSelector({
  tokens,
  value,
  onChange,
}: {
  tokens: WalletToken[];
  value: WalletToken | null;
  onChange: (t: WalletToken) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-glass inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm"
      >
        {value ? (
          <>
            <TokenLogo logo={value.logo} symbol={value.symbol} size={22} />
            <span className="font-semibold text-bone">{value.symbol}</span>
          </>
        ) : (
          <span className="text-bone-mut">Token</span>
        )}
        <Icon name="dots" className="h-3.5 w-3.5 text-bone-faint" />
      </button>
      {open && (
        <>
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40"
          />
          <div className="absolute left-0 z-50 mt-1.5 max-h-72 w-60 overflow-y-auto rounded-2xl border border-steel-line bg-panel p-1.5 shadow-xl">
            {tokens.length === 0 ? (
              <p className="px-3 py-2 text-xs text-bone-faint">
                No holdings to swap from yet.
              </p>
            ) : (
              tokens.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    onChange(t);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-panel-warm/60"
                >
                  <TokenLogo logo={t.logo} symbol={t.symbol} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-bone">
                      {t.symbol}
                    </p>
                    <p className="truncate text-[11px] text-bone-faint">
                      {t.chainName}
                    </p>
                  </div>
                  <span className="tnum shrink-0 text-xs text-bone-mut">
                    {Number(t.balanceDisplay).toLocaleString("en-US", {
                      maximumFractionDigits: 3,
                    })}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TokenPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (t: SwapTokenResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SwapTokenResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await realmFetch<{ results?: SwapTokenResult[] }>(
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
  }, [query]);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-stretch justify-center sm:items-center sm:p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="glass glass-warm relative flex h-full w-full flex-col overflow-hidden p-5 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:h-[70vh] sm:max-w-md sm:pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-bone">
            Select a coin
          </h3>
          <button
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-bone-faint hover:bg-panel hover:text-bone-mut"
          >
            <Icon name="plus" className="h-4 w-4 rotate-45" />
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-2xl border border-steel-line bg-void px-3.5 py-2.5 focus-within:border-gold/40">
          <Icon name="search" className="h-4 w-4 text-bone-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, symbol or address"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm text-bone placeholder-bone-faint outline-none"
          />
        </label>

        <div className="mt-3 flex-1 overflow-y-auto">
          {searching ? (
            <div className="flex items-center gap-2 px-1 py-3 text-sm text-bone-faint">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
              Searching the chains...
            </div>
          ) : query.trim().length < 2 ? (
            <p className="px-1 py-3 text-sm text-bone-faint">
              Search any coin on any EVM chain. Solana is not tradable here.
            </p>
          ) : results.length === 0 ? (
            <p className="px-1 py-3 text-sm text-bone-faint">
              No EVM coin found for that above the liquidity floor.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {results.map((r) => (
                <button
                  key={`${r.chainId}:${r.address}`}
                  type="button"
                  onClick={() => onPick(r)}
                  className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-panel-warm/60"
                >
                  <TokenLogo logo={r.logo} symbol={r.symbol} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-bone">
                      {r.symbol}
                    </p>
                    <p className="truncate text-[11px] text-bone-faint">
                      {r.name} · {r.chainLabel}
                    </p>
                  </div>
                  {r.liquidityUsd !== null && (
                    <span className="tnum shrink-0 text-[11px] text-bone-faint">
                      {fmtUsd(r.liquidityUsd)} liq
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function SwapSuccess({
  fromSymbol,
  toToken,
  receive,
  chainId,
  hash,
  onClose,
}: {
  fromSymbol: string;
  toToken: ToToken;
  receive: string;
  chainId: number;
  hash: string | null;
  onClose: () => void;
}) {
  const explorer = hash ? txExplorerUrlFor(chainId, hash) : null;
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-panel-warm">
        <TokenLogo logo={toToken.logo} symbol={toToken.symbol} size={40} />
      </span>
      <div>
        <p className="font-display text-lg font-semibold text-bone">
          Swapped {fromSymbol} to {toToken.symbol}
        </p>
        <p className="mt-1 text-sm text-bone-mut">
          You received {receive}. Your Vault and Coffers will update as the chain
          confirms.
        </p>
      </div>
      {hash && (
        <div className="w-full rounded-2xl border border-steel-line bg-panel/50 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            Transaction
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <code className="tnum min-w-0 truncate font-mono text-xs text-bone-mut">
              {shortAddress(hash, 10, 8)}
            </code>
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                className="btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <Icon name="arrow" className="h-3.5 w-3.5" />
                View
              </a>
            )}
          </div>
        </div>
      )}
      <button onClick={onClose} className="btn-gold w-full py-2.5 text-sm">
        Done
      </button>
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
