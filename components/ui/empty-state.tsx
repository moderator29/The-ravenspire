"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";

/* The honest empty state.

   Real data only means empty is a first-class state, not an edge case, and
   this product has honest empty states written inline all over it: a centred
   sentence in a glass box, in a slightly different size and colour each time.
   One component, so the realm's voice is consistent and so the empty case
   always offers a way forward rather than only reporting an absence.

   Never use this to apologise for missing data by inventing some. */

export type EmptyStateSize = "sm" | "md";

export interface EmptyStateProps {
  /* An `Icon` name. Rendered inside a soft gold well so the state reads as
     composed rather than as a failure. */
  icon?: string;
  title: ReactNode;
  body?: ReactNode;
  /* Usually a single Button. The way out of the empty state. */
  action?: ReactNode;
  size?: EmptyStateSize;
  /* Adds the dashed enclosure. Off when the caller already renders a Card. */
  bordered?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  size = "md",
  bordered = false,
  className,
}: EmptyStateProps) {
  const small = size === "sm";
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center text-center",
        small ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10",
        bordered && "rounded-xl border border-dashed border-steel-line",
        className
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className={cx(
            "flex items-center justify-center rounded-lg border border-gold/20 bg-gold/[0.06] text-gold",
            small ? "h-8 w-8" : "h-11 w-11"
          )}
        >
          <Icon name={icon} className={small ? "h-4 w-4" : "h-5 w-5"} />
        </span>
      ) : null}

      <p
        className={cx(
          "font-display font-semibold text-bone",
          small ? "text-sm" : "text-base"
        )}
      >
        {title}
      </p>

      {body ? (
        <p
          className={cx(
            "max-w-[42ch] text-bone-mut",
            small ? "text-xs" : "text-sm"
          )}
        >
          {body}
        </p>
      ) : null}

      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
