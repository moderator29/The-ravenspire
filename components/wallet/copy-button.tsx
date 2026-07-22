"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";

/* Copies a value to the clipboard and flashes a confirmation. Stays quiet and
   honest if the clipboard API is unavailable rather than pretending it worked.
   Supports a compact icon-only variant for tight header rows. */
export function CopyButton({
  value,
  label = "Copy",
  className,
  iconOnly = false,
}: {
  value: string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable; do nothing loud */
    }
  };

  const resolved =
    className ??
    (iconOnly
      ? "btn-glass inline-flex h-9 w-9 shrink-0 items-center justify-center p-0"
      : "btn-glass inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs");

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={iconOnly ? (copied ? "Copied" : label) : undefined}
      title={iconOnly ? label : undefined}
      className={resolved}
    >
      <Icon
        name={copied ? "medal" : "scroll"}
        className={`h-3.5 w-3.5 ${copied ? "text-gold" : ""}`}
      />
      {iconOnly ? null : copied ? "Copied" : label}
    </button>
  );
}
