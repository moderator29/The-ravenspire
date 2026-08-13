/* THE SHARE CARD CHASSIS.
 *
 * One frame, many bodies, which is design system section 5 applied to the one
 * surface that leaves the product. Before mission 10 there were four Open Graph
 * routes and four hand drawn frames: four copies of the obsidian ground, four
 * gold radials at three different opacities, four "R" marks at three different
 * border widths, and four opinions about how big a wordmark is. Nobody would
 * ever see two of them side by side, which is exactly why they drifted, and it
 * is also exactly why it matters: an unfurled card is often the first thing
 * anybody sees of this product, and four first impressions is none.
 *
 * REGISTER: Forge, and this is one of the few places rule 21 genuinely allows
 * it. A share card is a moment someone chose to show other people. It is not a
 * surface anybody reads twice, it cannot be scrolled past, and nothing else on
 * it competes for attention, so gold on it costs nothing and earns the click.
 * The Ledger discipline still applies to the CONTENT: real numbers or no
 * numbers, and never a stat invented to fill a column.
 *
 * WHY THE COLOURS ARE LITERAL HEX AND NOT TOKENS. Satori, which is what renders
 * these, resolves neither CSS custom properties nor Tailwind. Every value below
 * is copied from app/globals.css with the token name beside it so the two can be
 * compared by eye when the palette moves. This is the one file in the product
 * allowed to hold brand hex, and it holds them once rather than nine times.
 *
 * WHY NO Icon COMPONENT. Same reason: Icon draws with `currentColor` and a
 * className, and Satori has neither cascade nor Tailwind. Inline SVG renders
 * perfectly well, so `OgGlyph` carries the same paths components/ui/icon.tsx
 * draws, copied deliberately rather than imported across a renderer boundary.
 * Rule 2 is about emoji standing in for icons, and this is the opposite of
 * that: it is the realm's own glyph, in the realm's own geometry.
 */

/* app/globals.css, verbatim. */
export const OG = {
  obsidian: "#07070A",
  void: "#0C0C11",
  gold: "#D9B040",
  goldBright: "#FFE9A3",
  goldDeep: "#8F6717",
  bone: "#ECE4D2",
  boneMut: "#B4AC9A",
  boneFaint: "#837C6E",
  steel: "#747D8B",
  steelLine: "#2A2E38",
  ember: "#E5702A",
  emberDeep: "#C6402F",
} as const;

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

/* Cinzel and Inter are loaded through next/font in the app, which is a browser
   mechanism Satori cannot reach. The stacks below are what the renderer
   actually has, so the display face is a serif and the body face is a sans. A
   share card in the wrong face still reads as this product because the
   composition carries it; a share card that waits on a font file does not
   render at all. */
export const OG_SERIF = "ui-serif, Georgia, 'Times New Roman', Times, serif";
export const OG_SANS = "ui-sans-serif, system-ui, sans-serif";

/* Satori supports a subset of flexbox and requires `display` on anything with
   more than one child, which is why every wrapper below states it explicitly.
   A missing `display: flex` is a silent blank card rather than an error. */

export type OgStat = {
  label: string;
  value: string;
  /* Gold by default. Ember marks a loss or a refusal, which is the only place
     the card is allowed a second hue (rule 13: down is ember, never red as a
     brand colour, and never green for up). */
  tone?: "gold" | "ember" | "bone";
};

export type OgCardProps = {
  /* The small tracked line above the headline. The realm's own lexicon:
     "THE KEEP", "A CALL, RESOLVED", "THE BAZAAR". */
  kicker: string;
  /* The subject, in the display face. One line, already trimmed by the caller
     to something that fits. */
  headline: string;
  /* Supporting identity under the headline: a handle, a House, a price. */
  subline?: string | null;
  /* The body, when the subject has words of its own (a raven, a Call's
     reasoning). Rendered in the display face at reading size. */
  body?: string | null;
  /* Up to four real numbers. An empty array is correct and common: a member
     with nothing to show gets a card with nothing on it rather than a zero
     dressed up as a statistic. */
  stats?: OgStat[];
  /* A verdict chip on the right of the footer: HIT, MISS, SOLD, SEALED. */
  verdict?: { label: string; tone: "gold" | "ember" | "steel" } | null;
  /* Replaces the stat row entirely, for the one card whose footer is not a row
     of numbers: a raven's engagement band, which is glyphs and counts rather
     than labelled statistics. Passed in rather than added to OgCard as a prop
     only one caller would ever set. */
  footer?: React.ReactNode;
  /* The corner the gold radial falls from. Varied per subject so a feed of
     shared Ravenspire links does not read as one image repeated. */
  glow?: "left" | "right";
};

const TONE: Record<"gold" | "ember" | "bone" | "steel", string> = {
  gold: OG.gold,
  ember: OG.ember,
  bone: OG.bone,
  steel: OG.steel,
};

function Wordmark({ kicker }: { kicker: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        color: OG.gold,
        fontSize: 24,
        letterSpacing: 8,
        fontFamily: OG_SERIF,
        fontWeight: 700,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 52,
          height: 52,
          /* Rule 9: a rounded rectangle, off the radius scale, never a
             capsule. --radius-lg is 14px. */
          borderRadius: 14,
          border: `4px solid ${OG.gold}`,
          marginRight: 20,
          fontSize: 36,
        }}
      >
        R
      </div>
      THE RAVENSPIRE
      {kicker ? (
        <span style={{ color: OG.boneFaint, marginLeft: 18 }}>
          {`·  ${kicker}`}
        </span>
      ) : null}
    </div>
  );
}

