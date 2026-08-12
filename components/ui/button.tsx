"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cx } from "@/components/ui/cx";
import { mergeClasses } from "@/components/ui/merge";
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
export type ButtonTone = "gold" | "ember" | "danger" | "steel";
/* Horizontal padding, independent of height. Defaults to the size's own. */
export type ButtonPad = "none" | "sm" | "md" | "lg";

/* No radius here. It used to carry `rounded-md`, and `IconButton
   shape="circle"` then added `rounded-[var(--radius-full)]` on top, which is
   emitted earlier in the stylesheet and therefore lost every time: every
   circular icon button in the product rendered as a rounded rectangle. The
   rung is computed once now, at the single place that knows the shape, so the
   two can never be in conflict. */
const BASE =
  "relative inline-flex select-none items-center justify-center whitespace-nowrap " +
  "font-semibold leading-none " +
  /* The 44px floor, on a finger only. See the `touch` variant in globals.css.
     It lives in the shared base so no size, no variant and no call site can
     forget it, and it is a minimum rather than a height so the compact scale
     survives untouched for a mouse. */
  "touch:min-h-11 touch:min-w-11 " +
  /* Width as well as height, and for the same reason. A control's height comes
     off the size scale so it was always deliberate, but its width comes from
     its label, which nobody chooses with a thumb in mind. Two filter buttons
     labelled "All" measured 41px across on the War screens: three pixels short
     of the floor, invisible to a reviewer, and produced by nothing more than a
     short word. A minimum on both axes means a label can never make a control
     smaller than the target it needs. */
  "transition-[transform,box-shadow,background-color,border-color,filter,opacity] " +
  /* Press physics. Moving a control down a pixel without changing its light is
     the tell that it is a picture of a button: the highlight stays lit while
     the object supposedly sinks. The shadow swaps on the same 150ms, so the
     top highlight goes and an occlusion arrives, and the control reads as
     pressing into the surface rather than sliding down it. Both properties the
     compositor can animate without touching layout. */
  "duration-fast ease-out-quint active:translate-y-px active:shadow-pressed " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-50";

const RADIUS_RECT = "rounded-md";
const RADIUS_CIRCLE = "rounded-[var(--radius-full)]";

/* Gold is a gradient, never a flat fill, and it is the only variant that
   carries the forge shadow. `--gold-ink` is the one text colour cleared
   against every rung of that gradient.

   Border colour is split out into BORDER so `tone` can replace it. A caller
   who wrote `border-ember/60` on a glass Button used to get nothing, because
   the variant's own `border-gold/25` is emitted later in the stylesheet and
   at equal specificity later wins. */
const VARIANT: Record<ButtonVariant, string> = {
  gold:
    "text-gold-ink shadow-forge " +
    "bg-[image:linear-gradient(180deg,var(--gold-bright)_0%,var(--gold)_48%,var(--gold-deep)_100%)] " +
    /* The one hover in the Ledger register that answers with light rather than
       a colour step. Gold is the primary action and there is at most one on a
       screen, so it can afford to be the thing that moves. */
    "hover:shadow-forge-lit hover:brightness-[1.06]",
  glass:
    "bg-void/60 text-bone shadow-edge backdrop-blur-[10px] " +
    "bg-[image:linear-gradient(180deg,rgba(255,233,163,0.06),rgba(12,12,17,0.4))] " +
    "hover:border-gold/45 hover:bg-void/75",
  /* Ghost stays flat at rest on purpose. It is the variant used for the third
     and fourth control in a row, and giving it an edge would put thirty small
     shadows on a dense screen and flatten the hierarchy it exists to keep. */
  ghost: "text-bone-mut hover:bg-panel hover:text-bone",
  danger:
    "bg-state-danger/10 text-state-danger shadow-edge " +
    "hover:border-state-danger/70 hover:bg-state-danger/20",
};

const BORDER: Record<ButtonVariant, string> = {
  gold: "border-gold-bright/55",
  glass: "border-gold/25",
  ghost: "border-transparent",
  danger: "border-state-danger/45",
};

const TONE: Record<ButtonTone, string> = {
  gold: "border-gold/60",
  ember: "border-ember/60",
  danger: "border-state-danger/45",
  steel: "border-steel-line",
};

/* The opaque surface, for a control that floats over arbitrary content. Glass
   is translucent with a blur and a gold wash, which is right on a page and
   wrong on a button sitting above a scrolling feed, where the text behind it
   reads through. Two floating controls were asking for this with
   `bg-panel-warm/95`, which never applied: it is a background colour under a
   background image that paints over it. */
const OPAQUE = "bg-panel-warm/95 backdrop-blur-none bg-none";

