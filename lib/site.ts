/* WHERE THE REALM LIVES, in one place.
 *
 * The canonical origin was written out by hand in four files and it was three
 * different hosts: `app/layout.tsx`, `app/robots.ts` and `app/sitemap.ts` all
 * said `ravenspire.vercel.app`, and the checkout return URL fell back to
 * `ravenspire.app`, which the realm has never owned. The live domain is neither
 * of those, so every one of them was wrong at the same time and nothing failed,
 * because a wrong absolute URL renders perfectly and only misbehaves on somebody
 * else's machine.
 *
 * WHAT THIS IS FOR, and it is narrower than it looks. Almost nothing in the
 * product should call this. A share link takes its origin from the browser at
 * call time (see lib/share/links.ts) and a checkout return URL prefers the
 * request's own origin, both deliberately, so that a preview deployment writes
 * preview links and localhost writes localhost links. Hardcoding production into
 * those is how a member on a preview build copies a link to a deployment that
 * does not have their data.
 *
 * This exists for the handful of places that genuinely have no request and no
 * browser to ask: metadataBase, robots.txt and the sitemap, all of which are
 * built at compile time and must name an absolute, public, canonical host.
 *
 * THE FALLBACK IS THE REAL DOMAIN, not a placeholder. If the environment
 * variable is missing, the honest default is where the realm actually is, so a
 * misconfigured deployment still points members somewhere true rather than at a
 * host that stopped being canonical.
 */

const CANONICAL = "https://theravenspire.xyz";

/* Reuses NEXT_PUBLIC_APP_URL rather than inventing a second name. That variable
   already existed for checkout return URLs, and two variables for one origin is
   how a deployment ends up half moved to a new domain. */
export function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!env) return CANONICAL;
  /* A trailing slash here becomes a double slash in every URL built from it,
     and a value that is not a URL at all would throw at module load in
     metadataBase, taking the whole build down for a typo in an env var. Neither
     is worth risking for a variable a human types once. */
  try {
    const url = new URL(env);
    if (url.protocol !== "https:" && url.protocol !== "http:") return CANONICAL;
    return url.origin;
  } catch {
    return CANONICAL;
  }
}

/* WHERE THE REALM SPEAKS ON X, in one place, for the same reason the origin
 * is: an account handle written out by hand in the footer is a handle that
 * gets corrected in the footer and nowhere else.
 *
 * UNVERIFIED, and stated so. "ravenspire" was typed into the footer without
 * anyone confirming the realm owns that account on X, and a social link that
 * points at somebody else's account is worse than no link. It lives here so
 * the day the founder confirms the real handle, one edit fixes every surface
 * that names it.
 */
export const X_HANDLE = "ravenspire";

export function xUrl(): string {
  return `https://x.com/${X_HANDLE}`;
}
