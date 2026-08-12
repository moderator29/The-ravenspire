"use client";

import type { ReactElement, ReactNode } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import { Button, IconButton } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";

/* Modals on Base UI Dialog.

   The audit found 19 files rendering a `fixed inset-0` overlay and only 6
   carrying `role="dialog"`, which means most of the product's overlays were
   invisible to assistive tech, did not trap focus, did not restore focus on
   close, and did not lock the background scroll. Base UI does all four, and
   portals to `document.body` so an overlay can never be clipped or dragged
   around by a transformed ancestor.

   Motion is on the scale: 220ms in, 150ms out, transform and opacity only. */

export type ModalSize = "sm" | "md" | "lg";

const SIZE: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

const BACKDROP =
  "fixed inset-0 z-overlay bg-obsidian/75 backdrop-blur-[3px] " +
  "transition-opacity duration-base ease-out-quint " +
  "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-fast";

const VIEWPORT = "fixed inset-0 z-modal flex items-center justify-center p-4";

const POPUP =
  "relative flex w-full max-h-[calc(100dvh-2rem)] flex-col overflow-hidden " +
  "rounded-2xl border border-gold/20 bg-panel/95 text-bone shadow-overlay backdrop-blur-[18px] " +
  "transition-[transform,opacity] duration-base ease-out-quint " +
  "data-starting-style:scale-[0.97] data-starting-style:opacity-0 " +
  "data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-fast";

export interface ModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /* Uncontrolled alternative to `open`. */
  defaultOpen?: boolean;
  /* Any element; it is composed with Dialog.Trigger so it keeps its own
     styling and gains the open state and aria wiring. */
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  /* Footer actions, usually one or two Buttons. */
  footer?: ReactNode;
  /* The close affordance in the header. Off for flows that must be finished
     or explicitly cancelled. */
  dismissible?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Modal({
  open,
  onOpenChange,
  defaultOpen,
  trigger,
  title,
  description,
  size = "md",
  footer,
  dismissible = true,
  className,
  children,
}: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => onOpenChange?.(next)}
    >
      {trigger ? <Dialog.Trigger render={trigger} /> : null}
      <Dialog.Portal>
        <Dialog.Backdrop className={BACKDROP} />
        <Dialog.Viewport className={VIEWPORT}>
          <Dialog.Popup className={cx(POPUP, SIZE[size], className)}>
            <div className="flex items-start gap-3 px-5 pt-5">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="font-display text-lg font-semibold text-bone">
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-1 text-sm text-bone-mut">
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>
              {dismissible ? (
                <Dialog.Close
                  render={<IconButton icon="close" label="Close" size="sm" />}
                />
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>

            {footer ? (
              <div className="flex items-center justify-end gap-2 border-t border-steel-line px-5 py-4">
                {footer}
              </div>
            ) : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* Close from inside a Modal body without threading state back up. */
export const ModalClose = Dialog.Close;

export interface ConfirmDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /* Destructive confirmations are the only place `danger` belongs. Everything
     else, including a positive confirmation, is gold. */
  tone?: "gold" | "danger";
  onConfirm: () => void;
  /* Keeps the dialog open and the confirm button in a spinner while the action
     settles on the server. */
  pending?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "gold",
  onConfirm,
  pending,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => onOpenChange?.(next)}
    >
      {trigger ? <AlertDialog.Trigger render={trigger} /> : null}
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={BACKDROP} />
        <AlertDialog.Viewport className={VIEWPORT}>
          {/* An alert dialog has no dismiss affordance and no outside press
              close by design: the point is a deliberate answer. */}
          <AlertDialog.Popup className={cx(POPUP, "max-w-sm")}>
            <div className="px-5 pt-5">
              <AlertDialog.Title className="font-display text-base font-semibold text-bone">
                {title}
              </AlertDialog.Title>
              {description ? (
                <AlertDialog.Description className="mt-1.5 text-sm text-bone-mut">
                  {description}
                </AlertDialog.Description>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-5">
              <AlertDialog.Close
                render={<Button variant="ghost" size="sm">{cancelLabel}</Button>}
              />
              <Button
                variant={tone === "danger" ? "danger" : "gold"}
                size="sm"
                loading={pending}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
