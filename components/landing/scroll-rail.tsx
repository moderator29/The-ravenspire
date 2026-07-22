"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { LandingIcon } from "@/components/landing/icons";

/*
  A horizontal, swipeable scroll rail. Native overflow-x-auto with scroll-snap
  keeps touch buttery, the scrollbar hidden via the existing scrollbar-none
  class. Subtle edge fades and arrow buttons signal there is more to the side.
  Only the rail scrolls sideways, never the page body.

  Children should be the cards themselves, each carrying `snap-start shrink-0`
  and its own width. Edge fades resolve to the obsidian page background.
*/

export function ScrollRail({
  children,
  ariaLabel,
  className = "",
}: {
  children: React.ReactNode;
  ariaLabel: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setAtStart(scrollLeft <= 4);
    setAtEnd(scrollLeft >= scrollWidth - clientWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.round(el.clientWidth * 0.82),
      behavior: reduce ? "auto" : "smooth",
    });
  };

  return (
    <div className={`relative ${className}`}>
      {/* Edge fades to the obsidian page background */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-obsidian to-transparent transition-opacity duration-300 ${
          atStart ? "opacity-0" : "opacity-100"
        }`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-obsidian to-transparent transition-opacity duration-300 ${
          atEnd ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* Arrow affordances, desktop only (touch users swipe) */}
      <button
        type="button"
        onClick={() => nudge(-1)}
        aria-label={`Scroll ${ariaLabel} left`}
        disabled={atStart}
        className="absolute -left-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gold/25 bg-void/80 text-gold backdrop-blur transition hover:border-gold/50 hover:text-gold-bright disabled:pointer-events-none disabled:opacity-0 sm:flex"
      >
        <LandingIcon name="chevronLeft" className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => nudge(1)}
        aria-label={`Scroll ${ariaLabel} right`}
        disabled={atEnd}
        className="absolute -right-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gold/25 bg-void/80 text-gold backdrop-blur transition hover:border-gold/50 hover:text-gold-bright disabled:pointer-events-none disabled:opacity-0 sm:flex"
      >
        <LandingIcon name="chevronRight" className="h-4 w-4" />
      </button>

      <div
        ref={ref}
        onScroll={update}
        role="group"
        aria-label={ariaLabel}
        className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-0.5 pb-3"
      >
        {children}
      </div>
    </div>
  );
}
