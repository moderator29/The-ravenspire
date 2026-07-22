"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";

/* Token provider logo as an <img>, with a silent fall back to the house coin
   glyph so a dead logo_url never renders a broken image. Kept local to the
   Ledger so we do not reach into the wallet component tree. */
export function TokenIcon({
  logo,
  symbol,
  size = 34,
}: {
  logo: string | null;
  symbol: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size };

  if (!logo || failed) {
    return (
      <span
        style={dim}
        aria-label={symbol}
        className="flex shrink-0 items-center justify-center rounded-full border border-gold/25 bg-panel-warm text-gold"
      >
        <Icon name="coin" className="h-1/2 w-1/2" />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo}
      alt={symbol}
      style={dim}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full border border-steel-line bg-panel object-cover"
    />
  );
}
