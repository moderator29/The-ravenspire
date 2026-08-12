"use client";

import { Icon } from "@/components/ui/icon";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
    <Card pad="none" render={<section />} className="p-4 md:p-3">
      <div className="flex items-center gap-2">
        <Icon name="scroll" aria-hidden className="h-4 w-4 text-gold" />
        <h2 className="font-display text-sm font-semibold text-bone">
          Transaction history
        </h2>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          size="sm"
          bordered
          className="mt-3 md:mt-2"
          icon="scroll"
          title="No transfers yet"
          body="Transfers you send from the Vault appear here with their hash. Full on-chain history lives on the explorer."
          action={
            addrExplorer ? (
              <Button
                size="sm"
                render={
                  <a href={addrExplorer} target="_blank" rel="noreferrer">
                    <Icon name="arrow" className="h-3.5 w-3.5" />
                    Open explorer
                  </a>
                }
              />
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2 md:mt-2 md:gap-1">
            {rows.map((tx) => {
              const chain = evmChainById(tx.chainId);
              const explorer = txExplorerUrlFor(tx.chainId, tx.hash);
              return (
                <div
                  key={tx.hash}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-2.5 md:min-h-9 md:p-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold/25 bg-panel-warm"
                    >
                      <Icon name="send" className="h-4 w-4 text-gold" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-bone md:text-[13px]">
                        Sent <span className="tnum">{tx.amount}</span> {tx.symbol}
                      </p>
                      <p className="truncate text-xs text-bone-faint md:text-[11px]">
                        To {shortAddress(tx.to, 6, 4)} on{" "}
                        {chain?.name ?? `chain ${tx.chainId}`} ·{" "}
                        {formatWhen(tx.at)}
                      </p>
                    </div>
                  </div>
                  {explorer ? (
                    <IconButton
                      icon="arrow"
                      label="View transaction"
                      size="sm"
                      variant="glass"
                      render={
                        <a href={explorer} target="_blank" rel="noreferrer" />
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          {addrExplorer ? (
            <Button
              block
              size="sm"
              className="mt-2"
              render={
                <a href={addrExplorer} target="_blank" rel="noreferrer">
                  <Icon name="search" className="h-3.5 w-3.5" />
                  Open full history on explorer
                </a>
              }
            />
          ) : null}
        </>
      )}
    </Card>
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
