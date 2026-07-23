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
   or a live search of any coin by ticker or contract address. BETA. */

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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    const res = await realmFetch<{ quote?: NormalizedQuote; error?: string }>(
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
      setQuoteError(res.data?.error ?? "No quote right now.");
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
    <div className="mx-auto w-full max-w-xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <div className="flex items-center gap-2.5">
        <h1 className="font-display text-xl font-semibold text-bone">The Swap</h1>
        <span className="inline-flex items-center rounded-full border border-gold/40 bg-panel-warm/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          Beta
        </span>
      </div>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Trade any EVM coin
      </p>

      {/* Network chips */}
      <div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TRADE_CHAINS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => switchChain(c.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              chainId === c.id
                ? "border-gold/60 bg-panel-warm text-gold-bright"
                : "border-steel-line bg-void text-bone-mut hover:border-gold/40"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* From */}
      <div className="glass mt-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            You pay
          </span>
          <span className="text-[11px] text-bone-faint">
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
                className="ml-1.5 font-semibold text-gold hover:underline"
              >
                Max
              </button>
            )}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <TokenSelect token={from} onClick={() => setPickerSide("from")} />
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
            }}
            placeholder="0"
            className={`tnum min-w-0 flex-1 bg-transparent text-right font-display text-2xl outline-none placeholder-bone-faint ${
              overBalance ? "text-ember" : "text-bone"
            }`}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-bone-faint">
          <span>{chain?.name}</span>
          {payUsd !== null && <span className="tnum">{fmtUsd(payUsd)}</span>}
        </div>
        {overBalance && (
          <p className="mt-1 text-xs text-ember">
            More than your {from.symbol} balance.
          </p>
        )}
      </div>

      {/* Flip */}
      <div className="relative z-10 -my-2.5 flex justify-center">
        <button
          type="button"
          onClick={flip}
          aria-label="Swap direction"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-steel-line bg-panel text-gold transition hover:border-gold/50"
        >
          <Icon name="repost" className="h-4 w-4" />
        </button>
      </div>

      {/* To */}
      <div className="glass p-4">
        <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
          You receive
        </span>
        <div className="mt-2 flex items-center gap-3">
          <TokenSelect token={to} onClick={() => setPickerSide("to")} />
          <span className="tnum min-w-0 flex-1 truncate text-right font-display text-2xl text-bone">
            {quoteLoading
              ? "..."
              : quote
                ? fmtToken(quote.buyAmount, to.decimals)
                : "0"}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-bone-faint">
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
      </div>

      {/* Rate + fee line */}
      {quote && rate !== null && (
        <div className="mt-2 flex items-center justify-between rounded-xl border border-steel-line bg-void/60 px-3.5 py-2 text-xs text-bone-mut">
          <span className="tnum">
            1 {from.symbol} ={" "}
            {rate >= 1
              ? rate.toLocaleString("en-US", { maximumFractionDigits: 2 })
              : rate.toPrecision(3)}{" "}
            {to.symbol}
          </span>
          <span className="text-bone-faint">
            {(PLATFORM_FEE_BPS / 100).toFixed(1)}% fee
          </span>
        </div>
      )}

      {quoteError && sellRaw > 0n && (
        <p className="mt-2 text-xs text-ember">{quoteError}</p>
      )}

      <button
        type="button"
        disabled={!canReview}
        onClick={() => setPhase("confirm")}
        className="btn-gold mt-3 w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="repost" className="h-4 w-4" />
        {overBalance ? `Not enough ${from.symbol}` : "Review swap"}
      </button>

      {!walletAddress && (
        <p className="mt-2 text-center text-xs text-ember">
          No embedded wallet is ready to swap yet.
        </p>
      )}
      <p className="mt-3 text-center text-[11px] text-bone-faint">
        Signed by your own wallet. Non-custodial. Best price via 0x across
        Uniswap and every major DEX.
      </p>

      {mounted && pickerSide && (
        <TokenPicker
          side={pickerSide}
          chainId={chainId}
          held={heldTokens}
          onClose={() => setPickerSide(null)}
          onPick={(t) => pickToken(pickerSide, t)}
        />
      )}

      {mounted &&
        phase !== "idle" &&
        chain &&
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
                  from={from}
                  to={to}
                  receive={`${fmtToken(quote?.buyAmount ?? null, to.decimals)} ${to.symbol}`}
                  chainId={chainId}
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
                        {from.symbol} to {to.symbol}
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
                    <Row label="You pay" value={`${amount} ${from.symbol}`} />
                    <Row
                      label="You receive"
                      value={`${fmtToken(quote?.buyAmount ?? null, to.decimals)} ${to.symbol}`}
                      strong
                    />
                    {quote?.minBuyAmount && (
                      <Row
                        label="Minimum received"
                        value={`${fmtToken(quote.minBuyAmount, to.decimals)} ${to.symbol}`}
                      />
                    )}
                    <Row
                      label={`Platform fee (${(PLATFORM_FEE_BPS / 100).toFixed(1)}%)`}
                      value={
                        quote?.feeAmount
                          ? `${fmtToken(quote.feeAmount, to.decimals)} ${to.symbol}`
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
                    {/* Order routing */}
                    <div className="mt-1 flex items-center justify-between border-t border-steel-line pt-2.5 text-[11px] text-bone-faint">
                      <span>Route</span>
                      <span className="flex items-center gap-1.5">
                        {from.symbol}
                        <Icon name="arrow" className="h-3 w-3" />
                        <span className="rounded bg-panel px-1.5 py-0.5 text-gold">
                          0x
                        </span>
                        <Icon name="arrow" className="h-3 w-3" />
                        {to.symbol}
                      </span>
                    </div>
                  </div>

                  {approvalHash && (
                    <div className="mt-3 rounded-xl border border-gold/25 bg-panel-warm/50 p-3 text-xs text-bone-mut">
                      Approval sent. Once it confirms (about 15 seconds), confirm
                      the swap below.
                    </div>
                  )}
                  {execError && <p className="mt-3 text-xs text-ember">{execError}</p>}

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
                    ) : (
                      <>
                        <Icon name="repost" className="h-4 w-4" />
                        Confirm swap
                      </>
                    )}
                  </button>
                  <p className="mt-3 text-center text-[11px] text-bone-faint">
                    Signed by your own wallet. Non-custodial.
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

