"use client";

import { useId, useMemo, useRef, useState, useCallback } from "react";

export interface ChartPoint {
  t: number;
  c: number;
}

interface Props {
  points: ChartPoint[];
  up: boolean;
  height?: number;
  className?: string;
  /* Fired as the member drags across the chart (null when they let go), so the
     page can update the big price header to the scrubbed point. */
  onScrub?: (point: ChartPoint | null) => void;
}

/*
  An interactive area chart with a draggable crosshair, X-style. Drag anywhere
  across it (mouse or touch) and a vertical line, a dot and a timestamp track
  your finger while the parent updates the headline price. Let go and it returns
  to live. Pure SVG plus a thin pointer overlay, no chart library. It draws only
  the closes it is handed, never invented data.
*/
export function InteractiveChart({
  points,
  up,
  height = 200,
  className = "",
  onScrub,
}: Props) {
  const gradientId = useId();
  const width = 600;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const valid = useMemo(
    () => points.filter((p) => Number.isFinite(p.c)),
    [points]
  );

  const geom = useMemo(() => {
    if (valid.length < 2) return null;
    const values = valid.map((p) => p.c);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.abs(max) || 1;
    const padY = height * 0.1;
    const usable = height - padY * 2;
    const coords = valid.map((p, i) => ({
      x: (i / (valid.length - 1)) * width,
      y: padY + (1 - (p.c - min) / span) * usable,
      leftPct: (i / (valid.length - 1)) * 100,
    }));
    const line = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
      .join(" ");
    return { coords, line, area: `${line} L${width},${height} L0,${height} Z` };
  }, [valid, height]);

  const pick = useCallback(
    (clientX: number) => {
      const el = wrapRef.current;
      if (!el || valid.length < 2) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const idx = Math.round(frac * (valid.length - 1));
      setActive(idx);
      onScrub?.(valid[idx]);
    },
    [valid, onScrub]
  );

  const end = useCallback(() => {
    setActive(null);
    onScrub?.(null);
  }, [onScrub]);

  if (!geom) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-bone-faint ${className}`}
        style={{ height }}
      >
        Not enough price history to chart.
      </div>
    );
  }

  const stroke = up ? "var(--gold-rich)" : "var(--ember)";
  const activePoint = active !== null ? geom.coords[active] : null;
  const activeData = active !== null ? valid[active] : null;

  return (
    <div
      ref={wrapRef}
      className={`relative touch-none select-none ${className}`}
      style={{ height }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 0 && e.pointerType === "mouse") {
          pick(e.clientX);
          return;
        }
        pick(e.clientX);
      }}
      onPointerUp={end}
      onPointerLeave={() => {
        if (active !== null) end();
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height }}
        role="img"
        aria-label="Price movement, drag to inspect"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.24" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={geom.area} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={geom.line}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Crosshair */}
      {activePoint && (
        <>
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-bone/30"
            style={{ left: `${activePoint.leftPct}%` }}
          />
          <div
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{
              left: `${activePoint.leftPct}%`,
              top: activePoint.y,
              borderColor: stroke,
              background: "var(--void, #0a0a0a)",
            }}
          />
          {activeData && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-md border border-steel-line bg-panel px-2 py-1 text-[10px] text-bone-mut"
              style={{
                left: `${Math.min(88, Math.max(12, activePoint.leftPct))}%`,
                bottom: -6,
              }}
            >
              {new Date(activeData.t).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
