"use client";

import type { ReactNode } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cx } from "@/components/ui/cx";
import { mergeClasses } from "@/components/ui/merge";
import { Icon } from "@/components/ui/icon";

/* The signature surface, replacing 432 hand written `.glass` usages.

   The `.glass` class in globals.css stays for now so nothing breaks under it,
   but it is frozen at a 24px radius that predates the radius scale and it sits
   outside Tailwind's layers, so it beats any `rounded-*` utility a caller
   tries to apply. That is exactly why this component re-expresses the same
   treatment against `--radius-xl` and `--shadow-card` instead of wrapping the
   old class: here the radius is a token, and it can be overridden. */

export type CardVariant = "default" | "warm" | "inset" | "raised";
export type CardPad = "none" | "sm" | "md" | "lg";
export type CardRadius = "sm" | "md" | "lg" | "xl" | "2xl";
export type CardTone = "gold" | "ember" | "danger" | "steel";
export type CardElevation = "flat" | "card" | "lifted" | "overlay";

const BASE = "relative";

/* A prop rather than a caller passing `rounded-lg`, and the reason is the
   defect recorded in V2 section 21: class attribute order does not decide CSS
   precedence, emission order does, and this project's Tailwind emits
   `rounded-2xl`, `rounded-lg`, `rounded-md`, `rounded-xl` in that order. So a
   caller's `rounded-lg` on a Card is silently dead. Choosing the rung here
   means the class is never in conflict with itself, and every rung comes off
   the scale in globals.css. */
const RADIUS: Record<CardRadius, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
};

/* The surface treatment: background, blur and the gold wash.

   Split from the border and the shadow deliberately. A caller who wanted a
   different border used to write `border-ember/40` and get nothing, because
   the variant's own `border-gold/16` is emitted later and wins. Border colour
   is now `tone` and elevation is now `elevation`, so the three parts of a
   surface can be chosen independently and none of them is ever in conflict
   with itself. */
const SURFACE: Record<CardVariant, string> = {
  default:
    "bg-void/60 backdrop-blur-[14px] " +
    "bg-[image:linear-gradient(180deg,rgba(255,233,163,0.05)_0%,rgba(255,233,163,0.012)_12%,rgba(16,16,23,0.55)_100%)]",
  warm:
    "bg-panel-warm/70 backdrop-blur-[14px] " +
    "bg-[image:linear-gradient(180deg,rgba(255,233,163,0.06),rgba(20,18,12,0.7))]",
  /* Inset is the recessed well: a nested block inside another card, a code
     sample, a quoted post. No blur and no wash, because a surface that sits
     below its parent must not also appear to float above the page. */
  inset: "bg-obsidian/60",
  /* Raised is the other half of that pair, and it was missing. A flat plate
     tinted up from the page rather than down into it, with no blur and no
     gold wash. Three landing and feed surfaces were reaching for exactly this
     by writing `bg-panel` on a default Card, which is a background colour
     underneath a gradient image that paints over it, so it could never have
     worked whatever the class order was. */
  raised: "bg-panel",
};

/* Border colour, per variant, when the caller names no tone. */
const BORDER: Record<CardVariant, string> = {
  default: "border-gold/16",
  warm: "border-gold/16",
  inset: "border-steel-line",
  raised: "border-steel-line",
};

/* One rung per accent, so an ember card and an ember card agree. */
const TONE: Record<CardTone, string> = {
  gold: "border-gold/40",
  ember: "border-ember/40",
  danger: "border-state-danger/45",
  steel: "border-steel-line",
};

const ELEVATION: Record<CardElevation, string> = {
  flat: "shadow-flat",
  card: "shadow-card",
  lifted: "shadow-lifted",
  overlay: "shadow-overlay",
};

const DEFAULT_ELEVATION: Record<CardVariant, CardElevation> = {
  default: "card",
  warm: "card",
  inset: "flat",
  raised: "flat",
};

const PAD: Record<CardPad, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

