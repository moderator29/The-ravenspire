"use client";

import { Icon } from "@/components/ui/icon";
import type { ChainMeta } from "@/components/wallet/chains";

/* Swap: an honest placeholder. We do not run any swap or DEX routing yet, so we
   say so plainly rather than mocking a quote that cannot execute. Rendered as
   the body of the Swap modal. */
export function WalletSwap({ chainMeta }: { chainMeta: ChainMeta }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold/20 bg-panel-warm/50 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-panel">
          <Icon name="repost" className="h-5 w-5 text-gold" />
        </span>
        <div>
          <p className="font-display text-base font-semibold text-bone">
            Swap is on its way
          </p>
          <p className="mt-1.5 text-sm text-bone-mut">
            In-wallet swaps between {chainMeta.symbol} and tokens on{" "}
            {chainMeta.name} are being forged. When they land, you will trade
            here without ever handing over your keys.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-steel-line bg-panel/40 p-3.5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
          Until then
        </p>
        <p className="mt-1.5 text-sm text-bone-mut">
          Use Send and Receive to move assets. We will never show you a fake
          quote or route your funds through anything you did not approve.
        </p>
      </div>
    </div>
  );
}
