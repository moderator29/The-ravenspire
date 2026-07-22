import type { AllocSlice } from "@/components/ledger/portfolio-data";

/* A hand-rolled SVG donut. No chart library: each slice is an arc drawn as a
   stroked circle with a dasharray of [arc-length, remainder] and a running
   dashoffset, the whole ring rotated so it starts at twelve o'clock. Degrades
   to a hollow steel ring when there is nothing to show. */
export function Donut({
  slices,
  size = 168,
  thickness = 20,
}: {
  slices: AllocSlice[];
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;

  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Allocation breakdown"
    >
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="var(--steel-line)"
          strokeWidth={thickness}
          opacity={0.5}
        />
        {total > 0 &&
          slices.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={`${s.label}-${i}`}
                cx={cx}
                cy={cx}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              >
                <title>{`${s.label} ${s.pct.toFixed(1)}%`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
      </g>
    </svg>
  );
}
