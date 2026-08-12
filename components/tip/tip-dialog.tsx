"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { isAddress, parseEther } from "viem";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
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

  /* `AdaptiveDialog` owns the portal, the scroll lock, the focus trap, focus
     restore and the Escape handling that this component used to approximate by
     hand, and it renders as a bottom sheet on a phone rather than a full bleed
     panel. All that is left here is waiting for the client so the dialog is
     never opened during prerender. */
  useEffect(() => {
    setMounted(true);
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
      /* Guard the address before we ever hand it to the wallet: a malformed or
         non-EVM address would otherwise surface as a raw "invalid" error mid
         send. Better to say so plainly up front. */
      if (!isAddress(wallet.trim())) {
        setError(
          `${recipientName}'s linked wallet could not be read as a valid address, so tribute cannot be sent safely.`
        );
        setPhase("error");
        return;
      }
      setRecipientWallet(wallet.trim());
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
    /* No signing wallet yet: the embedded wallet is still waking. Say so
       instead of letting the send throw a cryptic "invalid" error. */
    if (!sender?.address || !isAddress(sender.address)) {
      setError("Your wallet is still connecting. Give it a moment and try again.");
      setPhase("error");
      return;
    }
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
          to: recipientWallet as `0x${string}`,
          value,
          ...(chainId != null ? { chainId } : {}),
        },
        { address: sender.address }
      );
      hash = result.hash;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const message = /reject|denied|cancel|user rejected/i.test(msg)
        ? "The tribute was cancelled."
        : /insufficient|funds|balance|exceeds/i.test(msg)
          ? `Your wallet lacks the ${chain.symbol} to cover this tribute and gas.`
          : /chain|network|unsupported/i.test(msg)
            ? `Your wallet is on a network tribute cannot use right now. Switch to ${chain.name} and try again.`
            : /invalid|address|argument/i.test(msg)
              ? "The transfer details could not be validated. Nothing was sent."
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

  /* Success is a Ceremony, not a dialog, so it deliberately does not go through
     AdaptiveDialog. That primitive always draws a titled header, which would
     sit directly above the card's own "Tribute sent" heading and say the same
     thing twice. It still portals to the body, because the overlay was
     otherwise trapped inside a transformed card ancestor and pinned to the top
     of the page, which is the bug the original hand rolled portal existed to
     fix and which is worth keeping fixed. */
  if (phase === "success") {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tribute sent to ${recipientName}`}
        className="fixed inset-0 z-modal flex items-center justify-center p-4"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"
        />
        <div className="relative w-full max-w-md">
          <TipSuccessCard
            amount={sentAmount}
            symbol={chain.symbol}
            chainId={chainId}
            txHash={txHash}
            recipientName={recipientName}
            onClose={onClose}
          />
        </div>
      </div>,
      document.body
    );
  }

  return (
    <AdaptiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`Tip ${recipientName}`}
      description="Pay tribute"
      size="md"
    >
      {phase === "loading" && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
          <p className="text-sm text-bone-faint">Finding their wallet...</p>
        </div>
      )}

      {phase === "error" && (
        <div>
          <Card
            variant="inset"
            pad="sm"
            tone="danger"
            role="alert"
            className="flex items-start gap-3 text-xs text-bone-mut"
          >
            <Icon name="alert" className="h-4 w-4 shrink-0 text-state-danger" />
            <span>{error ?? "Something went awry."}</span>
          </Card>
          <div className="mt-5 flex justify-end gap-2">
            {recipientWallet && (
              <Button
                variant="glass"
                size="md"
                onClick={() => {
                  setError(null);
                  setPhase("amount");
                }}
              >
                Try again
              </Button>
            )}
            <Button variant="gold" size="md" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}

      {(phase === "amount" || phase === "sending") && (
        <>
          <p className="text-xs text-bone-faint">
            A real, wallet to wallet transfer of{" "}
            <span className="text-bone-mut">{chain.symbol}</span> on{" "}
            {chain.name}. You pay network gas; THE RAVENSPIRE takes nothing.
          </p>

          {/* Presets are not a SegmentedControl. That primitive always has
              exactly one selected value, and this group is legitimately empty
              whenever a custom amount is typed. Buttons carrying aria-pressed
              are the honest shape for a group that can have nothing chosen. */}
          <div className="mt-4 grid grid-cols-4 gap-2" role="group" aria-label="Tribute presets">
            {TIP_PRESETS.map((preset) => (
              <Button
                key={preset}
                size="md"
                variant={choice === preset ? "glass" : "ghost"}
                aria-pressed={choice === preset}
                disabled={phase === "sending"}
                tone={choice === preset ? "gold" : "steel"}
                className={
                  choice === preset ? "tnum text-gold-bright" : "tnum"
                }
                onClick={() => {
                  setChoice(preset);
                  setCustom("");
                }}
              >
                {preset}
              </Button>
            ))}
          </div>

          <Field label="Custom amount" className="mt-3">
            <div className="flex items-center gap-2">
              <Input
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
                className="tnum flex-1 text-right"
              />
              <span className="text-xs font-semibold text-bone-mut">
                {chain.symbol}
              </span>
            </div>
          </Field>

          {selfTip && (
            <p className="mt-3 text-xs text-state-warning">
              This is your own wallet. Tribute is for others.
            </p>
          )}

          <Button
            variant="gold"
            size="lg"
            block
            className="mt-5"
            loading={phase === "sending"}
            disabled={!amountValid || selfTip}
            onClick={() => {
              void confirm();
            }}
          >
            {phase === "sending" ? (
              "Sending tribute..."
            ) : (
              <>
                <Icon name="coin" className="h-4 w-4" />
                Send{amountValid ? ` ${amountStr} ${chain.symbol}` : " tribute"}
              </>
            )}
          </Button>

          {phase === "sending" && (
            <p className="mt-3 text-center text-[11px] text-bone-faint">
              Confirm in your wallet. Do not close this window.
            </p>
          )}
        </>
      )}
    </AdaptiveDialog>
  );
}
