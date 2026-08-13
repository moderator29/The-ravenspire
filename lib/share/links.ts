/* Share links: what a shareable moment is, where it lives, and what may ride
 * along with it.
 *
 * Pure on purpose. Every decision in this file is one that has to hold for a
 * URL a stranger typed, a URL a crawler guessed and a URL a member pasted into
 * a group chat that mangled it, so all of it is testable without a database, a
 * request or a browser. lib/share/links.test.ts is the hostile half.
 *
 * TWO THINGS LIVE HERE AND THEY ARE DELIBERATELY THE SAME THING.
 *
 * 1. The path a share target resolves to, which the share control writes.
 * 2. The set of paths a signed-out visitor is allowed to read, which
 *    components/shell/shell-gate.tsx asks about before it bounces anybody.
 *
 * They are one list because the failure mode is them being two lists. A share
 * link that lands on a gated page is the single most common way a distribution
 * feature is broken in public: the card unfurls beautifully, the stranger
 * taps it, and the product redirects them to a sign-in wall before they have
 * seen a single reason to sign in. If a kind can be shared, its path is
 * readable signed out, and that is enforced by both facts coming out of one
 * table below.
 */

/* Every moment the realm can hand to somebody who is not in it. */
export type ShareKind =
  | "keep"
  | "call"
  | "house"
  | "crest"
  | "proof"
  | "listing";

export type ShareTarget =
  /* A member's Keep. */
  | { kind: "keep"; handle: string }
  /* One Call, open or resolved. */
  | { kind: "call"; id: string }
  /* One House and where it stands. */
  | { kind: "house"; slug: string }
  /* A crest a named member holds. Both halves are required: a crest with no
     holder is a catalogue entry, and the catalogue is not a moment. */
  | { kind: "crest"; handle: string; slug: string }
  /* A settled chest opening, by its draw reference. */
  | { kind: "proof"; reference: string }
  /* One card on the Bazaar. */
  | { kind: "listing"; id: string };

/* The realm's own shapes, checked before anything is interpolated into a path.
   A handle is what /api/onboard enforces; a uuid is what every id in the
   schema is; a house or crest slug is lowercase words joined by hyphens. */
const HANDLE = /^[a-z0-9_]{3,20}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* Handles are stored lowercase and compared lowercase everywhere else in the
   product, so a shared link written with the display casing has to normalise
   or the same Keep gets two URLs and two unfurl caches. Everything else is
   taken as written: a uuid is case-insensitive by regex but is stored as it
   was generated, and lowering a slug that is already lowercase is free. */
function normaliseHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  return HANDLE.test(handle) ? handle : null;
}

function normaliseSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  return SLUG.test(slug) && slug.length <= 64 ? slug : null;
}

function normaliseId(raw: string): string | null {
  const id = raw.trim();
  return UUID.test(id) ? id.toLowerCase() : null;
}

/* The path for a target, or null when the target does not describe anything
 * real.
 *
 * NULL RATHER THAN A BEST EFFORT PATH, and this is the whole reason the
 * function exists. Interpolating an unchecked handle straight into a template
 * is how a share control ends up publishing `/u/../../admin`, or a URL with a
 * fragment in the middle of it that truncates on paste. The caller's job is to
 * render no share control at all when this returns null, which is the honest
 * answer: there is nothing here to share.
 */
export function sharePath(target: ShareTarget): string | null {
  switch (target.kind) {
    case "keep": {
      const handle = normaliseHandle(target.handle);
      return handle ? `/u/${handle}` : null;
    }
    case "call": {
      const id = normaliseId(target.id);
      return id ? `/calls/${id}` : null;
    }
    case "house": {
      const slug = normaliseSlug(target.slug);
      return slug ? `/houses/${slug}` : null;
    }
    case "crest": {
      const handle = normaliseHandle(target.handle);
      const slug = normaliseSlug(target.slug);
      return handle && slug ? `/u/${handle}/crest/${slug}` : null;
    }
    case "proof": {
      const reference = normaliseId(target.reference);
      return reference ? `/proof/${reference}` : null;
    }
    case "listing": {
      const id = normaliseId(target.id);
      return id ? `/market/${id}` : null;
    }
    default:
      return null;
  }
}

/* The public read surfaces, as patterns rather than as strings, because
 * shell-gate has a pathname and not a target.
 *
 * Each one is the path shape sharePath can produce, and nothing else. They are
 * anchored at both ends so `/houses/lions/admin` is not public because
 * `/houses/lions` is, and they carry the same character classes so a path that
 * could never have come out of sharePath is never treated as one of ours.
 */
