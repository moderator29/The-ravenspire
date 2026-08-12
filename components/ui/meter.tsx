"use client";

import { cx } from "@/components/ui/cx";

/* The gold progress bar, expressed once.

   `bar-track` plus `bar-gold` was pasted into nine places: House standings,
   the House hall, the contributor board, Renown, the war chrome and the
   tokenomics panel. Every one of them re-derived the same three decisions,
   and each got at least one of them slightly different: the height, the
   clamp that stops a real but tiny value rendering as nothing, and whether
   the bar announces itself to a screen reader.

   The clamp matters and is easy to get wrong. A House with one point out of
   forty thousand has earned a visible sliver, not a zero width bar, so the
   floor is applied to the rendered width only. It never changes the number
   beside it, which is the real value.

   A bar is normally a picture of a figure that is already written next to it,
   so it is hidden from screen readers by default. Pass `label` when the bar
   is the only expression of the value, and it becomes a real progressbar. */

export type MeterSize = "xs" | "sm" | "md";

const HEIGHT: Record<MeterSize, string> = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2",
};

export interface MeterProps {
  /* Where this row sits. Anything at or below zero reads as the floor. */
  value: number;
  /* What a full bar means. The leader's score, the next tier, the goal. */
  max: number;
  size?: MeterSize;
  /* The smallest visible fill, as a percentage. A real value is never drawn
     as nothing. */
  floor?: number;
  /* Names the bar for a screen reader, and turns it into a progressbar.
     Leave it off when the figure is already written beside the bar. */
  label?: string;
  className?: string;
}

export function Meter({
  value,
  max,
  size = "sm",
  floor = 2,
  label,
  className,
}: MeterProps) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.min(1, Math.max(0, value) / safeMax);
  /* The floor lifts a real but tiny value into view. It must not lift zero.

     It did: the clamp ran unconditionally, so a mastery of 0 drew a 2% gold
     sliver, and a sliver of gold on a progress bar says "you have started".
     Found on the War's mastery board, where levels of 10/3/1/0/0 rendered the
     two zeroes as visible progress that had not happened. That is invented
     data on a rewards screen, which is the one place it costs the most, and
     rule 4 does not have an exception for two percent of a bar.

     One call site had already worked around it by passing
     `floor={value > 0 ? 2 : 0}`, which is the right answer in the wrong place:
     every future caller would have had to know to write it. */
  const width = value > 0 ? Math.min(100, Math.max(floor, ratio * 100)) : 0;

  return (
    <div
      className={cx("bar-track w-full", HEIGHT[size], className)}
      {...(label
        ? {
            role: "progressbar",
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": safeMax,
            "aria-valuenow": Math.max(0, value),
          }
        : { "aria-hidden": true })}
    >
      {/* Width is the one exception to animating transform and opacity only:
          a bar has no other axis to grow along. It is not animated here, so
          nothing moves per frame. */}
      <div className="bar-gold h-full" style={{ width: `${width}%` }} />
    </div>
  );
}