export interface CardProps extends useRender.ComponentProps<"div"> {
  variant?: CardVariant;
  /* The signature card is `xl`. Drop to `lg` for an inner card or a list row,
     which is the rung the retired `.glass-sm` was frozen at. */
  radius?: CardRadius;
  /* `md` matches the card padding the product already uses. Set `none` when
     composing with CardHeader / CardBody / CardFooter, which carry their own. */
  pad?: CardPad;
  /* The border accent. A card that is carrying an error, a warning, a live
     state or the viewer's own row says so on its edge, and it says it here
     rather than by passing a border class that the variant's own border
     silently outranks. */
  tone?: CardTone;
  /* The shadow rung. Defaults to the variant's own: `card` for the two lit
     surfaces, `flat` for the two plates. */
  elevation?: CardElevation;
  /* Adds the hover lift. Only for cards that are themselves a link or button,
     never for static content, since a hover response on inert content reads as
     a broken affordance. */
  interactive?: boolean;
}

export function Card({
  render,
  variant = "default",
  pad = "md",
  radius = "xl",
  tone,
  elevation,
  interactive,
  className,
  ...props
}: CardProps) {
  const defaultProps = {
    /* mergeClasses, not cx: a caller's class has to be able to displace a base
       class, and a join cannot do that. See components/ui/merge.ts. */
    className: mergeClasses(
      BASE,
      RADIUS[radius],
      SURFACE[variant],
      "border",
      tone ? TONE[tone] : BORDER[variant],
      ELEVATION[elevation ?? DEFAULT_ELEVATION[variant]],
      PAD[pad],
      interactive &&
        "transition-[border-color,box-shadow,transform] duration-base ease-out-quint " +
          "hover:-translate-y-px hover:border-gold/38 hover:shadow-lifted",
      className
    ),
  } satisfies useRender.ElementProps<"div">;

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  });
}

export function CardHeader({
  title,
  icon,
  hint,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  /* An `Icon` name, rendered in gold to the left of the title. */
  icon?: string;
  /* Quiet supporting text on the same baseline as the title. */
  hint?: ReactNode;
  /* Trailing control, usually a Button or an overflow Menu. */
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex items-center gap-2.5 px-4 pt-4 sm:px-5 sm:pt-5",
        className
      )}
    >
      {icon ? <Icon name={icon} className="h-4 w-4 shrink-0 text-gold" /> : null}
      {title ? (
        <h2 className="font-display text-base font-semibold text-bone">
          {title}
        </h2>
      ) : null}
      {hint ? (
        <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
          {hint}
        </span>
      ) : null}
      {children}
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx("px-4 py-4 sm:px-5 sm:py-5", className)}>{children}</div>
  );
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex items-center gap-2 border-t border-steel-line px-4 py-3 sm:px-5",
        className
      )}
    >
      {children}
    </div>
  );
}

/* A dense label / value / control row. Promoted out of components/settings,
   where it was quarantined, because the same three column row appears in
   settings, the vault, house management and every moderation surface. */
export function CardRow({
  title,
  desc,
  className,
  children,
}: {
  title: ReactNode;
  desc?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-4 border-t border-steel-line py-3",
        "first:border-t-0 first:pt-0 last:pb-0",
        className
      )}
    >
      <div className="min-w-0">
        <p className="text-sm text-bone">{title}</p>
        {desc ? <p className="mt-0.5 text-xs text-bone-faint">{desc}</p> : null}
      </div>
      {children}
    </div>
  );
}

/* The rule-and-caps section divider used above card groups. */
export function SectionHeader({
  title,
  hint,
  action,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  /* One control belonging to the section, on the section's own line.

     A section's single control (see all, full view, manage) kept turning up as
     a bare underlined link in a row of its own between the heading and the
     card, right aligned, belonging visually to neither. On `/settings` that
     link measured 49x16, which is not a target. Put on the heading's line it
     lands where the reader is already looking and can be a real button.

     One control, not a toolbar. If a section needs two, it is a card header,
     not a section header. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-baseline gap-3 px-1 pt-2", className)}>
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-bone-mut">
        {title}
      </h2>
      {hint ? <span className="text-[11px] text-bone-faint">{hint}</span> : null}
      <span className="h-px flex-1 bg-steel-line" />
      {/* After the rule, so the rule still does its job of pushing the heading
          left and the control right. `shrink-0` because the rule is the only
          thing here that should give way. */}
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}