/* Dense by intent. 32 / 36 / 40px tall with a mouse, and never below 44 with a
   thumb. Height and horizontal padding are separate so a caller can keep the
   44px touch target and still have a narrow control, which is what six icon
   shaped buttons wanted and none of them got: `px-2.5` beside a size of `lg`
   is dead, because `px-5` is emitted later.

   `lg` used to be a flat `h-11`, which is where the founder's "too big in
   height" came from and it is the one part of that complaint with an honest
   answer. Measured on a real phone the Follow control on a Keep was 44x111
   with 20px of padding a side and a 15px label; at 1024 and 1440 it was the
   same 44 tall, and on a mouse 44 is not a floor, it is just a number someone
   typed. So the rung declares 40 and the shared `touch:min-h-11` above lifts
   it back to 44 on a coarse pointer. Desktop loses four pixels of height it
   never needed, a phone loses none, and the accessibility floor is enforced by
   exactly one line in exactly one place, as before.

   The label drops with it: 15px to 14px on `lg`, and every rung gives back a
   step of horizontal padding (20/16/12 becomes 16/14/10). That is where the
   bulk actually was. A 44px control with 20px of padding and a 15px label
   reads bloated; the same 44px control with 16px of padding and a 14px label
   reads compact, and only one of those two numbers was ever the floor. */
const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 text-xs",
  md: "h-9 gap-1.5 text-sm",
  lg: "h-10 gap-1.5 text-sm",
};

const PAD: Record<ButtonPad, string> = {
  none: "px-0",
  sm: "px-2.5",
  md: "px-3.5",
  lg: "px-4",
};

/* Square, and on the same rungs as SIZE so an icon control and a labelled one
   sitting in the same row are the same height. The `lg` icon button is the
   "..." beside Follow on a Keep, and it tracked the labelled control down from
   44 to 40 for a mouse; `touch:min-h-11 touch:min-w-11` below still makes it
   44x44 under a thumb. */
const ICON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
};

const ICON_GLYPH: Record<ButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /* The border accent, for a control that is selected, live, or destructive
     in a place where the variant alone does not say so. */
  tone?: ButtonTone;
  /* Horizontal padding, when the size's own is wrong. An icon shaped control
     wants the height of `lg` and the width of `sm`. */
  pad?: ButtonPad;
  /* Drops the translucency and the blur. For a control that floats over
     scrolling content, where glass lets the content read through it. */
  opaque?: boolean;
  /* Fills the width of its container. Full width buttons are a mobile pattern,
     so this is usually paired with a responsive class on the caller. */
  block?: boolean;
  /* Disables the button and shows a spinner in place of any leading icon.
     Keeps the label so the control never changes width mid-action. */
  loading?: boolean;
  /* Releases the 44px touch floor down to the control's own size scale, for
     SECONDARY controls only.
   *
   * The floor exists so a thumb never misses a primary target, and it stays
   * the default for exactly that reason. But it made every button on a phone
   * at least 44px tall whatever its size prop said, so a Follow or Edit
   * profile button beside a member's name grew as heavy as the name itself,
   * which the product owner reads, correctly, as too big. `dense` lets these
   * sit at their `md` or `sm` height on a finger too. The result still clears
   * WCAG AA target size (24px) with room to spare; it forgoes the stricter
   * 44px AAA target, which is a deliberate, per-control product choice.
   *
   * NEVER use this on the dock, the primary nav, the feed tabs, or a lone
   * primary action. It is for the second and third control in a header row,
   * next to something larger that anchors the thumb. */
  dense?: boolean;
}

export function Button({
  render,
  variant = "glass",
  size = "md",
  tone,
  pad,
  opaque,
  block,
  loading,
  dense,
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
    /* mergeClasses, not cx: see components/ui/merge.ts. A join leaves the
       winner to stylesheet emission order, which is not something a caller
       can see or reason about. */
    className: mergeClasses(
      BASE,
      RADIUS_RECT,
      VARIANT[variant],
      "border",
      tone ? TONE[tone] : BORDER[variant],
      SIZE[size],
      PAD[pad ?? size],
      opaque && OPAQUE,
      block && "w-full",
      /* After SIZE so it wins the touch floor set in BASE. See the prop. */
      dense && "touch:min-h-9 touch:min-w-0",
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
  tone?: ButtonTone;
  /* Square rounded rectangle by default. `circle` exists only for genuinely
     circular affordances such as an avatar overlay, never for toolbar chrome. */
  shape?: "rect" | "circle";
  /* Releases the 44px touch floor to the icon size, for a secondary icon
     control sitting beside a larger anchor. See the note on Button's `dense`;
     the same rule applies, never on the dock or primary nav. */
  dense?: boolean;
}

export function IconButton({
  render,
  icon,
  label,
  variant = "ghost",
  size = "md",
  tone,
  shape = "rect",
  dense,
  className,
  disabled,
  ...props
}: IconButtonProps) {
  const isCustomElement = render !== undefined;

  const defaultProps = {
    className: mergeClasses(
      BASE,
      shape === "circle" ? RADIUS_CIRCLE : RADIUS_RECT,
      VARIANT[variant],
      "border",
      tone ? TONE[tone] : BORDER[variant],
      ICON_SIZE[size],
      /* Square, so an icon control needs the floor on both axes. */
      "shrink-0 p-0 touch:min-w-11",
      /* After the floor line above, so it wins on a coarse pointer. */
      dense && "touch:min-h-9 touch:min-w-9",
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
