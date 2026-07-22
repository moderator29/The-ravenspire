"use client";

import { useEffect, useState } from "react";
import type { TokenCard } from "@/lib/data/tokens";

/* Compact, dependency-free price mini-chart for a coin Call. It uses the same
   live token lookup the rest of the app relies on (/api/token -> lookupToken)
   and draws only from REAL figures: the current price and the real 24h change,
   from which the price 24 hours ago is derived. No points are invented between
   them, so the line is an honest open->now trend. The Call's sealed entry price
   is drawn as a reference so a reader sees where the wager was struck. */

function fmtPrice(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "?";
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(2)}`;
}

export function CallChart({
  symbol,
  entryPrice,
  stance,
}: {
  symbol: string;
  entryPrice: number | null;
  stance: "up" | "down";
}) {
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
    return <div className="glass-sm mt-2 h-20 animate-pulse rounded-xl" />;
  if (!card || card.priceUsd === null)
    return (
      <div className="glass-sm mt-2 rounded-xl px-3 py-2 text-[11px] text-bone-faint">
        No live chart for ${symbol.toUpperCase()} right now.
      </div>
    );

  const now = card.priceUsd;
  const change = card.change24h ?? 0;
  /* Real 24h-ago price implied by the live price and its real 24h change. */
  const open = now / (1 + change / 100);
  const up = now >= open;
  const stroke = up ? "var(--chart-up, #d9b45b)" : "var(--chart-down, #b4573a)";

  /* Geometry. A tall, narrow viewBox keeps the SVG crisp at any width. */
  const W = 300;
  const H = 72;
  const padX = 6;
  const padY = 10;

  const vals = [open, now];
  if (entryPrice !== null && Number.isFinite(entryPrice)) vals.push(entryPrice);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi === lo) {
    hi = lo * 1.001 || 1;
    lo = lo * 0.999;
  }
  const x = (i: 0 | 1) => padX + i * (W - padX * 2);
  const y = (v: number) =>
    padY + (1 - (v - lo) / (hi - lo)) * (H - padY * 2);

  const x0 = x(0);
  const x1 = x(1);
  const y0 = y(open);
  const y1 = y(now);
  const line = `M ${x0} ${y0} L ${x1} ${y1}`;
  const area = `M ${x0} ${y0} L ${x1} ${y1} L ${x1} ${H} L ${x0} ${H} Z`;
  const gradId = `cc-${symbol.replace(/[^a-z0-9]/gi, "")}`;
  const entryY =
    entryPrice !== null && Number.isFinite(entryPrice) ? y(entryPrice) : null;

  const delta = open !== 0 ? ((now - open) / open) * 100 : 0;

  return (
    <div className="glass-sm mt-2 overflow-hidden rounded-xl border border-steel-line px-3 py-2.5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-bone">
          ${card.symbol}
          <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-bone-faint">
            24h
          </span>
        </span>
        <span className="tnum text-xs font-semibold text-bone">
          {fmtPrice(now)}
          <span
            className={`ml-2 text-[11px] font-medium ${
              up ? "text-gold-bright" : "text-ember-deep"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(2)}%
          </span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label={`${card.symbol} 24 hour price trend, ${
          up ? "up" : "down"
        } ${Math.abs(delta).toFixed(2)} percent`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {entryY !== null && (
          <>
            <line
              x1={padX}
              y1={entryY}
              x2={W - padX}
              y2={entryY}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 3"
              className="text-gold/40"
            />
            <text
              x={padX + 2}
              y={Math.max(entryY - 3, 9)}
              fill="currentColor"
              className="text-bone-faint"
              fontSize="9"
            >
              entry {fmtPrice(entryPrice)}
            </text>
          </>
        )}
        <path d={area} fill={`url(#${gradId})`} />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx={x1} cy={y1} r="3" fill={stroke} />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-bone-faint">
        <span className="tnum">24h ago {fmtPrice(open)}</span>
        <span className="uppercase tracking-wider">
          Call: {stance === "up" ? "rises" : "falls"}
        </span>
      </div>
    </div>
  );
}
