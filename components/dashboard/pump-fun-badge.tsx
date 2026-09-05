import Link from "next/link";
import { Icon } from "@/components/ui/icon";

/* The Pump.fun status strip on the Ravenry.
 *
 * Same shape as the Season Zero banner it sits beside: Ledger register, a
 * slim single row with a hairline gold border, no glow, no slab, the whole
 * strip as one link target over the touch floor. No borrowed logo artwork:
 * a third party's trademarked mark is not ours to embed, so the badge is our
 * own house iconography (a signal glyph) plus the plain words, which also
 * keeps the promise not to reproduce Pump.fun's own visual identity.
 *
 * Links to pump.fun itself, not to a coin page that does not exist yet: real
 * data only, and the contract address has no value to link to before launch
 * (see components/landing/pump-fun-launch.tsx). Server component: no clock,
 * no client state, nothing to hydrate. */
export function PumpFunBadge() {
  return (
    <Link
      href="https://pump.fun"
      target="_blank"
      rel="noreferrer"
      className="mb-3 flex min-h-11 items-center gap-2.5 rounded-md border border-gold/30 bg-panel/60 px-3 py-2 transition-colors duration-fast hover:border-gold/50 hover:bg-panel"
    >
      <Icon name="signal" className="h-4 w-4 shrink-0 text-gold" />
      <p className="min-w-0 flex-1 truncate text-[13px] text-bone">
        <span className="font-semibold">$RSP</span>
        <span className="text-bone-mut"> is live on Pump.fun</span>
      </p>
      <span className="gold-metal shrink-0 rounded-sm px-2.5 py-1 text-xs font-semibold text-gold-ink">
        View
      </span>
    </Link>
  );
}
