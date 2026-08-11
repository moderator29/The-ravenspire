"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui/cx";

/* Skeletons, and the gate that decides whether to show one at all.

   There were 80 skeletons in the product and every one of them was a generic
   block: a grey rectangle the size of a card, which tells the reader nothing
   about what is arriving. A skeleton earns its place only when it is shaped
   like the content that will replace it, so these primitives are sized by the
   caller rather than by a preset. */

export type SkeletonRadius = "sm" | "md" | "lg" | "xl" | "full";

const RADIUS: Record<SkeletonRadius, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  /* Avatars only, which is the one place a circle is correct. */
  full: "rounded-[var(--radius-full)]",
};

export function Skeleton({
  radius = "md",
  className,
}: {
  radius?: SkeletonRadius;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cx(
        "animate-pulse bg-steel-deep/80",
        RADIUS[radius],
        className
      )}
    />
  );
}

/* Text-shaped lines. The last line is short, because real paragraphs end
   mid-line and a block of equal length bars never looks like prose. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          radius="sm"
          className={cx("h-3", i === lines - 1 ? "w-2/5" : "w-full")}
        />
      ))}
    </div>
  );
}

/* Gates a skeleton behind a delay.

   A skeleton that appears and vanishes inside 300ms does not read as loading,
   it reads as the layout breaking and repairing itself. Anything that
   resolves that fast should show nothing at all and simply appear. Pass the
   real loading flag; the hook returns whether the skeleton has earned its
   place on screen yet.

     const showSkeleton = useDelayedLoading(loading);
     if (showSkeleton) return <FeedSkeleton />;
     if (loading) return null;

   The timer resets whenever loading restarts, so a second fetch is gated the
   same way as the first. */
export function useDelayedLoading(loading: boolean, ms = 300): boolean {
  const [elapsed, setElapsed] = useState(false);
  const [previous, setPrevious] = useState(loading);

  /* React's documented way to reset state when an input changes: adjust it
     during render rather than in an effect, so there is no wasted commit and
     no cascading render on every start and stop. */
  if (previous !== loading) {
    setPrevious(loading);
    setElapsed(false);
  }

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setElapsed(true), ms);
    return () => window.clearTimeout(timer);
  }, [loading, ms]);

  return loading && elapsed;
}
