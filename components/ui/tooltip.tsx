"use client";

import type { ReactElement, ReactNode } from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cx } from "@/components/ui/cx";

/* Tooltips on Base UI Tooltip.

   Read the constraint before reaching for this. Tooltips are for sighted mouse
   and keyboard users in dense chrome, and Base UI deliberately disables them on
   touch, because there is no discoverable way to reveal one before tapping.
   That means a tooltip must never be the only place information exists.

   If the trigger's own purpose is to open the popup, it is a popover, not a
   tooltip. If the text is needed to understand the control, put it inline or
   in a Sheet. If it is feedback about something that just happened, it is a
   Toast, which is announced. */

export function TooltipProvider({
  children,
  delay = 400,
}: {
  children: ReactNode;
  delay?: number;
}) {
  return (
    <BaseTooltip.Provider delay={delay} closeDelay={100}>
      {children}
    </BaseTooltip.Provider>
  );
}

export interface TooltipProps {
  /* Short. A tooltip is a label, not a paragraph. */
  content: ReactNode;
  /* A single element. It is composed with Tooltip.Trigger and keeps its own
     styling and props. */
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  delay?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delay,
  className,
}: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger delay={delay} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          className="z-tooltip"
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={8}
        >
          <BaseTooltip.Popup
            className={cx(
              "max-w-[16rem] rounded-md border border-gold/20 bg-panel/95 px-2.5 py-1.5",
              "text-xs font-medium text-bone shadow-raised backdrop-blur-[18px]",
              "origin-[var(--transform-origin)] transition-[transform,opacity]",
              "duration-instant ease-out-quint data-instant:transition-none",
              "data-starting-style:scale-[0.96] data-starting-style:opacity-0",
              "data-ending-style:scale-[0.96] data-ending-style:opacity-0",
              className
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
