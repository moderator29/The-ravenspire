"use client";

import { useCallback, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/button";

/* Menus on Base UI Menu. This retires components/ui/overflow-menu.tsx.

   The old overflow menu was the most sophisticated primitive we had and it
   still carried four real defects, each of which this file fixes for free:

   1. No focus management. Opening never moved focus into the menu and closing
      never restored it to the trigger, so a keyboard user was dropped back at
      the top of the document.
   2. `role="menu"` with no keyboard contract behind it. No roving tabindex, no
      arrow keys, no typeahead. An ARIA role that lies is worse than no role,
      because a screen reader promises navigation that does not exist.
   3. No collision detection. The position was computed once from the trigger
      rectangle and never checked against the viewport, so the menu on the last
      post in the feed rendered off the bottom of the screen.
   4. Closed on any scroll event. On touch that means the slightest thumb drift
      while reaching for an item dismisses the menu.

   Base UI handles focus, the full keyboard contract, and Floating UI collision
   avoidance, and it keeps the menu anchored while the page scrolls instead of
   closing. */

const POPUP =
  "min-w-[11rem] origin-[var(--transform-origin)] rounded-lg border border-gold/20 " +
  "bg-panel/95 p-1 shadow-lifted backdrop-blur-[18px] outline-none " +
  "transition-[transform,opacity] duration-fast ease-out-quint " +
  "data-starting-style:scale-[0.97] data-starting-style:opacity-0 " +
  "data-ending-style:scale-[0.97] data-ending-style:opacity-0";

const ITEM =
  "flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2.5 py-2 " +
  /* The 44px floor, the same one the Button and the field carry. A menu row is
     the densest control in the product and it measured 32px on a phone, which
     put two destructive-adjacent choices a thumb-width apart. Padding alone
     could not fix it without making desktop rows loose, and this leaves the
     mouse case exactly as it was. */
  "touch:min-h-11 " +
  "text-left text-xs font-medium text-bone-mut outline-none " +
  "transition-colors duration-instant ease-out-quint " +
  "data-highlighted:bg-panel data-highlighted:text-bone " +
  "data-disabled:pointer-events-none data-disabled:opacity-50";

export interface MenuProps {
  /* Any element. It is composed with Menu.Trigger, so it keeps its own styling
     and gains `aria-haspopup`, `aria-expanded` and the open state attribute. */
  trigger: ReactElement;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}

export function Menu({
  trigger,
  align = "end",
  side = "bottom",
  open,
  onOpenChange,
  className,
  children,
}: MenuProps) {
  return (
    <BaseMenu.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          className="z-dropdown outline-none"
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
        >
          <BaseMenu.Popup className={cx(POPUP, className)}>
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

export interface MenuItemProps {
  onClick?: () => void;
  /* An `Icon` name rendered before the label. */
  icon?: string;
  disabled?: boolean;
  /* Destructive items are ember-red and, by convention, sit last with a
     separator above them. */
  tone?: "default" | "danger";
  className?: string;
  children: ReactNode;
}

export function MenuItem({
  onClick,
  icon,
  disabled,
  tone = "default",
  className,
  children,
}: MenuItemProps) {
  return (
    <BaseMenu.Item
      disabled={disabled}
      onClick={() => onClick?.()}
      className={cx(
        ITEM,
        tone === "danger" && "text-state-danger data-highlighted:text-state-danger",
        className
      )}
    >
      {icon ? <Icon name={icon} className="h-3.5 w-3.5 shrink-0" /> : null}
      {children}
    </BaseMenu.Item>
  );
}

/* A menu entry that navigates. Renders a real anchor, so middle click, copy
   link address and open in new tab all behave the way the member expects. */
export function MenuLinkItem({
  render,
  icon,
  className,
  children,
}: {
  render: ReactElement;
  icon?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <BaseMenu.LinkItem render={render} className={cx(ITEM, className)}>
      {icon ? <Icon name={icon} className="h-3.5 w-3.5 shrink-0" /> : null}
      {children}
    </BaseMenu.LinkItem>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return (
    <BaseMenu.Separator className={cx("my-1 h-px bg-steel-line", className)} />
  );
}

export function MenuGroup({
  label,
  children,
}: {
  label?: ReactNode;
  children: ReactNode;
}) {
  return (
    <BaseMenu.Group>
      {label ? (
        <BaseMenu.GroupLabel className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-bone-faint">
          {label}
        </BaseMenu.GroupLabel>
      ) : null}
      {children}
    </BaseMenu.Group>
  );
}

/* Compatibility wrapper for the ~19 call sites still written against the old
   overflow menu API.

   Identical signature, including the render prop that receives `close`, so
   nothing has to change at once, but the popup underneath is now the Base UI
   menu with real focus management and collision detection. Call sites should
   migrate to <Menu> with <MenuItem> children as they are touched, since a raw
   <button> inside the popup does not join the arrow key contract. */
export function OverflowMenu({
  children,
  ariaLabel = "More",
  buttonClassName,
  iconClassName = "h-4 w-4",
  width = 176,
}: {
  children: (close: () => void) => ReactNode;
  ariaLabel?: string;
  buttonClassName?: string;
  iconClassName?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <BaseMenu.Root open={open} onOpenChange={setOpen}>
      <BaseMenu.Trigger
        render={
          buttonClassName ? (
            <button type="button" aria-label={ariaLabel} className={buttonClassName}>
              <Icon name="dots" className={iconClassName} />
            </button>
          ) : (
            <IconButton icon="dots" label={ariaLabel} size="sm" />
          )
        }
      />
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          className="z-dropdown outline-none"
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={8}
        >
          <BaseMenu.Popup className={POPUP} style={{ width }}>
            {children(close)}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
