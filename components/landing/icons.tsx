/*
  The Ravenspire landing icon set. A refined, thin-line premium family used across
  the landing and sign-in. One visual language: 24px canvas, 1.4 stroke, round
  caps and joins, no fills except deliberate accent dots. No emoji, ever.

  Kept separate from the shared components/ui/icon.tsx (which the product app
  uses) so the marketing surface can carry a slightly lighter, slicker line.
*/

type LandingIconProps = {
  name: LandingIconName;
  className?: string;
  strokeWidth?: number;
};

const paths = {
  /* ----- navigation + chrome ----- */
  overview: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 18l9 5 9-5" opacity="0.55" />
    </>
  ),
  features: (
    <>
      <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.4L12 17l-1.9-5.6L4.5 10l5.6-1.4L12 3z" />
      <path d="M18.5 15l.6 1.8 1.9.4-1.9.4-.6 1.8-.6-1.8-1.9-.4 1.9-.4.6-1.8z" opacity="0.7" />
    </>
  ),
  games: (
    <>
      <path d="M4 16.5l-1-9 4.6 3.3L12 4l4.4 6.8L21 7.5l-1 9H4z" />
      <path d="M4 20h16" />
    </>
  ),
  realm: (
    <>
      <path d="M4 21V9l3-1.8V4h3v2.2l2-1.2 2 1.2V4h3v3.2L20 9v12H4z" />
      <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
    </>
  ),
  docs: (
    <>
      <path d="M7 3.5h8.5L19 7v13.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M15 3.5V7h4" />
      <path d="M9 12.5h6M9 16h4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,

  /* ----- motion cues ----- */
  arrowRight: <path d="M4 12h15m-6-6l6 6-6 6" />,
  arrowUpRight: <path d="M7 17L17 7m0 0H8m9 0v9" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,

  /* ----- narrative: mission, vision, history ----- */
  mission: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  vision: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 1 2.6 5.9" />
      <path d="M4 20v-4h4" />
      <path d="M12 8v4.3l2.8 1.7" />
    </>
  ),

  /* ----- trust / non-custodial ----- */
  shield: <path d="M12 3l7.5 2.6v5.6c0 4.4-3 7.4-7.5 8.7-4.5-1.3-7.5-4.3-7.5-8.7V5.6L12 3z" />,
  shieldKey: (
    <>
      <path d="M12 3l7.5 2.6v5.6c0 4.4-3 7.4-7.5 8.7-4.5-1.3-7.5-4.3-7.5-8.7V5.6L12 3z" />
      <circle cx="10.5" cy="10.5" r="2.2" />
      <path d="M12 12l2.6 2.6m-1 .1l1-1" />
    </>
  ),
  key: (
    <>
      <circle cx="8.5" cy="8.5" r="4" />
      <path d="M11.5 11.5L20 20m-3-1l2-2m-4-1l1.5-1.5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="6" width="17" height="12.5" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <circle cx="16.5" cy="14" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  scale: (
    <>
      <path d="M12 4v16M6 20h12" />
      <path d="M12 6l-6 2 2.4 4.4a2.6 2.6 0 0 1-4.8 0L6 8m6 0l6 2-2.4 4.4a2.6 2.6 0 0 0 4.8 0L18 10" />
    </>
  ),
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  badge: (
    <>
      <path d="M12 3l2.2 1.6 2.7-.2.8 2.6 2.2 1.6-1 2.5 1 2.5-2.2 1.6-.8 2.6-2.7-.2L12 21l-2.2-1.6-2.7.2-.8-2.6L4.1 15.4l1-2.5-1-2.5 2.2-1.6.8-2.6 2.7.2L12 3z" />
      <path d="M9.2 12l1.9 1.9L15 10" />
    </>
  ),

  /* ----- feature glyphs ----- */
  feed: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M7 9h6M7 12.5h10M7 16h8" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  crown: (
    <>
      <path d="M4 16.5l-1-9 4.6 3.3L12 4l4.4 6.8L21 7.5l-1 9H4z" />
      <path d="M4 20h16" />
    </>
  ),
  swords: (
    <>
      <path d="M4 4l10 10M20 4L10 14" />
      <path d="M6.5 17.5L4 20m2.5-2.5l2 2m-2-2l-2-2M17.5 17.5L20 20m-2.5-2.5l-2 2m2-2l2-2" />
    </>
  ),
  banner: <path d="M6 3.5h12v17l-6-4-6 4v-17z" />,
  flame: (
    <path d="M12 3c1 3-3 4.5-3 8a3.5 3.5 0 0 0 7 0c0-1-.4-1.8-1-2.6.2 2-1 2.6-1 2.6.6-3.4-1-6.5-2-8zM12 21a6 6 0 0 1-6-6c0-2.5 1.2-4 2.4-5.6" />
  ),
  ledger: (
    <>
      <path d="M5 4.5a1.5 1.5 0 0 1 1.5-1.5H19v14.5H6.5A1.5 1.5 0 0 0 5 19V4.5z" />
      <path d="M5 19a1.5 1.5 0 0 0 1.5 1.5H19" />
      <path d="M9 8h6M9 11.5h4" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.4 8.6l-2.1 4.7-4.7 2.1 2.1-4.7 4.7-2.1z" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.6 10c0-1 1-1.7 2.4-1.7s2.4.7 2.4 1.7-1 1.5-2.4 1.7-2.4.7-2.4 1.7 1 1.7 2.4 1.7 2.4-.7 2.4-1.7" />
    </>
  ),
  spark: (
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5L15 9M9 15l-2.5 2.5" />
  ),
  layers: (
    <>
      <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8 12 3.5z" />
      <path d="M4 12l8 4.3L20 12M4 16l8 4.3L20 16" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.4" />
      <path d="M3.5 19.5c1-3 3.3-4.5 5.5-4.5s4.5 1.5 5.5 4.5" />
      <path d="M16 5.4a3.4 3.4 0 0 1 0 6.4M17.5 15c1.6.6 2.8 1.9 3.5 4" />
    </>
  ),
  signal: (
    <>
      <path d="M6 18a8.5 8.5 0 0 1 0-12M18 6a8.5 8.5 0 0 1 0 12" />
      <path d="M8.8 15.2a4.5 4.5 0 0 1 0-6.4M15.2 8.8a4.5 4.5 0 0 1 0 6.4" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M4 7.5l8 5.5 8-5.5" />
    </>
  ),
  xlogo: <path d="M4 4l7.2 9.3L4.6 20h2.4l5.3-5.4L16.8 20H20l-7.5-9.7L18.9 4h-2.4l-4.8 5L7.2 4H4z" />,
  raven: (
    <>
      <path d="M20 6l-5.5.5C12 7 10.5 9 10.5 11.5V14L4 20l6.5-2.5L13 19l-1-3.5 3-1L20 6z" />
      <circle cx="15.4" cy="9.4" r="0.55" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
} satisfies Record<string, React.ReactNode>;

export type LandingIconName = keyof typeof paths;

export function LandingIcon({
  name,
  className = "h-5 w-5",
  strokeWidth = 1.4,
}: LandingIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
