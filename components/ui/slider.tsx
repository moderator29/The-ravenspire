"use client";

import type { ReactNode } from "react";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { cx } from "@/components/ui/cx";

/* The slider, added because Calls need one.

   V2 section 9.2 is explicit that confidence is "a slider in [0.55, 0.99]
   rather than three buttons", on the finding that people who say 63 percent
   genuinely outperform people who say about 60. Three buttons would throw that
   granularity away, and a bare `<input type="range">` would be the 269th hand
   written control in a product that just finished retiring 268 of them.

   Base UI supplies the whole contract: arrow keys, Home and End, Page Up and
   Page Down, a real focus target, `aria-valuenow` and `aria-valuetext`. This
   file supplies only the look, and the control is 44px tall so the thumb is
   draggable with a thumb.

   Thumb and track are shaped differently on purpose, and this control is where
   the product's rule about it is easiest to see. The thumb is the part you
   grab, so it is a control and it is a rounded rectangle. The track is the
   scale you read, so it is data, and it matches the Meter: round ends, off
   `--radius-full`. It previously carried `rounded-sm`, which on a 6px box
   computes to 3px, which is half the height, which is a capsule with extra
   steps. The rung name was doing nothing but obscuring the shape it produced,
   so the shape is now stated outright. See the note over `.bar-track` in
   globals.css for why 4 to 8px tall boxes have no non-capsule rung available
   to them. */

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /* Required. The thumb is a control with no visible text of its own. */
  label: string;
  /* Spoken instead of the raw number, for example "72 percent". */
  valueText?: string;
  disabled?: boolean;
  className?: string;
  /* Ticks or a scale drawn under the track. */
  children?: ReactNode;
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  valueText,
  disabled,
  className,
  children,
}: SliderProps) {
  return (
    <BaseSlider.Root
      value={value}
      onValueChange={(next) =>
        onValueChange(typeof next === "number" ? next : next[0])
      }
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cx("w-full", className)}
    >
      <BaseSlider.Control className="flex h-11 w-full touch-none select-none items-center">
        {/* Not `.bar-track` and `.bar-gold`, tempting as it is to have one
            definition of a bar. That pair carries `overflow: hidden`, which is
            right for a Meter and fatal here: the thumb is a 20px box inside a
            6px track, so it is a child that must be allowed to escape its
            parent's bounds. Reusing the class would have hidden the only part
            of this control you can touch. */}
        <BaseSlider.Track className="h-1.5 w-full select-none rounded-full bg-steel-deep">
          <BaseSlider.Indicator className="h-full select-none rounded-full bg-[image:linear-gradient(90deg,var(--gold-deep),var(--gold)_55%,var(--gold-bright))]" />
          <BaseSlider.Thumb
            aria-label={label}
            aria-valuetext={valueText}
            className={cx(
              "h-5 w-5 select-none rounded-sm border border-gold-bright/60 shadow-forge",
              "bg-[image:linear-gradient(180deg,var(--gold-bright)_0%,var(--gold)_48%,var(--gold-deep)_100%)]",
              "transition-transform duration-instant ease-out-quint",
              "data-dragging:scale-110",
              "data-disabled:opacity-50"
            )}
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
      {children}
    </BaseSlider.Root>
  );
}
