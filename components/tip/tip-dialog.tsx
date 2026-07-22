"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { parseEther } from "viem";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";
import { TipSuccessCard } from "@/components/tip/tip-success-card";
import {
  parseChainId,
  resolveChain,
  TIP_PRESETS,
} from "@/components/tip/chain";

type Phase = "loading" | "amount" | "sending" | "success" | "error";

/* Premium tribute flow. Reads the recipient's linked wallet, lets the tipper
   choose a native-token amount, sends a REAL transfer from their Privy embedded
   wallet, then records the tip and celebrates. Non-custodial throughout: the
   coin moves wallet to wallet and THE RAVENSPIRE only writes the receipt. */
export function TipDialog({
  recipientId,
  recipientName,
  subjectType,
  subjectId,
  onClose,
  onSent,
}: {
  recipientId: string;
  recipientName: string;
  subjectType?: string;
  subjectId?: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();

  const [phase, setPhase] = useState<Phase>("loading");
  const [recipientWallet, setRecipientWallet] = useState<string | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string>("");
  const [sentAmount, setSentAmount] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  /* Portal to the body so the overlay is never trapped inside a transformed
     card ancestor (which pinned it to the top of the page); lock body scroll
     so the tribute reads as a full page, not a floating tab. */
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* The tipper's embedded wallet decides the chain. If none is present (they
     signed in with an external wallet), fall back to the first connected one. */
  const sender = useMemo(() => {
    const embedded = wallets.find(
      (w) =>
        w.walletClientType === "privy" ||
        w.walletClientType === "privy-v2" ||
        w.connectorType === "embedded"
    );
    return embedded ?? wallets[0] ?? null;
  }, [wallets]);

  const chainId = useMemo(
    () => parseChainId(sender?.chainId ?? null),
    [sender]
  );
  const chain = resolveChain(chainId);

  /* Look up the recipient's linked wallet the moment the dialog opens. */
  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setError(null);
    void (async () => {
      const res = await realmFetch<{ wallet_address?: string | null }>(
        `/api/tips?to=${encodeURIComponent(recipientId)}`
      );
      if (cancelled) return;
      const wallet = res.data?.wallet_address ?? null;
      if (!wallet) {
        setError(
          `${recipientName} has not linked a wallet yet, so tribute cannot reach them.`
        );
        setPhase("error");
        return;
      }
      setRecipientWallet(wallet);
      setPhase("amount");
    })();
    return () => {
      cancelled = true;
    };
  }, [recipientId, recipientName]);

  const amountStr = choice !== null ? String(choice) : custom.trim();
  const amountValid = /^\d*\.?\d+$/.test(amountStr) && Number(amountStr) > 0;

  const selfTip = useMemo(() => {
    if (!recipientWallet || !sender?.address) return false;
    return recipientWallet.toLowerCase() === sender.address.toLowerCase();
  }, [recipientWallet, sender]);

  const confirm = async () => {
    if (!recipientWallet || !amountValid || selfTip) return;
    let value: bigint;
    try {
      value = parseEther(amountStr);
    } catch {
      setError("That amount could not be read. Try a smaller, simpler number.");
      return;
    }
    if (value <= 0n) return;

    setPhase("sending");
    setError(null);

    let hash: string;
    try {
      const result = await sendTransaction(
        {
          to: recipientWallet,
          value,
          ...(chainId != null ? { chainId } : {}),
        },
        sender?.address ? { address: sender.address } : undefined
      );
      hash = result.hash;
    } catch (e) {
      const message =
        e instanceof Error && /reject|denied|cancel/i.test(e.message)
          ? "The tribute was cancelled."
          : e instanceof Error && /insufficient|funds|balance/i.test(e.message)
            ? `Your wallet lacks the ${chain.symbol} to cover this tribute and gas.`
            : "The transfer could not be completed. Nothing was sent.";
      setError(message);
      setPhase("error");
      return;
    }

    setTxHash(hash);
    setSentAmount(amountStr);

    /* Record the receipt. The on-chain transfer is the source of truth, so a
       failed write here does not undo a successful tribute; we still celebrate,
       and the unique tx_hash index makes a later retry idempotent. */
    await realmFetch("/api/tips", {
      method: "POST",
      json: {
        to: recipientId,
        subject_type: subjectType ?? null,
        subject_id: subjectId ?? null,
        amount: amountStr,
        token: chain.symbol,
        tx_hash: hash,
        chain_id: chainId,
      },
    });

    onSent?.();
    setPhase("success");
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center sm:items-center sm:p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {phase === "success" ? (
        <div className="relative flex w-full items-center justify-center p-3 sm:max-w-md sm:p-0">
          <TipSuccessCard
            amount={sentAmount}
            symbol={chain.symbol}
            chainId={chainId}
            txHash={txHash}
            recipientName={recipientName}
            onClose={onClose}
          />
        </div>
      ) : (
        <div className="glass glass-warm relative flex h-full w-full flex-col overflow-y-auto p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] sm:h-auto sm:max-w-md sm:pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
                Pay tribute
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold text-bone">
                Tip {recipientName}
              </h2>
            </div>
            <button
              aria-label="Close"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-bone-faint transition hover:bg-panel hover:text-bone-mut"
            >
              <Icon name="plus" className="h-4 w-4 rotate-45" />
            </button>
          </div>

          {phase === "loading" && (
            <div className="mt-6 flex items-center gap-3 text-sm text-bone-faint">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
              Finding their wallet...
            </div>
          )}

          {phase === "error" && (
            <div className="mt-5">
              <div className="glass-sm flex items-start gap-3 rounded-xl border border-ember-deep/40 bg-panel p-3 text-xs text-bone-mut">
                <Icon
                  name="shield"
                  className="h-4 w-4 shrink-0 text-ember-deep"
                />
                <span>{error ?? "Something went awry."}</span>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                {recipientWallet && (
                  <button
                    onClick={() => {
                      setError(null);
                      setPhase("amount");
                    }}
                    className="btn-glass px-4 py-2 text-xs text-bone-mut"
                  >
                    Try again
                  </button>
                )}
                <button onClick={onClose} className="btn-gold px-5 py-2 text-xs">
                  Close
                </button>
              </div>
            </div>
          )}

          {(phase === "amount" || phase === "sending") && (
            <>
              <p className="mt-4 text-xs text-bone-faint">
                A real, wallet-to-wallet transfer of{" "}
                <span className="text-bone-mut">{chain.symbol}</span> on{" "}
                {chain.name}. You pay network gas; THE RAVENSPIRE takes nothing.
              </p>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {TIP_PRESETS.map((p) => {
                  const active = choice === p;
                  return (
                    <button
                      key={p}
                      disabled={phase === "sending"}
                      onClick={() => {
                        setChoice(p);
                        setCustom("");
                      }}
                      className={`tnum rounded-xl border px-2 py-2.5 text-center text-xs transition disabled:opacity-50 ${
                        active
                          ? "border-gold/60 bg-panel-warm text-gold-bright"
                          : "border-steel-line bg-void text-bone-mut hover:border-gold/40"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <label className="mt-3 flex items-center gap-2 rounded-xl border border-steel-line bg-void px-3 py-2 focus-within:border-gold/40">
                <span className="text-xs text-bone-faint">Custom</span>
                <input
                  inputMode="decimal"
                  value={custom}
                  disabled={phase === "sending"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d*\.?\d*$/.test(v)) {
                      setCustom(v);
                      setChoice(null);
                    }
                  }}
                  placeholder="0.00"
                  className="tnum min-w-0 flex-1 bg-transparent text-right text-sm text-bone placeholder-bone-faint outline-none"
                />
                <span className="text-xs font-semibold text-bone-mut">
                  {chain.symbol}
                </span>
              </label>

              {selfTip && (
                <p className="mt-3 text-xs text-ember">
                  This is your own wallet. Tribute is for others.
                </p>
              )}

              <button
                onClick={confirm}
                disabled={!amountValid || selfTip || phase === "sending"}
                className="btn-gold mt-5 w-full py-2.5 text-sm disabled:opacity-50"
              >
                {phase === "sending" ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#171204]/40 border-t-[#171204]" />
                    Sending tribute...
                  </>
                ) : (
                  <>
                    <Icon name="coin" className="h-4 w-4" />
                    Send{amountValid ? ` ${amountStr} ${chain.symbol}` : " tribute"}
                  </>
                )}
              </button>

              {phase === "sending" && (
                <p className="mt-3 text-center text-[11px] text-bone-faint">
                  Confirm in your wallet. Do not close this window.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
