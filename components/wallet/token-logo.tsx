"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";

/* A token's provider logo rendered as an <img>, with a graceful fallback to
   the generic coin glyph so a missing or dead logo_url never shows a broken
   image. The chain short code can be shown as a tiny corner badge. */
export function TokenLogo({
  logo,
  symbol,
  size = 40,
  className = "",
}: {
  logo: string | null;
  symbol: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size };

  if (!logo || failed) {
    return (
      <span
        style={dim}
        className={`flex shrink-0 items-center justify-center rounded-full border border-gold/25 bg-panel-warm text-gold ${className}`}
        aria-label={symbol}
      >
        <Icon name="coin" className="h-1/2 w-1/2" />
      </span>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={logo}
      alt={symbol}
      style={dim}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full border border-steel-line bg-panel object-cover ${className}`}
    />
  );
}
