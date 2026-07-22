"use client";

import { useMemo, useState } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  isAddress,
  parseUnits,
} from "viem";
import { Icon } from "@/components/ui/icon";
import { CopyButton } from "@/components/wallet/copy-button";
import { TokenLogo } from "@/components/wallet/token-logo";
import type { WalletToken } from "@/components/wallet/wallet-token-types";
import type { TxRecord } from "@/components/wallet/wallet-prefs";
import {
  shortAddress,
  txExplorerUrlFor,
  evmChainById,
} from "@/components/wallet/chains";

/* Minimal shape of the Privy connected wallet we need to move funds: its
   address and the ability to switch to the token's chain before sending. */
export interface SendCapableWallet {
  address: string;
  switchChain: (id: `0x${string}` | number) => Promise<void>;
}

type Step = "recipient" | "amount" | "sent";

/* The improved, two-step send flow scoped to one coin on one chain (Exodus /
   Trust style). Step 1 collects and validates the 0x recipient; step 2 takes
   the amount with the live available balance, a MAX button, and a hard block
   when the amount exceeds the balance. Native coins move by value; ERC-20s by
   an encoded transfer to the contract. On success the tx hash is shown with a
   copy button and explorer link, and handed back so it enters history. */
export function WalletSendFlow({
  token,
  wallet,
  onRecorded,
  onSent,
}: {
  token: WalletToken;
  wallet: SendCapableWallet | undefined;
  onRecorded: (tx: TxRecord) => void;
  onSent?: () => void;
}) {
  const { sendTransaction } = useSendTransaction();

  const [step, setStep] = useState<Step>("recipient");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const chain = evmChainById(token.chainId);
  const recipientValid = isAddress(to.trim());

  const balanceRaw = useMemo(() => {
    try {
      return BigInt(token.balanceRaw);
    } catch {
      return 0n;
    }
  }, [token.balanceRaw]);

  const parsedAmount = useMemo(() => {
    const v = amount.trim();
    if (v === "") return null;
    try {
      const wei = parseUnits(v, token.decimals);
      return wei > 0n ? wei : null;
    } catch {
      return null;
    }
  }, [amount, token.decimals]);

  const overBalance = parsedAmount !== null && parsedAmount > balanceRaw;
  const availableText = formatUnits(balanceRaw, token.decimals);

  const usdPreview =
    parsedAmount !== null && token.priceUsd > 0
      ? Number(formatUnits(parsedAmount, token.decimals)) * token.priceUsd
      : null;

  const setMax = () => setAmount(formatUnits(balanceRaw, token.decimals));

  const canSend =
    !pending &&
    !!wallet &&
    recipientValid &&
    parsedAmount !== null &&
    !overBalance &&
    balanceRaw > 0n;

  const submit = async () => {
    if (!wallet || parsedAmount === null || !recipientValid) return;
    setError(null);
    setPending(true);
    try {
      // Land the wallet on the token's chain first so the transfer executes on
      // the right network. Best-effort: sendTransaction also carries chainId.
      try {
        await wallet.switchChain(token.chainId);
      } catch {
        /* provider may switch inside its own modal instead */
      }

      const recipient = to.trim() as `0x${string}`;
      const tx = token.isNative
        ? { to: recipient, value: parsedAmount, chainId: token.chainId }
        : {
            to: token.contract as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [recipient, parsedAmount],
            }),
            value: 0n,
            chainId: token.chainId,
          };

      const result = await sendTransaction(tx, { address: wallet.address });
      const record: TxRecord = {
        hash: result.hash,
        chainId: token.chainId,
        to: recipient,
        symbol: token.symbol,
        amount: formatUnits(parsedAmount, token.decimals),
        contract: token.contract,
        at: Date.now(),
      };
      onRecorded(record);
      setHash(result.hash);
      setStep("sent");
      onSent?.();
    } catch (e) {
      const message =
        e instanceof Error && e.message ? e.message : "The transfer was not sent.";
      setError(
        /reject|denied|cancel/i.test(message)
          ? "You closed the confirmation window. Nothing was sent."
          : message
      );
    } finally {
      setPending(false);
    }
  };

  const explorer = hash ? txExplorerUrlFor(token.chainId, hash) : null;

  /* ----- Success ----- */
  if (step === "sent" && hash) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold/25 bg-panel-warm/60 p-5 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-panel">
            <Icon name="send" className="h-5 w-5 text-gold" />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-bone">
              {token.symbol} on its way
            </p>
            <p className="mt-1 text-sm text-bone-mut">
              Sent across {chain?.name ?? "the network"} to{" "}
              {shortAddress(to.trim(), 6, 4)}.
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
            <div className="flex shrink-0 items-center gap-2">
              <CopyButton value={hash} label="Copy hash" iconOnly />
              {explorer ? (
                <a
                  href={explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                >
                  <Icon name="arrow" className="h-3.5 w-3.5" />
                  View
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setStep("recipient");
            setTo("");
            setAmount("");
            setHash(null);
          }}
          className="btn-glass w-full px-5 py-2.5 text-sm"
        >
          Send more
        </button>
      </div>
    );
  }

  /* ----- Header shared by both steps ----- */
  const header = (
    <div className="flex items-center gap-3 rounded-2xl border border-steel-line bg-panel/40 p-3">
      <TokenLogo logo={token.logo} symbol={token.symbol} size={38} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-bone">{token.symbol}</p>
        <p className="truncate text-xs text-bone-faint">
          {token.name} on {chain?.name ?? token.chainName}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gold/25 bg-panel-warm/60 px-2.5 py-1 text-[11px] font-medium text-bone">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        {token.chainShort}
      </span>
    </div>
  );

  /* ----- Step 1: recipient ----- */
  if (step === "recipient") {
    return (
      <div className="flex flex-col gap-4">
        {header}

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
              to.trim() === "" || recipientValid
                ? "border-steel-line"
                : "border-ember/60"
            }`}
          />
          {to.trim() !== "" && !recipientValid ? (
            <span className="text-xs text-ember">
              This is not a valid EVM wallet address.
            </span>
          ) : null}
        </label>

        <button
          type="button"
          disabled={!recipientValid}
          onClick={() => setStep("amount")}
          className="btn-gold w-full px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="arrow" className="h-4 w-4" />
          Next
        </button>

        <p className="text-xs leading-relaxed text-bone-faint">
          Send only on {chain?.name ?? token.chainName}. Double-check the
          address; on-chain transfers cannot be reversed.
        </p>
      </div>
    );
  }

  /* ----- Step 2: amount ----- */
  return (
    <div className="flex flex-col gap-4">
      {header}

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-steel-line bg-panel/40 px-3.5 py-2.5">
        <span className="text-xs text-bone-faint">To</span>
        <code className="tnum font-mono text-xs text-bone-mut">
          {shortAddress(to.trim(), 8, 6)}
        </code>
        <button
          type="button"
          onClick={() => setStep("recipient")}
          className="text-xs font-medium text-gold hover:underline"
        >
          Edit
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
          Amount
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
            <button
              type="button"
              onClick={setMax}
              className="rounded-lg border border-gold/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-gold transition-colors hover:border-gold/50"
            >
              Max
            </button>
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-bone-faint">
              {token.symbol}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`tnum text-xs ${overBalance ? "text-ember" : "text-bone-faint"}`}
          >
            Available {formatBalance(availableText)} {token.symbol}
          </span>
          {usdPreview !== null ? (
            <span className="tnum text-xs text-bone-faint">
              ~${usdPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          ) : null}
        </div>
        {overBalance ? (
          <span className="text-xs text-ember">
            That is more than your {token.symbol} balance on{" "}
            {chain?.name ?? token.chainName}.
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
      {!wallet ? (
        <p className="text-xs text-ember">
          No embedded wallet is ready to sign this transfer yet.
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-bone-faint">
        Network fees are paid from this wallet in {chain?.native ?? "the gas coin"}.
        You approve every transfer yourself in a secure Privy window.
      </p>
    </div>
  );
}

function formatBalance(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
