/* Pump.fun's own capsule mark, redrawn as a plain inline SVG rather than a
   raster asset: transparent by construction, crisp at any size, and themed
   correctly with no background to strip out. Fixed brand colours (the real
   mark is a fixed two-tone capsule, not a themable icon), same posture
   components/brand/raven-mark.tsx takes for the realm's own crest. */
export function PumpfunMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(45 50 50)">
        <rect x="30" y="8" width="40" height="84" rx="20" fill="#0C2B22" />
        <rect x="32" y="10" width="36" height="80" rx="18" fill="#FFFFFF" />
        <path
          d="M32 50 h36 v22 a18 18 0 0 1 -18 18 a18 18 0 0 1 -18 -18 z"
          fill="#3DBA7D"
        />
        <path
          d="M42 66 q6 6 14 2"
          stroke="#FFFFFF"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}
