"use client";

import { useMemo, useState } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { formatEther, isAddress, parseEther } from "viem";
import { Icon } from "@/components/ui/icon";
import {
  type ChainMeta,
  shortAddress,
  txExplorerUrl,
} from "@/components/wallet/chains";

/* Send native coin from the embedded wallet. Privy's sendTransaction opens a
   secure confirmation window that the user must approve, so the platform never
   moves funds on its own. Rendered as the body of the Send modal; MUST render
   only when Privy is enabled. */
export function WalletSend({
  fromAddress,
  chainId,
  chainMeta,
  balanceWei,
  onSent,
}: {
  fromAddress?: string;
  chainId: number | null;
  chainMeta: ChainMeta;
  balanceWei?: bigint;
  onSent?: () => void;
}) {
  const { sendTransaction } = useSendTransaction();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const toValid = to.trim() === "" || isAddress(to.trim());

  const parsedValue = useMemo(() => {
    if (amount.trim() === "") return null;
    try {
      const wei = parseEther(amount.trim());
      return wei > BigInt(0) ? wei : null;
    } catch {
      return null;
    }
  }, [amount]);

  const overBalance =
    parsedValue !== null &&
    balanceWei !== undefined &&
    parsedValue > balanceWei;

  const canSend =
    !pending &&
    isAddress(to.trim()) &&
    parsedValue !== null &&
    !overBalance &&
    !!fromAddress;

  const balanceText =
    balanceWei !== undefined
      ? Number(formatEther(balanceWei)).toLocaleString(undefined, {
          maximumFractionDigits: 6,
        })
      : null;

  const setMax = () => {
    if (balanceWei === undefined) return;
    setAmount(formatEther(balanceWei));
  };

  const submit = async () => {
    setError(null);
    setHash(null);
    if (!isAddress(to.trim())) {
      setError("That does not look like a valid address.");
      return;
    }
    if (parsedValue === null) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setPending(true);
    try {
      const result = await sendTransaction(
        {
          to: to.trim(),
          value: parsedValue,
          ...(chainId ? { chainId } : {}),
        },
        fromAddress ? { address: fromAddress } : undefined
      );
      setHash(result.hash);
      setTo("");
      setAmount("");
      onSent?.();
    } catch (e) {
      const message =
        e instanceof Error && e.message
          ? e.message
          : "The transaction was not sent.";
      // Privy throws a friendly rejection when the user closes the window.
      setError(
        /reject|denied|cancel/i.test(message)
          ? "You closed the confirmation window. Nothing was sent."
          : message
      );
    } finally {
      setPending(false);
    }
  };

  const explorer = hash ? txExplorerUrl(chainMeta, hash) : null;

  if (hash) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold/25 bg-panel-warm/60 p-5 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-panel">
            <Icon name="send" className="h-5 w-5 text-gold" />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-bone">
              Transfer sent
            </p>
            <p className="mt-1 text-sm text-bone-mut">
              It is on its way across {chainMeta.name}.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-steel-line bg-panel/50 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            Transaction hash
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <code className="tnum min-w-0 truncate font-mono text-xs text-bone-mut">
              {shortAddress(hash, 10, 8)}
            </code>
            {explorer ? (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                className="btn-glass inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <Icon name="arrow" className="h-3.5 w-3.5" />
                View
              </a>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setHash(null)}
          className="btn-glass w-full px-5 py-2.5 text-sm"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-bone-mut">
        Send {chainMeta.symbol} on {chainMeta.name}. You approve every transfer
        yourself in a secure Privy window; The Ravenspire cannot move your funds.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
          Recipient address
        </span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="0x..."
          className={`tnum w-full rounded-2xl border bg-panel/60 px-3.5 py-3 font-mono text-sm text-bone outline-none transition-colors placeholder:text-bone-faint focus:border-gold ${
            toValid ? "border-steel-line" : "border-ember/60"
          }`}
        />
        {!toValid ? (
          <span className="text-xs text-ember">
            This is not a valid wallet address.
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-bone-faint">
          Amount
          {balanceText ? (
            <span className="tnum normal-case tracking-normal text-bone-faint">
              Balance {balanceText} {chainMeta.symbol}
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
            placeholder="0.0"
            className={`tnum w-full rounded-2xl border bg-panel/60 px-3.5 py-3 pr-28 font-mono text-sm text-bone outline-none transition-colors placeholder:text-bone-faint focus:border-gold ${
              overBalance ? "border-ember/60" : "border-steel-line"
            }`}
          />
          <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {balanceWei !== undefined ? (
              <button
                type="button"
                onClick={setMax}
                className="rounded-lg border border-gold/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-gold transition-colors hover:border-gold/50"
              >
                Max
              </button>
            ) : null}
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-bone-faint">
              {chainMeta.symbol}
            </span>
          </div>
        </div>
        {overBalance ? (
          <span className="text-xs text-ember">
            That is more than your balance on {chainMeta.name}.
          </span>
        ) : null}
      </label>

      <button
        type="button"
        disabled={!canSend}
        onClick={() => void submit()}
        className="btn-gold w-full px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="send" className="h-4 w-4" />
        {pending ? "Confirm in the window..." : "Review and send"}
      </button>

      {error ? <p className="text-xs text-ember">{error}</p> : null}

      <p className="text-xs leading-relaxed text-bone-faint">
        Network fees apply and are paid from this wallet. Double-check the
        address; transfers on-chain cannot be reversed.
      </p>
    </div>
  );
}
