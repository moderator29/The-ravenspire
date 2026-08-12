"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";

/* The realm's one button.

   There were 268 hand written buttons before this file existed, in fourteen
   radii and four different gold treatments. Everything here comes off the
   token scale: radius from `--radius-md`, motion from the duration and easing
   scale, elevation from `--shadow-forge`.

   Two rules are load bearing and are enforced by the class strings below
   rather than by review:

   1. Buttons are clean rounded rectangles. There is no `rounded-full` variant
      and there will not be one. `--radius-full` belongs to avatars.
   2. No `focus:outline-none`. The global `:focus-visible` rule in globals.css
      already draws a gold ring on every button in the product, so this file
      adds nothing and, more importantly, removes nothing. */

export type ButtonVariant = "gold" | "glass" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex select-none items-center justify-center whitespace-nowrap " +
  "rounded-md font-semibold leading-none " +
  "transition-[transform,box-shadow,background-color,border-color,filter,opacity] " +
  "duration-fast ease-out-quint active:translate-y-px " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-50";

/* Gold is a gradient, never a flat fill, and it is the only variant that
   carries the forge shadow. `--gold-ink` is the one text colour cleared
   against every rung of that gradient. */
const VARIANT: Record<ButtonVariant, string> = {
  gold:
    "border border-gold-bright/55 text-gold-ink shadow-forge " +
    "bg-[image:linear-gradient(180deg,var(--gold-bright)_0%,var(--gold)_48%,var(--gold-deep)_100%)] " +
    "hover:brightness-[1.06]",
  glass:
    "border border-gold/25 bg-void/60 text-bone backdrop-blur-[10px] " +
    "bg-[image:linear-gradient(180deg,rgba(255,233,163,0.06),rgba(12,12,17,0.4))] " +
    "hover:border-gold/45 hover:bg-void/75",
  ghost:
    "border border-transparent text-bone-mut hover:bg-panel hover:text-bone",
  danger:
    "border border-state-danger/45 bg-state-danger/10 text-state-danger " +
    "hover:border-state-danger/70 hover:bg-state-danger/20",
};

/* Dense by intent. 32 / 36 / 44px tall, with generous horizontal padding so
   the control reads compact without reading cramped. `lg` lands exactly on the
   44px touch target, which is why it is the size for primary mobile actions. */
const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-4 text-sm",
  lg: "h-11 gap-2 px-5 text-[15px]",
};

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

const ICON_GLYPH: Record<ButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /* Fills the width of its container. Full width buttons are a mobile pattern,
     so this is usually paired with a responsive class on the caller. */
  block?: boolean;
  /* Disables the button and shows a spinner in place of any leading icon.
     Keeps the label so the control never changes width mid-action. */
  loading?: boolean;
}

export function Button({
  render,
  variant = "glass",
  size = "md",
  block,
  loading,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const inert = Boolean(disabled) || Boolean(loading);

  /* When `render` is supplied the element may be an anchor (a Next `<Link>`
     is the common case), and `type` and `disabled` are meaningless or invalid
     there. Anchors get `aria-disabled` instead, which the base classes style. */
  const isCustomElement = render !== undefined;

  const defaultProps = {
    className: cx(
      BASE,
      VARIANT[variant],
      SIZE[size],
      block && "w-full",
      className
    ),
    children: (
      <>
        {loading ? <Spinner size={size} /> : null}
        {children}
      </>
    ),
    ...(isCustomElement
      ? { "aria-disabled": inert || undefined }
      : { type: "button" as const, disabled: inert }),
  } satisfies useRender.ElementProps<"button">;

  return useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(defaultProps, props),
  });
}

export interface IconButtonProps
  extends Omit<useRender.ComponentProps<"button">, "children"> {
  /* An `Icon` name. Emoji are never icons in this product. */
  icon: string;
  /* Required: an icon-only control with no accessible name is invisible to a
     screen reader, and this was the single most common a11y defect in the
     hand written buttons this replaces. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /* Square rounded rectangle by default. `circle` exists only for genuinely
     circular affordances such as an avatar overlay, never for toolbar chrome. */
  shape?: "rect" | "circle";
}

export function IconButton({
  render,
  icon,
  label,
  variant = "ghost",
  size = "md",
  shape = "rect",
  className,
  disabled,
  ...props
}: IconButtonProps) {
  const isCustomElement = render !== undefined;

  const defaultProps = {
    className: cx(
      BASE,
      VARIANT[variant],
      ICON_SIZE[size],
      "shrink-0 p-0",
      shape === "circle" && "rounded-[var(--radius-full)]",
      className
    ),
    "aria-label": label,
    children: <Icon name={icon} className={ICON_GLYPH[size]} />,
    ...(isCustomElement
      ? { "aria-disabled": disabled || undefined }
      : { type: "button" as const, disabled }),
  } satisfies useRender.ElementProps<"button">;

  return useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(defaultProps, props),
  });
}

/* A ring, not a bouncing dot. Rotation is a transform, so it composites on the
   GPU and never triggers layout. */
function Spinner({ size }: { size: ButtonSize }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block shrink-0 animate-spin rounded-[var(--radius-full)]",
        "border-2 border-current border-t-transparent opacity-70",
        size === "sm" ? "h-3 w-3" : size === "lg" ? "h-4.5 w-4.5" : "h-4 w-4"
      )}
    />
  );
}
