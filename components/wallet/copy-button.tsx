"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button, IconButton, type ButtonVariant } from "@/components/ui/button";

/* Copies a value to the clipboard and flashes a confirmation. Stays quiet and
   honest if the clipboard API is unavailable rather than pretending it worked.
   Supports a compact icon-only variant for tight header rows. On the Button
   primitive, so it carries the one focus ring and the one radius rather than
   the `btn-glass` utility it used to paste in. */
export function CopyButton({
  value,
  label = "Copy",
  className,
  variant = "glass",
  block = false,
  iconOnly = false,
}: {
  value: string;
  label?: string;
  className?: string;
  variant?: ButtonVariant;
  block?: boolean;
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

  if (iconOnly) {
    return (
      <IconButton
        icon={copied ? "medal" : "scroll"}
        label={copied ? "Copied" : label}
        size="sm"
        variant={variant}
        onClick={() => void copy()}
        className={className}
      />
    );
  }

  return (
    <Button
      size="sm"
      variant={variant}
      block={block}
      onClick={() => void copy()}
      className={className}
    >
      <Icon
        name={copied ? "medal" : "scroll"}
        aria-hidden
        className="h-3.5 w-3.5"
      />
      {copied ? "Copied" : label}
    </Button>
  );
}
