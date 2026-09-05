"use client";

/* The climb: a windowed cumulative-points line for The Coffers.

   Dependency-free inline SVG, same house pattern as app/admin/page.tsx's
   Sparkline: one polyline plus a matching polygon fill, gold from the token,
   no chart library (rule 19 forbids a new dependency for a chart). Rebuilt
   smaller and quieter than the previous version, which carried its own
   two-stop line gradient and a row of candle bars: a Ledger surface earns no
   ornament budget, so one line and one soft fill say everything a member
   needs to read here. The path is a static shape, so it is inherently
   reduced-motion safe. The series is a windowed cumulative total, so a quiet
   window renders as an honest flat line rather than a faked trend. */

export interface EarningsPoint {
  t: string;
  v: number;
}

const W = 300;
const H = 64;
const PAD_Y = 6;

export function EarningsChart({
  series,
  emptyLabel = "Not enough history yet to chart. Earn on to watch it climb.",
  className = "",
}: {
  series: EarningsPoint[];
  emptyLabel?: string;
  className?: string;
}) {
  if (series.length < 2) {
    return (
      <div
        className={`flex h-16 items-center justify-center rounded-md border border-steel-line/60 bg-void/40 ${className}`}
      >
        <p className="px-4 text-center text-[11px] text-bone-faint">
          {emptyLabel}
        </p>
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
  const linePoints = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const areaPoints = `0,${H} ${linePoints} ${W},${H}`;
  const last = pts[pts.length - 1];

  /* Flat window: every value equal, no earning events landed inside it. */
  const flat = maxV - Math.min(...values) < 1e-9;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Cumulative points earned over the selected window"
      className={`h-16 w-full ${className}`}
    >
      <polygon points={areaPoints} fill="var(--gold)" fillOpacity="0.12" />
      <polyline
        points={linePoints}
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={flat ? 0.55 : 1}
      />
      <circle cx={last.x} cy={last.y} r="2.5" fill="var(--gold-bright)" />
    </svg>
  );
}
