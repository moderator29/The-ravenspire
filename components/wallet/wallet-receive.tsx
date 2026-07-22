"use client";

import { Icon } from "@/components/ui/icon";
import { CopyButton } from "@/components/wallet/copy-button";
import { AddressQR } from "@/components/wallet/address-qr";
import {
  type ChainMeta,
  addressExplorerUrl,
} from "@/components/wallet/chains";

/* Receive: shows the user's non-custodial 0x wallet address in full with a
   scannable QR, a clear copy affordance, and an EVM-only warning. No balances
   are invented here; this is the true, shareable receiving address. Rendered as
   the body of the Receive modal. */
export function WalletReceive({
  address,
  chainMeta,
}: {
  address?: string;
  chainMeta: ChainMeta;
}) {
  if (!address) {
    return (
      <p className="text-sm text-bone-mut">
        No wallet is bound to your banner yet. Once one is forged, your
        receiving address appears here.
      </p>
    );
  }

  const explorer = addressExplorerUrl(chainMeta, address);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-bone-mut">
        Scan the code or copy the address to receive {chainMeta.symbol} and
        tokens. It is yours alone, non-custodial, and safe to share.
      </p>

      <div className="flex flex-col items-center gap-4 rounded-2xl border border-steel-line bg-panel/40 p-5">
        <AddressQR value={address} />
        <div className="flex items-center gap-2 rounded-full border border-gold/25 bg-panel-warm/60 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-bone-mut">
            EVM / Ethereum only
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-steel-line bg-panel/50 p-3.5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
          Wallet address
        </p>
        <code className="tnum mt-1.5 block break-all font-mono text-sm leading-relaxed text-bone">
          {address}
        </code>
      </div>

      <div className="flex gap-2">
        <CopyButton
          value={address}
          label="Copy address"
          className="btn-gold inline-flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-sm"
        />
        {explorer ? (
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer"
            className="btn-glass inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm"
          >
            <Icon name="arrow" className="h-4 w-4" />
            Explorer
          </a>
        ) : null}
      </div>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-bone-faint">
        <Icon name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ember" />
        Only send assets on {chainMeta.name} or another EVM network to this
        address. Coins sent from a non-EVM chain such as Solana can be lost for
        good.
      </p>
    </div>
  );
}
