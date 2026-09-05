import { useId } from "react";

type IconProps = {
  name: string;
  className?: string;
  /* Every call site draws at 1.5 unless it asks for otherwise. A handful of
     surfaces (the bottom dock, so far) want a bolder, more confident mark at
     the same 24px grid, and duplicating the whole glyph set at a heavier
     weight for one surface is the wrong fix for that: the same path, drawn
     with a heavier stroke, is what "bolder" means here. */
  strokeWidth?: number;
  /* Draws the stroke in the house's own forged-gold gradient (the same
     bright-to-deep recipe as .gold-metal and .gold-text) instead of a flat
     currentColor. Reserved for a genuinely singular moment, the one active
     glyph in the bottom dock so far, the same way a crest is one gold shape
     rather than a whole page of them: this is not a colour swap any icon
     should reach for, it is the realm's own mark of "this one, right now". */
  gradient?: boolean;
};

/*
  Flat, consistent 24px stroke icon set. One visual language everywhere,
  no emoji in product chrome.
*/
const paths: Record<string, React.ReactNode> = {
  home: <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-9z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
    </>
  ),
  signal: (
    <>
      <path d="M6 18a8.5 8.5 0 0 1 0-12" />
      <path d="M18 6a8.5 8.5 0 0 1 0 12" />
      <path d="M8.8 15.2a4.5 4.5 0 0 1 0-6.4" />
      <path d="M15.2 8.8a4.5 4.5 0 0 1 0 6.4" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6l8-3z" />,
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  raven: (
    <>
      <path d="M20 6l-5.5.5C12 7 10.5 9 10.5 11.5V14L4 20l6.5-2.5L13 19l-1-3.5 3-1L20 6z" />
      <circle cx="15.4" cy="9.4" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  banner: <path d="M6 3h12v18l-6-4-6 4V3z" />,
  swords: (
    <>
      <path d="M4 4l10 10" />
      <path d="M20 4L10 14" />
      <path d="M6.5 17.5L4 20m2.5-2.5l2 2m-2-2l-2-2" />
      <path d="M17.5 17.5L20 20m-2.5-2.5l-2 2m2-2l2-2" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="14" r="5" />
      <path d="M9 10L6 3h4l2 4 2-4h4l-3 7" />
    </>
  ),
  bookmark: <path d="M7 3h10v18l-5-4-5 4V3z" />,
  flag: (
    <>
      <path d="M5 3v18" />
      <path d="M5 4h13l-3 4 3 4H5" />
    </>
  ),
  scroll: (
    <>
      <path d="M7 4h11a2 2 0 0 1 2 2v1h-4" />
      <path d="M16 7v13H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" />
      <path d="M8 11h5M8 15h5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 9h18" />
      <circle cx="16.5" cy="14" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="7" cy="17" r="2" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7-1 1.5-2.5 1.7-2.5.7-2.5 1.7 1 1.7 2.5 1.7 2.5-.7 2.5-1.7" />
    </>
  ),
  flame: <path d="M12 3c1 3-3 4.5-3 8a3.5 3.5 0 0 0 7 0c0-1-.4-1.8-1-2.6.2 2-1 2.6-1 2.6.6-3.4-1-6.5-2-8zM12 21a6 6 0 0 1-6-6c0-2.5 1.2-4 2.4-5.6" />,
  orb: (
    <>
      <circle cx="12" cy="11" r="6" />
      <path d="M8 20h8M10 17.5L9 20m5-2.5l1 2.5" />
      <path d="M9.5 9a3.5 3.5 0 0 1 2-1.5" />
    </>
  ),
  wall: (
    <>
      <path d="M3 20V8h18v12H3z" />
      <path d="M3 12h18M3 16h18M9 8v4M15 8v4M6 12v4M12 12v4M18 12v4M9 16v4M15 16v4" />
    </>
  ),
  bell: <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2zm4 4a2 2 0 0 0 4 0" />,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  crown: (
    <>
      <path d="M4 17l-1-9 5 4 4-7 4 7 5-4-1 9H4z" />
      <path d="M4 20h16" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16 16l5 5" />
    </>
  ),
  xlogo: <path d="M4 4l7.2 9.3L4.6 20h2.4l5.3-5.4L16.8 20H20l-7.5-9.7L18.9 4h-2.4l-4.8 5L7.2 4H4z" />,
  send: <path d="M21 3L10 14M21 3l-7 18-3-8-8-3 18-7z" />,
  arrow: <path d="M5 12h14m-6-6l6 6-6 6" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  heart: <path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" />,
  reply: <path d="M9 17l-5-5 5-5m-5 5h9a6 6 0 0 1 6 6v2" />,
  repost: <path d="M4 9l3-3m0 0l3 3M7 6v9a3 3 0 0 0 3 3h2m8-3l-3 3m0 0l-3-3m3 3V9a3 3 0 0 0-3-3h-2" />,
  share: <path d="M12 3v12m0-12L8 7m4-4l4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />,
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 18l5-5 3 3 4-4 4 4" />
    </>
  ),
  poll: <path d="M5 20V10m7 10V4m7 16v-7" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),

  /* Interface glyphs the primitive layer needs. `xlogo` above is the X brand
     mark and was the only cross in the set, so every dismiss control in the
     product was either borrowing a logo or drawing its own inline SVG. */
  close: <path d="M6 6l12 12M18 6L6 18" />,
  /* Rename, edit in place. The set had no glyph for editing at all, so the
     alternative was borrowing one that means something else, which is how a
     product ends up with a pen that means compose and a pen that means rename. */
  pencil: (
    <>
      <path d="M4 20.5l.9-3.6L15.7 6.1a2.3 2.3 0 0 1 3.2 3.2L8.1 20.1l-4.1.4z" />
      <path d="M14.3 7.5l2.2 2.2" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  "chevron-down": <path d="M6 9.5l6 6 6-6" />,
  "chevron-up": <path d="M6 14.5l6-6 6 6" />,
  "chevron-left": <path d="M14.5 6l-6 6 6 6" />,
  "chevron-right": <path d="M9.5 6l6 6-6 6" />,
  "chevron-updown": <path d="M8 10l4-4 4 4M8 14l4 4 4-4" />,
  alert: (
    <>
      <path d="M12 3.5l9 16H3l9-16z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.6" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8.2" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),

  /* These five were referenced by name across the product but never existed
     here, so every one of them silently rendered the fallback circle. */
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  docs: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  vision: (
    <>
      <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  spark: <path d="M12 3l2.2 6.1L20 12l-5.8 2.9L12 21l-2.2-6.1L4 12l5.8-2.9L12 3z" />,
  /* Honest as a drawer trigger, and nothing else: the top bar's menu control
     used to borrow the `user` glyph, which read as a profile shortcut and
     opened the side nav instead. */
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,

  /* The House sigils. Four of the six were missing, which meant House
     Frosthold, Stormcrest, Nightvale and Goldmane rendered as identical blank
     circles everywhere a sigil appears: the Houses page, the landing, the
     Reliquary's card backs, the Keep. Six banners that look the same are not
     six banners. Corvane (raven) and Emberfall (flame) were the only two that
     happened to share a name with an existing glyph, which is exactly why
     nobody spotted it: the page looked populated.

     scripts/check-house-rules.mjs now fails the build on an icon name that
     does not exist, so this cannot come back quietly. */
  snowflake: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
      <path d="M12 6.4l-2 -2M12 6.4l2 -2M12 17.6l-2 2M12 17.6l2 2" />
      <path d="M7.1 9.3l-2.7 -.4M7.1 14.7l-2.7 .4M16.9 9.3l2.7 -.4M16.9 14.7l2.7 .4" />
    </>
  ),
  storm: (
    <>
      <path d="M7 15a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.5 1.6A3.6 3.6 0 0 1 17.5 15" />
      <path d="M13 11l-3.5 5H12l-1.5 4.5L15 15h-2.5L14 11z" />
    </>
  ),
  moon: (
    <>
      <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.3 8.3 0 1 0 20 14.5z" />
      <path d="M16.5 5.5l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5.5-1.4z" />
    </>
  ),
  lion: (
    <>
      <path d="M12 3.5c3.6 0 6.5 2.9 6.5 6.5 0 4.3-2.9 8-6.5 10.5C8.4 18 5.5 14.3 5.5 10c0-3.6 2.9-6.5 6.5-6.5z" />
      <path d="M9.6 9.6h.01M14.4 9.6h.01" />
      <path d="M10.4 13.2c.5.5 1 .8 1.6.8s1.1-.3 1.6-.8" />
    </>
  ),

  /* Three more that were referenced by name and never existed, same silent
     fallback, found by the same sweep. */
  feather: (
    <>
      <path d="M20 4c-6 0-11 3.6-11 10v4l-3 2" />
      <path d="M9 18c6.5 0 11-4.6 11-11V4" />
      <path d="M11 12h6" />
    </>
  ),
  badge: (
    <>
      <path d="M12 3l2.4 1.7 2.9-.2.9 2.8 2.4 1.7-1.1 2.7 1.1 2.7-2.4 1.7-.9 2.8-2.9-.2L12 21l-2.4-1.7-2.9.2-.9-2.8L3.4 15l1.1-2.7L3.4 9.6l2.4-1.7.9-2.8 2.9.2L12 3z" />
    </>
  ),
  features: (
    <>
      <path d="M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 13h7v5h-7z" />
    </>
  ),
  ledger: (
    <>
      <path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4z" />
      <path d="M5 4v14a2 2 0 0 0 2 2" />
      <path d="M10 9h6M10 13h6" />
    </>
  ),
};

export function Icon({
  name,
  className = "h-5 w-5",
  strokeWidth = 1.5,
  gradient = false,
}: IconProps) {
  /* useId(), not a module counter. This exact glyph set is drawn on every
     dense list in the product, so anything that needs a per-instance id has
     to survive being mounted dozens of times on one screen and matching
     between server and client: a mutable counter here is the precise bug
     CrestRoundel carried (components/brand/crests.tsx), fixed once already
     this session, not one to reintroduce in the primitive every icon in the
     realm renders through. */
  const gradId = useId();
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={gradient ? `url(#${gradId})` : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {gradient && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold-bright)" />
            <stop offset="46%" stopColor="var(--gold)" />
            <stop offset="100%" stopColor="var(--gold-deep)" />
          </linearGradient>
        </defs>
      )}
      {paths[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
