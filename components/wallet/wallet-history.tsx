"use client";

import { Icon } from "@/components/ui/icon";
import type { TxRecord } from "@/components/wallet/wallet-prefs";
import {
  shortAddress,
  txExplorerUrlFor,
  addressExplorerUrlFor,
  evmChainById,
} from "@/components/wallet/chains";

/* Transaction history. Shows the member's own sent transfers, recorded the
   moment each send succeeds so history survives with no dependency on a paid
   transactions feed, and never fabricates a transfer. Each row deep-links to
   the transaction on the right chain's explorer, and a footer link opens the
   full on-chain history for the address. */
export function WalletHistory({
  txs,
  address,
  defaultChainId,
  compact = false,
}: {
  txs: TxRecord[];
  address: string | undefined;
  defaultChainId: number;
  compact?: boolean;
}) {
  const rows = compact ? txs.slice(0, 4) : txs;
  const addrExplorer = address
    ? addressExplorerUrlFor(defaultChainId, address)
    : null;

  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <Icon name="scroll" className="h-4 w-4 text-gold" />
        <h2 className="font-display text-base font-semibold text-bone">
          Transaction history
        </h2>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-steel-line bg-panel/25 p-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-steel-line bg-panel/60">
            <Icon name="scroll" className="h-5 w-5 text-bone-faint" />
          </span>
          <p className="text-sm font-medium text-bone-mut">No transfers yet</p>
          <p className="max-w-xs text-xs text-bone-faint">
            Transfers you send from the Vault appear here with their hash. Full
            on-chain history lives on the explorer.
          </p>
          {addrExplorer ? (
            <a
              href={addrExplorer}
              target="_blank"
              rel="noreferrer"
              className="btn-glass mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
            >
              <Icon name="arrow" className="h-3.5 w-3.5" />
              Open explorer
            </a>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2">
            {rows.map((tx) => {
              const chain = evmChainById(tx.chainId);
              const explorer = txExplorerUrlFor(tx.chainId, tx.hash);
              return (
                <div
                  key={tx.hash}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-steel-line bg-panel/40 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-panel-warm">
                      <Icon name="send" className="h-4 w-4 text-gold" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-bone">
                        Sent {tx.amount} {tx.symbol}
                      </p>
                      <p className="truncate text-xs text-bone-faint">
                        To {shortAddress(tx.to, 6, 4)} on{" "}
                        {chain?.name ?? `chain ${tx.chainId}`} ·{" "}
                        {formatWhen(tx.at)}
                      </p>
                    </div>
                  </div>
                  {explorer ? (
                    <a
                      href={explorer}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="View transaction"
                      className="btn-glass inline-flex h-8 w-8 shrink-0 items-center justify-center p-0"
                    >
                      <Icon name="arrow" className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
          {addrExplorer ? (
            <a
              href={addrExplorer}
              target="_blank"
              rel="noreferrer"
              className="btn-glass mt-3 inline-flex w-full items-center justify-center gap-1.5 px-3.5 py-2 text-xs"
            >
              <Icon name="search" className="h-3.5 w-3.5" />
              Open full history on explorer
            </a>
          ) : null}
        </>
      )}
    </section>
  );
}

function formatWhen(at: number): string {
  const diff = Date.now() - at;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(at).toLocaleDateString();
}