/* The realm's flat glyphs, for the few cards that need one. The `d` strings are
   the same ones components/ui/icon.tsx draws. */
export const OG_GLYPH = {
  heart: "M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z",
  repost:
    "M4 9l3-3m0 0l3 3M7 6v9a3 3 0 0 0 3 3h2m8-3l-3 3m0 0l-3-3m3 3V9a3 3 0 0 0-3-3h-2",
  reply: "M9 17l-5-5 5-5m-5 5h9a6 6 0 0 1 6 6v2",
  lock: "M7 11V8a5 5 0 0 1 10 0v3",
} as const;

export function OgGlyph({
  path,
  color = OG.boneMut,
  lead = 0,
  size = 30,
}: {
  path: string;
  color?: string;
  lead?: number;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginLeft: lead, marginRight: 10 }}
    >
      <path d={path} />
    </svg>
  );
}

export function OgCard({
  kicker,
  headline,
  subline,
  body,
  stats = [],
  verdict = null,
  footer = null,
  glow = "right",
}: OgCardProps) {
  const glowAt = glow === "left" ? "18% 6%" : "82% 8%";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: OG.obsidian,
        /* Warm candlelight, never cool (rule 13), and one atmospheric effect
           rather than two (design system section 7). */
        backgroundImage: `radial-gradient(circle at ${glowAt}, rgba(217,176,64,0.18), rgba(7,7,10,0) 58%)`,
        padding: 72,
        fontFamily: OG_SANS,
      }}
    >
      <Wordmark kicker={kicker} />

      {/* The subject. It takes the room between the wordmark and the footer
          and centres in it, which is what keeps the honest empty card (no
          stats, no verdict, no footer at all) from leaving the bottom of a
          1200x630 frame visibly unfinished. That card is the one most likely
          to be seen by somebody who has never heard of this product. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: 24,
          paddingBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            color: OG.bone,
            /* Long names get a smaller face rather than a clipped one. A
               headline that runs off the right edge of a share card is the
               most visible possible bug in this feature. */
            fontSize: headline.length > 28 ? 60 : 78,
            fontWeight: 700,
            fontFamily: OG_SERIF,
            lineHeight: 1.1,
          }}
        >
          {headline}
        </div>
        {subline ? (
          <div
            style={{
              display: "flex",
              marginTop: 14,
              color: OG.boneMut,
              fontSize: 32,
            }}
          >
            {subline}
          </div>
        ) : null}
        {body ? (
          <div
            style={{
              display: "flex",
              marginTop: 22,
              color: OG.bone,
              fontSize: 40,
              lineHeight: 1.28,
              fontFamily: OG_SERIF,
            }}
          >
            {body}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 56 }}>
          {footer}
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{ display: "flex", flexDirection: "column" }}
            >
              <span
                style={{
                  color: TONE[stat.tone ?? "gold"],
                  fontSize: 54,
                  fontWeight: 700,
                }}
              >
                {stat.value}
              </span>
              <span
                style={{ color: OG.boneFaint, fontSize: 24, letterSpacing: 4 }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>
        {verdict ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 28px",
              borderRadius: 14,
              border: `2px solid ${TONE[verdict.tone]}`,
              color: TONE[verdict.tone],
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 6,
            }}
          >
            {verdict.label}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* Trim a line of member-written text to something that fits the card without
 * cutting a word in half.
 *
 * Deliberately not a CSS line clamp: Satori's clamp support is partial, and a
 * card whose body silently overflows the frame on one renderer is worse than a
 * card that is short. The ellipsis is a real one rather than three periods,
 * because it is a character and not punctuation, so rule 1 is not in play.
 */
export function ogTrim(raw: string | null | undefined, max: number): string | null {
  if (!raw) return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/* THE HONEST EMPTY CARD.
 *
 * What every image route renders when its subject cannot be read: it does not
 * exist, it was removed, it is sealed behind a flag, or the database was
 * unreachable at the moment a crawler asked. One card for all four, because
 * from outside the realm they are the same fact: there is nothing here to show
 * you, and here is what this place is.
 *
 * It carries no numbers at all, which is the point. The tempting version of
 * this card has a plausible member on it, or the realm's headline totals, and
 * either would be the product inventing data at the exact moment it has none
 * (rule 4). It is also the most damaging place to do it, because unlike a
 * surface inside the app, a share card is seen by people who have no way to
 * check it and no reason yet to give the realm the benefit of the doubt.
 */
export const OG_GENERIC: OgCardProps = {
  kicker: "",
  headline: "The Ravenspire",
  subline: "Make the call. Earn your name.",
  body: null,
  stats: [],
  glow: "right",
};

/* A whole number with thousands separators, the way every Board in the product
   renders one. Fractions never appear on a share card: Renown, Glory, copies
   and members are all counts. */
export function ogNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return Math.trunc(value).toLocaleString("en-US");
}