const PUBLIC_PATTERNS: RegExp[] = [
  /* A member's Keep, and the crest sub-page under it. */
  /^\/u\/[a-z0-9_]{3,20}$/,
  /^\/u\/[a-z0-9_]{3,20}\/crest\/[a-z0-9-]{1,64}$/,
  /^\/calls\/[0-9a-f-]{36}$/,
  /^\/houses\/[a-z0-9-]{1,64}$/,
  /^\/market\/[0-9a-f-]{36}$/,
  /* One raven. Not produced by sharePath, because a raven is not one of the
     six moments mission 10 is about, but it has carried an Open Graph card
     since long before this file existed and that card has been unfurling into
     a sign-in redirect the whole time. */
  /^\/post\/[0-9a-f-]{36}$/,
];

/* Whether a signed-out visitor may read this path.
 *
 * Trailing slashes are tolerated because link shorteners, chat clients and
 * copy-paste all add them, and a share link that works everywhere except
 * Telegram is a broken share link. A query string is not part of the pathname
 * and never reaches here.
 */
export function isPublicSharePath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  /* Lowercased for the same reason handles are: a Keep linked with display
     casing must not fall through the gate into a redirect. The page itself
     resolves the handle case-insensitively already. */
  const probe = path.toLowerCase();
  return PUBLIC_PATTERNS.some((re) => re.test(probe));
}

/* THE BANNER, AND WHERE THE LINE IS.
 *
 * `/banners` already mints the realm's referral link: `?banner=<handle>`,
 * which /welcome stows and /api/onboard credits when a recruit actually swears
 * the oath. Mission 10's share links reuse that exact parameter rather than
 * inventing a second one, because two referral seams is two sets of numbers
 * and one of them is always wrong.
 *
 * The line: a banner rides only when the sharer is sharing THEIR OWN moment.
 *
 * Sharing your own Keep, your own Call, your own crest, your own chest proof
 * or your own listing is you bringing somebody to the realm, and you should be
 * credited. Sharing SOMEBODY ELSE'S Keep is you pointing at them, and taking
 * the recruit for yourself would be quietly reassigning a member the subject
 * had at least as good a claim to. So `own: false` drops the banner entirely.
 *
 * That is the whole of the tracking. There is no click event, no per-recipient
 * identifier, no cookie set by the link and nothing written to a table when a
 * link is opened. Nothing is recorded until a real person completes onboarding
 * under the banner, which is a thing they did rather than a thing that
 * happened to them, and which the referral schema has always recorded anyway.
 * A link that phoned home on open would be a tracking pixel with a fantasy
 * theme, and it would also be worthless: what the realm wants to know is who
 * brought members, not who opened tabs.
 */
export type BannerOptions = {
  /* The sharer's handle, when they have one. */
  handle?: string | null;
  /* Whether the sharer is the subject of what they are sharing. */
  own: boolean;
};

export function bannerFor(opts: BannerOptions | null | undefined): string | null {
  if (!opts || !opts.own || !opts.handle) return null;
  return normaliseHandle(opts.handle);
}

/* The absolute URL to hand to the Web Share API, the clipboard or an anchor.
 *
 * `origin` comes from the browser at call time rather than from an environment
 * variable, so a preview deployment shares preview links and localhost shares
 * localhost links. A share control that always writes the production origin is
 * a share control nobody can test.
 */
export function shareUrl(
  origin: string,
  target: ShareTarget,
  banner?: BannerOptions | null
): string | null {
  const path = sharePath(target);
  if (!path) return null;
  let base: URL;
  try {
    base = new URL(path, origin);
  } catch {
    return null;
  }
  /* Only http(s). An origin that arrives as javascript: or data: is either a
     bug or an attack, and either way it must not become a link somebody taps. */
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  const code = bannerFor(banner);
  if (code) base.searchParams.set("banner", code);
  return base.toString();
}

/* The banner carried by an inbound URL, if it carries a real one.
 *
 * Read on the landing surface rather than only on /welcome, which is the seam
 * mission 10 actually needed: before this, a stranger who landed on a shared
 * Keep at `?banner=alice` and signed up from there lost the banner entirely,
 * because only /welcome ever looked for it. Every public share target now
 * stows it the same way /welcome does.
 *
 * Validated here rather than at the point of use. The value is attacker
 * controlled by definition (it is in a URL a stranger was handed), it gets
 * written to localStorage and later posted to /api/onboard, and a handle shape
 * is the cheapest possible thing to be sure of.
 */
export function readBanner(search: string | URLSearchParams): string | null {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  /* `?ref=` is the older spelling, minted by components/referral/referral-panel
     and components/wallet/wallet-earn as `/?ref=<code>`, and it is still in
     circulation on links members have already sent. Both spellings resolve
     here so there is one validator rather than two, and `banner` wins when a
     URL somehow carries both. */
  const raw = params.get("banner") ?? params.get("ref");
  if (!raw) return null;
  return normaliseHandle(raw);
}

/* Where a stowed banner lives between landing and swearing the oath. The same
   key /welcome has always used, so a recruit who lands on a shared Call, wanders
   the realm and then onboards still credits the member who sent them. */
export const BANNER_STORAGE_KEY = "rvn_banner";
