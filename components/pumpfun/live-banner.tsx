import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { RavenMark } from "@/components/brand/raven-mark";
import { PumpfunMark } from "@/components/pumpfun/mark";
import { pumpfunCoinPagePath, pumpfunLive } from "@/lib/pumpfun";

/* $RSP on Pump.fun, announced. Fails closed with the rest of lib/pumpfun.ts:
   renders nothing at all until a real mint address is configured, so this
   never claims a launch that has not happened (rule 4).

   Two registers for two places it is asked to live:

   "dashboard" is the Ravenry's own one line above the feed, the exact shape
   components/season-zero/banner.tsx already established there: a slim,
   quiet row with a hairline gold border, the whole strip one link, a styled
   "View" chip rather than a nested button. Ledger register, no glow.

   "landing" is the small pill above the hero headline, the one place on the
   marketing site a live badge earns a touch more presence: a pulsing dot,
   both marks side by side, still a single link and still no invented
   numbers, just the fact of being live. */
export function PumpfunLiveBanner({
  variant = "dashboard",
}: {
  variant?: "dashboard" | "landing";
}) {
  if (!pumpfunLive()) return null;
  const href = pumpfunCoinPagePath();
  if (!href) return null;

  if (variant === "landing") {
    return (
      <Link
        href={href}
        className="inline-flex min-h-11 items-center gap-2.5 rounded-md border border-gold/30 bg-panel/70 px-3.5 py-2 transition-colors duration-fast hover:border-gold/50 hover:bg-panel"
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-gold"
        />
        <RavenMark className="h-5 w-5 shrink-0" />
        <span aria-hidden className="text-xs text-bone-faint">
          ×
        </span>
        <PumpfunMark className="h-5 w-5 shrink-0" />
        <span className="text-[13px] font-medium text-bone">
          Live on Pump.fun
        </span>
        <Icon name="arrow" className="h-3.5 w-3.5 shrink-0 text-gold" />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="mb-3 flex min-h-11 items-center gap-2.5 rounded-md border border-gold/30 bg-panel/60 px-3 py-2 transition-colors duration-fast hover:border-gold/50 hover:bg-panel"
    >
      <RavenMark className="h-5 w-5 shrink-0" />
      <PumpfunMark className="h-5 w-5 shrink-0" />
      <p className="min-w-0 flex-1 truncate text-[13px] text-bone">
        <span className="font-semibold">$RSP is live on Pump.fun</span>
        <span className="text-bone-mut"> · real chart, real price</span>
      </p>
      <span className="gold-metal shrink-0 rounded-sm px-2.5 py-1 text-xs font-semibold text-gold-ink">
        View
      </span>
    </Link>
  );
}
