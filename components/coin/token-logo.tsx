"use client";

import { useState } from "react";

interface Props {
  src: string | null | undefined;
  symbol: string;
  /** Pixel size of the square badge. */
  size?: number;
  className?: string;
}

/*
  A token's real logo, with a graceful fallback so a row never shows a blank
  hole. We try the provider image first; if it is missing or fails to load we
  draw a gold-lit obsidian disc bearing the first glyph of the ticker. Uses a
  plain <img> on purpose: logos come from many third-party hosts that are not
  configured for next/image, and the badge is small and non-critical.
*/
export function TokenLogo({ src, symbol, size = 36, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const glyph = (symbol || "?").replace(/^\$/, "").charAt(0).toUpperCase() || "?";
  const showImage = Boolean(src) && !failed;
  const dimension = { width: size, height: size };

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-steel-line bg-panel ${className}`}
      style={dimension}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src ?? undefined}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-display font-semibold text-gold-bright"
          style={{ fontSize: Math.max(11, Math.round(size * 0.42)) }}
        >
          {glyph}
        </span>
      )}
    </span>
  );
}
