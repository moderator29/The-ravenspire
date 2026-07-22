let gradientSeq = 0;

/*
  The Ravenspire sigil: sharp angular raven, swept pointed feathers,
  diamond head with the all-seeing eye, long tapered tail. Forged-gold
  gradient fill, never flat.
*/
export function RavenMark({ className = "h-12 w-12" }: { className?: string }) {
  const id = `rv-gold-${gradientSeq++}`;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F0D68C" />
          <stop offset="48%" stopColor="#C8A24C" />
          <stop offset="100%" stopColor="#8A6A2C" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        {/* head spike */}
        <path d="M50 4 L53 14 L50 24 L47 14 Z" />
        {/* diamond head with dark eye */}
        <path d="M50 20 L56 30 L50 40 L44 30 Z" />
        {/* left wing, three swept blades */}
        <path d="M48 34 C36 26 20 24 4 30 C18 35 32 39 47 42 Z" />
        <path d="M48 42 C38 40 24 42 12 48 C24 50 36 50 47 48 Z" />
        <path d="M48 50 C40 50 30 54 24 60 C32 60 40 57 47 54 Z" />
        {/* right wing, mirrored */}
        <path d="M52 34 C64 26 80 24 96 30 C82 35 68 39 53 42 Z" />
        <path d="M52 42 C62 40 76 42 88 48 C76 50 64 50 53 48 Z" />
        <path d="M52 50 C60 50 70 54 76 60 C68 60 60 57 53 54 Z" />
        {/* tapered tail */}
        <path d="M50 44 L54 62 L50 92 L46 62 Z" />
      </g>
      {/* the all-seeing eye */}
      <circle cx="50" cy="30" r="2.2" fill="#07070A" />
    </svg>
  );
}
