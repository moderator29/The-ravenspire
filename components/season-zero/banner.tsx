"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { SEASON_ZERO, seasonZeroPhase, type SeasonZeroPhase } from "@/lib/season-zero";

/* The Season Zero strip on the Ravenry.
 *
 * Ledger register on purpose: a slim single row with a hairline gold border,
 * no glow, no slab. The founding round earns its ceremony on its own page;
 * here it earns one line above the feed. The whole strip is the link (one
 * target, full width, comfortably over the touch floor) and the View chip is
 * a styled span rather than a nested button, because an interactive element
 * inside an anchor is two targets fighting over one gesture.
 *
 * Phase aware: a countdown before September 1, days left while live, and
 * nothing at all after close. Deliberately not dismissable; it removes
 * itself when the round does.
 *
 * Rendered only after mount: the copy depends on the clock, and the server
 * render must not disagree with the client's. A strip that appears a frame
 * late is invisible; a hydration mismatch is not. */
export function SeasonZeroBanner() {
  const [phase, setPhase] = useState<SeasonZeroPhase | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => {
      setPhase(seasonZeroPhase());
      setNow(Date.now());
    };
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!phase || phase === "ended") return null;

  const msLeft =
    phase === "upcoming"
      ? Date.parse(SEASON_ZERO.startsAt) - now
      : Date.parse(SEASON_ZERO.endsAt) - now;
  const days = Math.max(0, Math.floor(msLeft / 86_400_000));
  const hours = Math.max(0, Math.floor((msLeft % 86_400_000) / 3_600_000));

  return (
    <Link
      href="/season-zero"
      className="mb-3 flex min-h-11 items-center gap-2.5 rounded-md border border-gold/30 bg-panel/60 px-3 py-2 transition-colors duration-fast hover:border-gold/50 hover:bg-panel"
    >
      <Icon name="spark" className="h-4 w-4 shrink-0 text-gold" />
      <p className="min-w-0 flex-1 truncate text-[13px] text-bone">
        <span className="font-semibold">Season Zero</span>
        <span className="text-bone-mut">
          {phase === "upcoming"
            ? ": the founding round opens September 1"
            : ` is live, ${days === 0 ? "closing today" : `${days} ${days === 1 ? "day" : "days"} left`}`}
        </span>
      </p>
      {phase === "upcoming" ? (
        <span className="tnum hidden shrink-0 rounded-sm border border-steel-line px-1.5 py-0.5 text-[11px] text-bone-mut sm:inline">
          {days}d {hours}h
        </span>
      ) : null}
      <span className="gold-metal shrink-0 rounded-sm px-2.5 py-1 text-xs font-semibold text-gold-ink">
        View
      </span>
    </Link>
  );
}
