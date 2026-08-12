"use client";

import type { ReactNode } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";

/* The signature surface, replacing 432 hand written `.glass` usages.

   The `.glass` class in globals.css stays for now so nothing breaks under it,
   but it is frozen at a 24px radius that predates the radius scale and it sits
   outside Tailwind's layers, so it beats any `rounded-*` utility a caller
   tries to apply. That is exactly why this component re-expresses the same
   treatment against `--radius-xl` and `--shadow-card` instead of wrapping the
   old class: here the radius is a token, and it can be overridden. */

export type CardVariant = "default" | "warm" | "inset";
export type CardPad = "none" | "sm" | "md" | "lg";

const BASE = "relative rounded-xl";

const VARIANT: Record<CardVariant, string> = {
  default:
    "border border-gold/16 bg-void/60 shadow-card backdrop-blur-[14px] " +
    "bg-[image:linear-gradient(180deg,rgba(255,233,163,0.05)_0%,rgba(255,233,163,0.012)_12%,rgba(16,16,23,0.55)_100%)]",
  warm:
    "border border-gold/16 bg-panel-warm/70 shadow-card backdrop-blur-[14px] " +
    "bg-[image:linear-gradient(180deg,rgba(255,233,163,0.06),rgba(20,18,12,0.7))]",
  /* Inset is the recessed well: a nested block inside another card, a code
     sample, a quoted post. No blur and no shadow, because a surface that sits
     below its parent must not also appear to float above the page. */
  inset: "border border-steel-line bg-obsidian/60 shadow-flat",
};

const PAD: Record<CardPad, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

export interface CardProps extends useRender.ComponentProps<"div"> {
  variant?: CardVariant;
  /* `md` matches the card padding the product already uses. Set `none` when
     composing with CardHeader / CardBody / CardFooter, which carry their own. */
  pad?: CardPad;
  /* Adds the hover lift. Only for cards that are themselves a link or button,
     never for static content, since a hover response on inert content reads as
     a broken affordance. */
  interactive?: boolean;
}

export function Card({
  render,
  variant = "default",
  pad = "md",
  interactive,
  className,
  ...props
}: CardProps) {
  const defaultProps = {
    className: cx(
      BASE,
      VARIANT[variant],
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
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-baseline gap-3 px-1 pt-2", className)}>
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-bone-mut">
        {title}
      </h2>
      {hint ? <span className="text-[11px] text-bone-faint">{hint}</span> : null}
      <span className="h-px flex-1 bg-steel-line" />
    </div>
  );
}
