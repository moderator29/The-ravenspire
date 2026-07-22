"use client";

import { useEffect, useState } from "react";
import type { TokenCard } from "@/lib/data/tokens";

function fmt(n: number | null, prefix = "$"): string {
  if (n === null || Number.isNaN(n)) return "?";
  if (n >= 1e9) return `${prefix}${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${prefix}${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${prefix}${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `${prefix}${n.toFixed(2)}`;
  return `${prefix}${n.toPrecision(3)}`;
}

/* Live price card for a $cashtag. Real data only; renders nothing while
   loading and an honest miss if there is no market. */
export function PriceCard({ symbol }: { symbol: string }) {
  const [card, setCard] = useState<TokenCard | null | "loading">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`/api/token?q=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setCard(d.card ?? null);
      })
      .catch(() => {
        if (alive) setCard(null);
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  if (card === "loading")
    return (
      <div className="glass glass-sm mt-2 h-14 animate-pulse px-4 py-3" />
    );
  if (!card)
    return (
      <div className="glass glass-sm mt-2 px-4 py-2.5 text-xs text-bone-faint">
        No live market found for ${symbol.toUpperCase()}.
      </div>
    );

  const up = (card.change24h ?? 0) >= 0;
  return (
    <div className="glass glass-sm mt-2 flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-bone">
          ${card.symbol}
          <span className="ml-2 truncate text-xs font-normal text-bone-faint">
            {card.name}
          </span>
        </p>
        <p className="text-[11px] uppercase tracking-wider text-bone-faint">
          {card.chain ?? "unknown chain"}
        </p>
      </div>
      <div className="ml-auto text-right">
        <p className="tnum text-sm font-semibold text-bone">
          {fmt(card.priceUsd)}
        </p>
        <p
          className={`tnum text-xs font-medium ${up ? "text-gold-bright" : "text-ember-deep"}`}
        >
          {up ? "+" : ""}
          {card.change24h?.toFixed(2) ?? "?"}% 24h
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-[10px] uppercase tracking-wider text-bone-faint">
          MCap
        </p>
        <p className="tnum text-xs text-bone-mut">{fmt(card.marketCap)}</p>
      </div>
    </div>
  );
}
