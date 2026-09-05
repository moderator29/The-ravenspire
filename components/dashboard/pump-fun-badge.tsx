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
 * no client state, nothing to hydrate.
 *
 * The chip carries an up-right arrow rather than the Season Zero banner's
 * plain "View": that banner points at `/season-zero`, one of the realm's own
 * routes, while this one opens pump.fun itself in a new tab. The two strips
 * share a shape on purpose; the one real difference between them, leaving
 * the realm, is the one thing worth a visual cue. Press physics match the
 * house Button primitive (`active:translate-y-px`) so the whole row answers
 * a tap rather than only recoloring under it. */
export function PumpFunBadge() {
  return (
    <Link
      href="https://pump.fun"
      target="_blank"
      rel="noreferrer"
      className="mb-3 flex min-h-11 items-center gap-2.5 rounded-md border border-gold/30 bg-panel/60 px-3 py-2 transition-[color,border-color,background-color,transform] duration-fast ease-out-quint hover:border-gold/50 hover:bg-panel active:translate-y-px"
    >
      <Icon name="signal" className="h-4 w-4 shrink-0 text-gold" />
      <p className="min-w-0 flex-1 truncate text-[13px] text-bone">
        <span className="font-semibold">$RSP</span>
        <span className="text-bone-mut"> is live on Pump.fun</span>
      </p>
      <span className="gold-metal inline-flex shrink-0 items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-semibold text-gold-ink">
        View
        <Icon name="arrow" className="h-3 w-3 -rotate-45" />
      </span>
    </Link>
  );
}
