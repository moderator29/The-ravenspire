"use client";

import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { cx } from "@/components/ui/cx";

/* A full screen takeover on Base UI Dialog.
 *
 * The realm has a family of surfaces that are neither a Modal nor a Sheet: a
 * conversation that owns the whole viewport on a phone, a chat history that
 * covers the page it was opened from. They were being hand rolled as `fixed
 * inset-0` divs, which is the exact pattern the Modal primitive's own header
 * comment records as the product's most repeated accessibility failure: no
 * focus trap, no focus restore on close, background scroll still alive, and a
 * raw z index that the dock or top bar could paint over.
 *
 * This is the Modal's machinery with none of its chrome. Dialog portals to
 * document.body so no transformed ancestor can clip it, traps and restores
 * focus, closes on Escape, locks the background scroll, and sits on the
 * z-modal rung. The caller owns everything visible: the takeover is a full
 * bleed flex column and nothing more, because a surface that replaces the
 * whole screen brings its own header, body and footer with it.
 *
 * There is no Backdrop on purpose. A backdrop exists to dim the page behind a
 * floating surface; a takeover has no visible page behind it, so the surface
 * itself is the backdrop and painting a second one would be a wasted layer. */
export function Takeover({
  open,
  onOpenChange,
  label,
  className,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /* The accessible name. A takeover has no Dialog.Title chrome of its own, so
     the name is required here rather than optional. */
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      <Dialog.Portal>
        <Dialog.Viewport className="fixed inset-0 z-modal">
          <Dialog.Popup
            aria-label={label}
            className={cx(
              "flex h-full w-full flex-col overflow-hidden outline-none",
              "transition-opacity duration-base ease-out-quint",
              "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-fast",
              className
            )}
          >
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
