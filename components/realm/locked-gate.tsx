"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/cx";
import { NotifyMe } from "@/components/realm/notify-me";
import type { CollectibleFeature } from "@/lib/realm/interest";

/* The sealed-preview primitive (V2 Part Two, section 27.2).
 *
 * Wraps a real surface rendered from real data, desaturates and blurs it, and
 * lays a padlock plate with "Coming soon" and a working Notify me over it.
 * Built once here, used by the Reliquary, Warchests and the Mercer previews
 * and the landing page. When the surface's realm_flag flips, the caller stops
 * wrapping and the gate opens with zero code change here.
 *
 * The sealed content is `inert`: unclickable, untabbable and invisible to
 * assistive tech, so a sealed catalog can never leak an interactive control
 * or announce itself to a screen reader. `pointer-events-none` and
 * `aria-hidden` are kept alongside it as the belt to inert's braces.
 *
 * Ornament: this is a Forge-register moment used sparingly. The padlock sits
 * on a soft warm glow, and nothing pulses or loops.
 */

export function LockedGate({
  feature,
  title,
  blurb,
  children,
  className,
}: {
  feature: CollectibleFeature;
  title: string;
  /* The sealed surface. Real data or an honest empty state, never invented. */
  children: ReactNode;
  blurb?: string;
  className?: string;
}) {
  return (
    /* Grid stacking rather than an absolute overlay: both layers share the
       one cell, so the wrapper is as tall as the taller of the two and the
       plate can never spill past the component onto whatever sits around it,
       even over a short sealed surface. */
    <div className={cx("relative grid", className)}>
      <div
        inert
        aria-hidden
        className="col-start-1 row-start-1 pointer-events-none select-none opacity-80 blur-[3px] saturate-50"
      >
        {children}
      </div>

      {/* The plate sits after the sealed block in the DOM, so it stacks above
          it without reaching for a z-index rung it does not need. */}
      <div className="col-start-1 row-start-1 flex items-center justify-center p-4">
        <Card
          variant="warm"
          pad="lg"
          elevation="lifted"
          className="flex w-full max-w-sm flex-col items-center text-center"
        >
          <span className="relative mb-4 inline-flex">
            {/* The one candle of ornament: a static warm glow, no motion. */}
            <span
              aria-hidden
              className="absolute -inset-5 bg-[radial-gradient(circle,rgba(255,214,102,0.22)_0%,transparent_70%)]"
            />
            <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-lg border border-gold/30 bg-obsidian/70">
              <Icon name="lock" className="h-5 w-5 text-gold" />
            </span>
          </span>

          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-bone-faint">
            Coming soon
          </span>
          <h2 className="gold-text mt-1.5 font-display text-xl font-semibold tracking-wide">
            {title}
          </h2>
          {blurb ? (
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-bone-mut">
              {blurb}
            </p>
          ) : null}

          <NotifyMe feature={feature} size="md" className="mt-5" />
        </Card>
      </div>
    </div>
  );
}
