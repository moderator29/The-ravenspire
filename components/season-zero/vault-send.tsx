"use client";

import { useMemo, useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { formatEther, parseEther } from "viem";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/wallet/copy-button";
import { useWalletTokens } from "@/components/wallet/use-wallet-tokens";
import { useSigningCeiling } from "@/components/wallet/wallet-guardrails-actions";
import {
  overCeilingSentence,
  withinCeiling,
} from "@/lib/chain/signing-ceiling";
import { shortAddress, txExplorerUrlFor } from "@/components/wallet/chains";
import { SEASON_ZERO, formatEth, rspForWei } from "@/lib/season-zero";
import {
  registerContribution,
  type SeasonZeroContribution,
} from "@/components/season-zero/api";

/* Contribute from the Vault: the member's own Privy embedded wallet sends ETH
 * on Base to the treasury, and the resulting hash is registered with the
 * server automatically.
 *
 * The signing machinery is the Vault's own: the same useSendTransaction, the
 * same embedded-wallet resolution as wallet-live.tsx, the same signing
 * ceiling guardrail as wallet-send-flow.tsx. What differs is that the
 * recipient and the chain are fixed to the treasury on Base, so there is no
 * address to mistype, and that a broadcast hash is not the end of the flow:
 * the server reads the chain before anything is called confirmed.
 *
 * The states, in order and never skipped (rule 17): Initiating (landing the
 * wallet on Base), Wallet confirmation (the Privy window), Processing
 * (broadcast, then verifying on chain), then Confirmed or Failed. Success is
 * shown only after the server has verified the transaction on chain. */

const BASE_CHAIN_ID = 8453;

type Stage =
  | { kind: "idle" }
  | { kind: "initiating" }
  | { kind: "wallet" }
  | { kind: "processing"; hash: string }
  | { kind: "confirmed"; hash: string; contribution: SeasonZeroContribution }
  /* Broadcast but not yet settled when the polling budget ran out. Not a
     failure and never shown as success; the member checks again. */
  | { kind: "unsettled"; hash: string; message: string }
  | { kind: "failed"; hash: string | null; message: string };

export function SeasonZeroVaultSend({
  onRecorded,
}: {
  onRecorded: () => void;
}) {
  const { wallets, ready } = useWallets();
  const { sendTransaction } = useSendTransaction();

  /* The embedded EVM wallet, resolved the way the Vault resolves it. */
  const wallet = useMemo(() => {
    const evm = wallets.filter((w) => w.address?.startsWith("0x"));
    if (!evm.length) return undefined;
    return (
      evm.find(
        (w) =>
          w.walletClientType === "privy" || w.walletClientType === "privy-v2"
      ) ?? evm[0]
    );
  }, [wallets]);

  const { tokens } = useWalletTokens(wallet?.address, []);
  const baseEth = useMemo(
    () => tokens.find((t) => t.chainId === BASE_CHAIN_ID && t.isNative),
    [tokens]
  );
  const balanceWei = useMemo(() => {
    if (!baseEth) return null;
    try {
      return BigInt(baseEth.balanceRaw);
    } catch {
      return null;
    }
  }, [baseEth]);

  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  const parsedWei = useMemo(() => {
    const v = amount.trim();
    if (v === "") return null;
    try {
      const wei = parseEther(v);
      return wei > 0n ? wei : null;
    } catch {
      return null;
    }
  }, [amount]);

  const minWei = parseEther(String(SEASON_ZERO.minContributionEth));
  const underMin = parsedWei !== null && parsedWei < minWei;
  const overBalance =
    parsedWei !== null && balanceWei !== null && parsedWei > balanceWei;

  /* The member's own signing ceiling. Native send, so it bites here; see
     wallet-send-flow.tsx for why it waits for `ready`. */
  const ceiling = useSigningCeiling();
  const overCeiling =
    ceiling.ready &&
    parsedWei !== null &&
    !withinCeiling(parsedWei, ceiling.ceilingWei);

  const busy =
    stage.kind === "initiating" ||
    stage.kind === "wallet" ||
    stage.kind === "processing";

  const canSend =
    !busy &&
    !!wallet &&
    parsedWei !== null &&
    !underMin &&
    !overBalance &&
    !overCeiling &&
    ceiling.ready;

  const allocationPreview =
    parsedWei !== null && !underMin
      ? rspForWei(parsedWei).toLocaleString("en-US")
      : null;

  const submit = async () => {
    if (!wallet || parsedWei === null) return;
    /* Re-checked at the last statement before real value moves, not only in
       the disabled state of a control. */
    if (overCeiling || underMin) return;

    setStage({ kind: "initiating" });
    try {
      /* Land the wallet on Base first. Best-effort: sendTransaction also
         carries the chainId, so a provider that switches inside its own
         window still executes on the right network. */
      try {
        await wallet.switchChain(BASE_CHAIN_ID);
      } catch {
        /* the provider may switch inside its own modal instead */
      }

      setStage({ kind: "wallet" });
      const result = await sendTransaction(
        {
          to: SEASON_ZERO.treasury,
          value: parsedWei,
          chainId: BASE_CHAIN_ID,
        },
        { address: wallet.address }
      );

      /* Broadcast. Not confirmed: the server now reads the chain, and only
         its answer moves this to Confirmed. */
      setStage({ kind: "processing", hash: result.hash });
      const outcome = await registerContribution(result.hash, BASE_CHAIN_ID);
      if (outcome.kind === "recorded") {
        setStage({
          kind: "confirmed",
          hash: result.hash,
          contribution: outcome.contribution,
        });
        onRecorded();
      } else if (outcome.kind === "unsettled") {
        setStage({ kind: "unsettled", hash: result.hash, message: outcome.message });
      } else {
        setStage({ kind: "failed", hash: result.hash, message: outcome.message });
      }
    } catch (e) {
      const message =
        e instanceof Error && e.message ? e.message : "The transfer was not sent.";
      setStage({
        kind: "failed",
        hash: null,
        message: /reject|denied|cancel/i.test(message)
          ? "You closed the confirmation window. Nothing was sent."
          : message,
      });
    }
  };

  const checkAgain = async (hash: string) => {
    setStage({ kind: "processing", hash });
    const outcome = await registerContribution(hash, BASE_CHAIN_ID);
    if (outcome.kind === "recorded") {
      setStage({
        kind: "confirmed",
        hash,
        contribution: outcome.contribution,
      });
      onRecorded();
    } else if (outcome.kind === "unsettled") {
      setStage({ kind: "unsettled", hash, message: outcome.message });
    } else {
      setStage({ kind: "failed", hash, message: outcome.message });
    }
  };

  /* ----- Confirmed ----- */
  if (stage.kind === "confirmed") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-center gap-2.5 rounded-lg border border-gold/25 bg-panel-warm/60 p-4 text-center">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gold/30 bg-panel"
          >
            <Icon name="check" className="h-5 w-5 text-gold" />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-bone">
              Contribution confirmed on chain
            </p>
            <p className="mt-1 text-sm text-bone-mut">
              {formatEth(BigInt(stage.contribution.amountWei))} ETH verified.
              Your allocation of{" "}
              <span className="tnum font-medium text-bone">
                {Number(stage.contribution.rsp).toLocaleString("en-US")} $RSP
              </span>{" "}
              is recorded.
            </p>
          </div>
        </div>
        <TxHashLine hash={stage.hash} chainId={BASE_CHAIN_ID} />
        <Button
          block
          onClick={() => {
            setAmount("");
            setStage({ kind: "idle" });
          }}
        >
          Contribute again
        </Button>
      </div>
    );
  }

  /* ----- Broadcast, awaiting settlement ----- */
  if (stage.kind === "unsettled") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-steel-line bg-panel/50 p-3">
          <p className="text-sm font-medium text-bone">Sent, not yet confirmed</p>
          <p className="mt-1 text-xs leading-relaxed text-bone-mut">
            {stage.message} Your ETH is on its way to the treasury; the
            allocation is recorded the moment the chain confirms it. Nothing is
            lost by waiting.
          </p>
        </div>
        <TxHashLine hash={stage.hash} chainId={BASE_CHAIN_ID} />
        <Button variant="gold" block onClick={() => void checkAgain(stage.hash)}>
          Check again
        </Button>
      </div>
    );
  }

  /* ----- Failed ----- */
  if (stage.kind === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-ember/40 bg-panel/50 p-3">
          <p className="text-sm font-medium text-ember">Not confirmed</p>
          <p className="mt-1 text-xs leading-relaxed text-bone-mut">
            {stage.message}
          </p>
        </div>
        {stage.hash ? <TxHashLine hash={stage.hash} chainId={BASE_CHAIN_ID} /> : null}
        <div className="flex gap-2">
          {stage.hash ? (
            <Button
              variant="gold"
              className="flex-1"
              onClick={() => void checkAgain(stage.hash as string)}
            >
              Check again
            </Button>
          ) : null}
          <Button className="flex-1" onClick={() => setStage({ kind: "idle" })}>
            Start over
          </Button>
        </div>
      </div>
    );
  }

  /* ----- The form, with the three in-flight states over it ----- */
  const statusLine =
    stage.kind === "initiating"
      ? "Initiating: preparing your wallet on Base..."
      : stage.kind === "wallet"
        ? "Waiting for your confirmation in the wallet window..."
        : stage.kind === "processing"
          ? "Verifying on chain. This can take a few seconds."
          : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-bone-mut">
        Sends ETH on Base from your own embedded wallet straight to the
        treasury. You approve the transfer yourself in a secure window; the
        realm never holds your funds.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-bone-faint">
          Amount
          {balanceWei !== null ? (
            <span className="tnum normal-case tracking-normal">
              Available {formatEth(balanceWei)} ETH on Base
            </span>
          ) : null}
        </span>
        <div className="relative">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            spellCheck={false}
            autoComplete="off"
            placeholder={String(SEASON_ZERO.minContributionEth)}
            disabled={busy}
            aria-label="Contribution amount in ETH"
            className={`tnum h-11 w-full rounded-md border bg-panel/60 px-3 pr-24 font-mono text-sm text-bone outline-none transition-colors duration-fast placeholder:text-bone-faint focus:border-gold disabled:opacity-60 ${
              underMin || overBalance ? "border-ember/60" : "border-steel-line"
            }`}
          />
          <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {balanceWei !== null && balanceWei > 0n ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setAmount(formatEther(balanceWei))}
                className="touch:min-h-11 touch:min-w-11 rounded-sm border border-gold/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-gold transition-colors duration-fast hover:border-gold/50"
              >
                Max
              </button>
            ) : null}
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-bone-faint">
              ETH
            </span>
          </div>
        </div>
        {underMin ? (
          <span className="text-xs text-ember">
            The minimum contribution is {SEASON_ZERO.minContributionEth} ETH.
          </span>
        ) : null}
        {!underMin && overBalance ? (
          <span className="text-xs text-ember">
            That is more than your ETH balance on Base.
          </span>
        ) : null}
        {!underMin && !overBalance && overCeiling && ceiling.ceilingWei !== null ? (
          <span className="text-xs text-ember">
            {overCeilingSentence(parsedWei as bigint, ceiling.ceilingWei)}
          </span>
        ) : null}
        {allocationPreview && !overBalance ? (
          <span className="tnum text-xs text-bone-faint">
            Allocation: {allocationPreview} $RSP at the fixed rate
          </span>
        ) : null}
      </label>

      <Button
        variant="gold"
        size="lg"
        block
        disabled={!canSend}
        loading={busy}
        onClick={() => void submit()}
      >
        {busy ? null : <Icon name="send" className="h-4 w-4" />}
        {statusLine ?? "Review and contribute"}
      </Button>

      {ready && !wallet ? (
        <p className="text-xs text-ember">
          No embedded wallet is ready to sign yet. It is forged automatically
          once you are fully signed in.
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-bone-faint">
        Recipient {shortAddress(SEASON_ZERO.treasury, 8, 6)} on Base, fixed. The
        network fee is paid from this wallet in ETH.
      </p>
    </div>
  );
}

function TxHashLine({ hash, chainId }: { hash: string; chainId: number }) {
  const explorer = txExplorerUrlFor(chainId, hash);
  return (
    <div className="rounded-lg border border-steel-line bg-panel/50 p-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
        Transaction hash
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <code className="tnum min-w-0 truncate font-mono text-xs text-bone-mut">
          {shortAddress(hash, 10, 8)}
        </code>
        <div className="flex shrink-0 items-center gap-2">
          <CopyButton value={hash} label="Copy hash" iconOnly />
          {explorer ? (
            <Button
              size="sm"
              render={
                <a href={explorer} target="_blank" rel="noreferrer">
                  <Icon name="arrow" className="h-3.5 w-3.5" />
                  View
                </a>
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
