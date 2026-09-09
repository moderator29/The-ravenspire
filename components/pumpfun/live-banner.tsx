import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { RavenMark } from "@/components/brand/raven-mark";
import { PumpfunMark } from "@/components/pumpfun/mark";
import { pumpfunCoinPagePath, pumpfunLive, pumpfunUrl } from "@/lib/pumpfun";

/* $RSP on Pump.fun, announced. Fails closed with the rest of lib/pumpfun.ts:
 * renders nothing at all until a real mint address is configured, so this
 * never claims a launch that has not happened (rule 4).
 *
 * THREE REGISTERS FOR THREE PLACES IT IS ASKED TO LIVE:
 *
 * "top" is the landing page's own announcement strip, full width, sitting
 * above the sticky nav rather than squeezed into the hero's badge row. It
 * gets real room on purpose: this is the first thing anyone reading the
 * page sees, so it earns space rather than fighting the hero for it. One
 * link, the whole strip, opening the realm's own coin page.
 *
 * "dashboard" is the Ravenry's own one line above the feed, the exact shape
 * components/season-zero/banner.tsx already establishes there: a slim,
 * quiet row with a hairline gold border, the whole strip one link, a
 * styled "View" chip rather than a nested button. Ledger register, no glow.
 *
 * "landing" is the compact pill version, kept for a spot with less room
 * than the hero (a footer strip, a sidebar), still a single link and still
 * no invented numbers, just the fact of being live.
 */
export function PumpfunLiveBanner({
  variant = "dashboard",
}: {
  variant?: "top" | "dashboard" | "landing";
}) {
  if (!pumpfunLive()) return null;
  const href = pumpfunCoinPagePath();
  if (!href) return null;

  if (variant === "top") {
    const buyUrl = pumpfunUrl();
    return (
      <div className="relative z-nav border-b border-gold/20 bg-obsidian">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 200% at 15% 0%, rgba(217,176,64,0.16), transparent 60%)",
          }}
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center gap-3 px-6 py-4 text-center sm:flex-row sm:justify-center sm:gap-4 sm:py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-gold"
            />
            <RavenMark className="h-6 w-6 shrink-0" />
            <span aria-hidden className="text-bone-faint">
              ×
            </span>
            <PumpfunMark className="h-6 w-6 shrink-0" />
          </div>
          <p className="text-sm font-semibold text-bone sm:text-base">
            $RSP is live on Pump.fun
            <span className="ml-2 hidden font-normal text-bone-mut sm:inline">
              Real chart. Real price. Non-custodial, wallet to wallet.
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={href}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-gold/30 bg-panel/70 px-3.5 py-1.5 text-sm font-semibold text-bone transition-colors duration-fast hover:border-gold/50 hover:bg-panel"
            >
              View the chart
              <Icon name="arrow" className="h-3.5 w-3.5 text-gold" />
            </Link>
            {buyUrl ? (
              <a
                href={buyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="gold-metal inline-flex min-h-9 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold text-gold-ink transition-opacity duration-fast hover:opacity-90"
              >
                Trade on Pump.fun
              </a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

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
