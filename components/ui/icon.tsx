type IconProps = {
  name: string;
  className?: string;
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
};

export function Icon({ name, className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
