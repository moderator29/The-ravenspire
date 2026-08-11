"use client";

import { useSyncExternalStore } from "react";
import type { ReactElement, ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cx } from "@/components/ui/cx";
import { Modal, type ModalSize } from "@/components/ui/modal";

/* Bottom sheets on Base UI's native Drawer.

   This is the mobile default for anything that would otherwise be a modal.
   A centred dialog on a phone puts its actions in the hardest part of the
   screen to reach and its dismiss control in the very hardest; a bottom sheet
   puts both under the thumb and adds drag to dismiss, which is the gesture
   users already expect from every native app.

   Base UI ships the drawer natively, which is the reason the primitive layer
   sits on Base UI rather than Radix: Radix has no drawer, and Vaul, the
   package everyone reaches for instead, is now unmaintained by its author. */

export type SheetSide = "bottom" | "right";

const BACKDROP =
  "fixed inset-0 z-overlay min-h-dvh bg-obsidian/75 " +
  "opacity-[calc(1-var(--drawer-swipe-progress))] " +
  "transition-opacity duration-base ease-out-quint data-swiping:duration-0 " +
  "data-starting-style:opacity-0 data-ending-style:opacity-0";

const SURFACE =
  "border-gold/20 bg-panel/95 text-bone shadow-overlay backdrop-blur-[18px] " +
  "overflow-y-auto overscroll-contain touch-auto outline-none " +
  "transition-transform duration-base ease-out-quint data-swiping:select-none " +
  "data-ending-style:duration-fast";

/* The bleed is the extra slab of surface hidden past the screen edge, so an
   overscrolling drag never tears a gap between the sheet and the edge. */
const POPUP: Record<SheetSide, string> = {
  bottom:
    "-mb-12 max-h-[calc(85dvh+3rem)] w-full rounded-t-2xl border-t px-4 pt-3 " +
    "pb-[calc(1rem+env(safe-area-inset-bottom,0px)+3rem)] " +
    "[transform:translateY(var(--drawer-swipe-movement-y))] " +
    "data-starting-style:[transform:translateY(100%)] " +
    "data-ending-style:[transform:translateY(100%)]",
  right:
    "-mr-12 h-full w-[min(26rem,calc(100vw-3rem))] rounded-l-2xl border-l py-4 pl-4 pr-16 " +
    "[transform:translateX(var(--drawer-swipe-movement-x))] " +
    "data-starting-style:[transform:translateX(100%)] " +
    "data-ending-style:[transform:translateX(100%)]",
};

const VIEWPORT: Record<SheetSide, string> = {
  bottom: "fixed inset-0 z-modal flex items-end justify-center",
  right: "fixed inset-0 z-modal flex items-stretch justify-end",
};

export interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  side?: SheetSide;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Sheet({
  open,
  onOpenChange,
  defaultOpen,
  trigger,
  title,
  description,
  side = "bottom",
  footer,
  className,
  children,
}: SheetProps) {
  return (
    <Drawer.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => onOpenChange?.(next)}
      swipeDirection={side === "bottom" ? "down" : "right"}
    >
      {trigger ? <Drawer.Trigger render={trigger} /> : null}
      <Drawer.Portal>
        <Drawer.Backdrop className={BACKDROP} />
        <Drawer.Viewport className={VIEWPORT[side]}>
          <Drawer.Popup className={cx(SURFACE, POPUP[side], className)}>
            {side === "bottom" ? (
              /* The grab handle. Rounded fully on purpose: it is a drag
                 affordance, not a control, and the pill shape is the
                 cross-platform signal for "this sheet can be dragged". */
              <div
                aria-hidden
                className="mx-auto mb-3 h-1 w-10 rounded-[var(--radius-full)] bg-steel-line"
              />
            ) : null}
            <Drawer.Content className="mx-auto w-full max-w-[32rem]">
              <Drawer.Title className="font-display text-base font-semibold text-bone">
                {title}
              </Drawer.Title>
              {description ? (
                <Drawer.Description className="mt-1 text-sm text-bone-mut">
                  {description}
                </Drawer.Description>
              ) : null}
              <div className="mt-4">{children}</div>
              {footer ? (
                <div className="mt-5 flex items-center justify-end gap-2 border-t border-steel-line pt-4">
                  {footer}
                </div>
              ) : null}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* Close from inside a Sheet body without threading state back up. */
export const SheetClose = Drawer.Close;

/* Responsive is not a resize. This returns a real answer to "is this a phone",
   subscribed rather than measured once, and it starts `false` on the server so
   the desktop tree is what hydrates and there is no layout flash on the wide
   screens where the modal is correct. */
export function useIsMobile(query = "(max-width: 767px)"): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export interface AdaptiveDialogProps extends Omit<SheetProps, "side"> {
  size?: ModalSize;
}

/* One overlay, two layouts: a bottom sheet under 768px, a centred modal above
   it. Reach for this rather than a Modal whenever the surface is something a
   member will genuinely open on a phone, which is nearly all of them. */
export function AdaptiveDialog({ size = "md", ...props }: AdaptiveDialogProps) {
  const isMobile = useIsMobile();
  return isMobile ? <Sheet {...props} /> : <Modal size={size} {...props} />;
}
