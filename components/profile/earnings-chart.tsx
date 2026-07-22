"use client";

import { useId } from "react";

/* Dependency-free cumulative earnings chart for The Coffers: a forged-gold
   area under a gold line, drawn as pure inline SVG. No libraries, no canvas.
   The path is a static shape, so it is inherently reduced-motion safe; the
   only motion is a subtle pulse on the leading dot, which the global
   reduced-motion rule neutralizes. The series is a windowed cumulative total,
   so a quiet window renders as an honest flat line rather than a faked trend. */

export interface EarningsPoint {
  t: string;
  v: number;
}

const W = 320;
const H = 104;
const PAD_Y = 12;

export function EarningsChart({
  series,
  emptyLabel = "Not enough history yet to chart. Earn on to watch it climb.",
  className = "",
}: {
  series: EarningsPoint[];
  emptyLabel?: string;
  className?: string;
}) {
  const gradId = useId();
  const lineId = useId();

  if (series.length < 2) {
    return (
      <div
        className={`flex h-[104px] items-center justify-center rounded-2xl border border-steel-line/60 bg-void/40 ${className}`}
      >
        <p className="px-4 text-center text-xs text-bone-faint">{emptyLabel}</p>
      </div>
    );
  }

  const times = series.map((p) => Date.parse(p.t));
  const minT = times[0];
  const maxT = times[times.length - 1];
  const spanT = maxT - minT || 1;

  const values = series.map((p) => p.v);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(...values, 1);
  const spanV = maxV - minV || 1;

  const x = (t: number) => ((t - minT) / spanT) * W;
  const y = (v: number) => H - PAD_Y - ((v - minV) / spanV) * (H - PAD_Y * 2);

  const pts = series.map((p) => ({ x: x(Date.parse(p.t)), y: y(p.v) }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = pts[pts.length - 1];

  /* Flat window: every value equal (no earning events landed inside it). */
  const flat = maxV - Math.min(...values) < 1e-9;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Cumulative $RSP earned over the selected window"
      className={`h-[104px] w-full ${className}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold-bright)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--gold-deep)" />
          <stop offset="55%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="var(--gold-bright)" />
        </linearGradient>
      </defs>

      {/* Faint baseline + mid gridlines for depth, non-scaling so they stay
          hairline-thin regardless of the stretched viewBox. */}
      {[0.5].map((f) => (
        <line
          key={f}
          x1="0"
          x2={W}
          y1={H * f}
          y2={H * f}
          stroke="var(--steel-line)"
          strokeWidth="1"
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
          opacity="0.5"
        />
      ))}

      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={`url(#${lineId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={flat ? 0.6 : 1}
      />
      <circle cx={last.x} cy={last.y} r="3" fill="var(--gold-bright)" />
      {!flat && (
        <circle
          cx={last.x}
          cy={last.y}
          r="6"
          fill="var(--gold-bright)"
          opacity="0.35"
          className="animate-ping"
        />
      )}
    </svg>
  );
}
