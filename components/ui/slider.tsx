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
   file supplies only the look. Rounded rectangles throughout, track and thumb
   both off the radius scale, and the control is 44px tall so the thumb is
   draggable with a thumb. */

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
        <BaseSlider.Track className="h-1.5 w-full select-none rounded-sm bg-steel-deep">
          <BaseSlider.Indicator className="h-full select-none rounded-sm bg-[image:linear-gradient(90deg,var(--gold-deep),var(--gold)_55%,var(--gold-bright))]" />
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
