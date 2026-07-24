"use client";

import { useId } from "react";

export interface ChartPoint {
  t: number;
  c: number;
  o?: number;
  h?: number;
  l?: number;
}

interface Props {
  points: ChartPoint[];
  /** Drives the stroke colour; up is gold, down is ember. */
  up: boolean;
  className?: string;
  height?: number;
}

/*
  A lightweight inline SVG area chart. No canvas, no chart library, no network
  of its own: it draws exactly the closes it is handed. When only two points
  exist (an honest 24h-implied line built from current price and 24h change),
  it still renders as a clean straight move, and the caller labels it as such
  so nothing is dressed up as candles it never had.
*/
export function PriceChart({ points, up, className = "", height = 132 }: Props) {
  const gradientId = useId();
  const width = 600;

  const valid = points.filter((p) => Number.isFinite(p.c));
  if (valid.length < 2) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-bone-faint ${className}`}
        style={{ height }}
      >
        Not enough price history to chart.
      </div>
    );
  }

  const values = valid.map((p) => p.c);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const padY = height * 0.12;
  const usable = height - padY * 2;

  const stroke = up ? "var(--gold-rich)" : "var(--ember)";

  const coords = valid.map((p, i) => {
    const x = (i / (valid.length - 1)) * width;
    const y = padY + (1 - (p.c - min) / span) * usable;
    return { x, y };
  });

  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height }}
      role="img"
      aria-label="Recent price movement"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
