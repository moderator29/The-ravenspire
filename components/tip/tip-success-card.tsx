"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CeremonyCard } from "@/components/ui/ceremony-card";
import { explorerTxUrl, resolveChain } from "@/components/tip/chain";

/* The cinematic beat after a tribute lands: the shared ceremony chassis
   (components/ui/ceremony-card.tsx), with a tip's own body: the explorer
   link and Done. */
export function TipSuccessCard({
  amount,
  symbol,
  chainId,
  txHash,
  recipientName,
  onClose,
}: {
  amount: string;
  symbol: string;
  chainId: number | null;
  txHash: string;
  recipientName: string;
  onClose: () => void;
}) {
  const chain = resolveChain(chainId);
  const txUrl = explorerTxUrl(chainId, txHash);

  return (
    <CeremonyCard
      kicker="Tribute sent"
      headline={`${amount} ${symbol}`}
      subline={
        <>
          delivered to{" "}
          <span className="font-semibold text-bone">{recipientName}</span>
        </>
      }
      footnote={`A real transfer, wallet to wallet on ${chain.name}. THE RAVENSPIRE never touched the coin.`}
    >
      <div className="flex w-full items-center gap-2">
        <Button
          variant="glass"
          size="md"
          className="flex-1 text-gold"
          render={<a href={txUrl} target="_blank" rel="noopener noreferrer" />}
        >
          <Icon name="scroll" className="h-4 w-4" />
          View on {chain.name}
        </Button>
        <Button variant="gold" size="md" className="flex-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </CeremonyCard>
  );
}