function TokenSelect({
  token,
  onClick,
}: {
  token: TokenRef;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-glass inline-flex shrink-0 items-center gap-2 rounded-full py-2 pl-2 pr-3 text-sm"
    >
      <TokenLogo logo={token.logo} symbol={token.symbol} size={24} />
      <span className="font-semibold text-bone">{token.symbol}</span>
      <Icon name="dots" className="h-3.5 w-3.5 text-bone-faint" />
    </button>
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

function TokenPicker({
  side,
  chainId,
  held,
  onClose,
  onPick,
}: {
  side: "from" | "to";
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

  /* The live active-coin roll for the selected chain, so the picker opens like
     a real DEX token list rather than a handful of majors. Refetched when the
     chain changes. */
  useEffect(() => {
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
  }, [chainId]);

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
  }, [query]);

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

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-stretch justify-center sm:items-center sm:p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="glass glass-warm relative flex h-full w-full flex-col overflow-hidden p-5 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:h-[72vh] sm:max-w-md sm:pt-5">
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
            placeholder="Ticker, name or contract address"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm text-bone placeholder-bone-faint outline-none"
          />
        </label>

        <div className="mt-3 flex-1 overflow-y-auto">
          {query.trim().length >= 2 ? (
            searching ? (
              <Loading />
            ) : results.length === 0 ? (
              <Empty text="No coin found for that. Try the full contract address." />
            ) : (
              <Section label="Search results">
                {results.map((r) => (
                  <Choice
                    key={`${r.chainId}:${r.address}`}
                    logo={r.logo}
                    symbol={r.symbol}
                    sub={`${r.name} · ${r.chainLabel}`}
                    right={
                      r.priceUsd !== null
                        ? r.priceUsd >= 1
                          ? `$${r.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                          : `$${r.priceUsd.toPrecision(2)}`
                        : undefined
                    }
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
                  <Loading />
                ) : activeCoins.length === 0 ? (
                  <Empty text="No live coins could be read for this chain right now." />
                ) : (
                  activeCoins.map((r) => (
                    <Choice
                      key={`${r.chainId}:${r.address}`}
                      logo={r.logo}
                      symbol={r.symbol}
                      sub={`${r.name} · ${r.chainLabel}`}
                      right={
                        r.priceUsd !== null && r.priceUsd !== undefined
                          ? r.priceUsd >= 1
                            ? `$${r.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                            : `$${r.priceUsd.toPrecision(2)}`
                          : undefined
                      }
                      onClick={() => pickResult(r)}
                    />
                  ))
                )}
              </Section>
            </>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-bone-faint">
          {side === "from" ? "Paying with" : "Receiving"} on EVM chains only.
        </p>
      </div>
    </div>,
    document.body
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
    <div className="mb-4">
      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
        {label}
      </p>
      <div className="flex flex-col gap-1">{children}</div>
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
      className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-panel-warm/60"
    >
      <TokenLogo logo={logo} symbol={symbol} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-bone">{symbol}</p>
        <p className="truncate text-[11px] text-bone-faint">{sub}</p>
      </div>
      {right && (
        <span className="tnum shrink-0 text-xs text-bone-mut">{right}</span>
      )}
    </button>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 px-1 py-3 text-sm text-bone-faint">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
      Searching the chains...
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="px-1 py-3 text-sm text-bone-faint">{text}</p>;
}

function SwapSuccess({
  from,
  to,
  receive,
  chainId,
  hash,
  onClose,
}: {
  from: TokenRef;
  to: TokenRef;
  receive: string;
  chainId: number;
  hash: string | null;
  onClose: () => void;
}) {
  const explorer = hash ? txExplorerUrlFor(chainId, hash) : null;
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-panel-warm">
        <TokenLogo logo={to.logo} symbol={to.symbol} size={40} />
      </span>
      <div>
        <p className="font-display text-lg font-semibold text-bone">
          Swapped {from.symbol} to {to.symbol}
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
