"use client";

import { useId, useMemo, useRef, useState, useCallback } from "react";

export interface ChartPoint {
  t: number;
  c: number;
  o?: number;
  h?: number;
  l?: number;
}

interface Props {
  points: ChartPoint[];
  up: boolean;
  height?: number;
  className?: string;
  /* "line" is the smooth area chart; "candle" draws OHLC candles when the
     points carry open/high/low. */
  mode?: "line" | "candle";
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
  mode = "line",
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

  const hasOHLC = useMemo(
    () =>
      valid.length >= 2 &&
      valid.every(
        (p) =>
          Number.isFinite(p.o) && Number.isFinite(p.h) && Number.isFinite(p.l)
      ),
    [valid]
  );
  const candle = mode === "candle" && hasOHLC;

  const geom = useMemo(() => {
    if (valid.length < 2) return null;
    const padY = height * 0.1;
    const usable = height - padY * 2;
    // In candle mode scale to the full high/low range so wicks fit; in line
    // mode scale to the closes.
    const lows = candle ? valid.map((p) => p.l as number) : valid.map((p) => p.c);
    const highs = candle ? valid.map((p) => p.h as number) : valid.map((p) => p.c);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = max - min || Math.abs(max) || 1;
    const yOf = (v: number) => padY + (1 - (v - min) / span) * usable;

    const coords = valid.map((p, i) => ({
      x: (i / (valid.length - 1)) * width,
      y: yOf(p.c),
      leftPct: (i / (valid.length - 1)) * 100,
    }));
    const line = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
      .join(" ");

    const step = width / valid.length;
    const bodyW = Math.max(1.5, Math.min(14, step * 0.62));
    const candles = candle
      ? valid.map((p, i) => {
          const x = step * (i + 0.5);
          const o = yOf(p.o as number);
          const c = yOf(p.c);
          const up = (p.c ?? 0) >= (p.o ?? 0);
          return {
            x,
            bodyW,
            top: Math.min(o, c),
            bodyH: Math.max(1, Math.abs(c - o)),
            wickTop: yOf(p.h as number),
            wickBottom: yOf(p.l as number),
            up,
          };
        })
      : [];

    return {
      coords,
      line,
      area: `${line} L${width},${height} L0,${height} Z`,
      candles,
    };
  }, [valid, height, candle]);

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
        {candle ? (
          geom.candles.map((c, i) => {
            const col = c.up ? "var(--gold-rich)" : "var(--ember)";
            return (
              <g key={i}>
                <line
                  x1={c.x}
                  x2={c.x}
                  y1={c.wickTop}
                  y2={c.wickBottom}
                  stroke={col}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={c.x - c.bodyW / 2}
                  y={c.top}
                  width={c.bodyW}
                  height={c.bodyH}
                  fill={col}
                />
              </g>
            );
          })
        ) : (
          <>
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
          </>
        )}
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
