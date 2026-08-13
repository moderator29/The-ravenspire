import "server-only";

/* GEO, and the honest size of what this can actually do.
 *
 * THE SHORT VERSION, first, because everything below is a qualification of it:
 * RELIABLE GEOLOCATION NEEDS A PAID SERVICE, AND THE REALM DOES NOT HAVE ONE.
 * What this module does is take the one free signal the hosting platform
 * already injects, treat it as the hint it is, apply a policy the founder sets
 * in env, and record what it saw on the order. It does not claim to know where
 * anybody is. Building a seam and being clear about its size is the whole
 * point of the file; pretending to a precision we do not have would be worse
 * than having no geo at all, because the founder would believe it.
 *
 * WHAT IS FREE, AND REAL
 * Vercel injects x-vercel-ip-country on every request at its edge, and
 * Cloudflare injects cf-ipcountry. Both are part of hosting the product and
 * neither is a new paid service (rule 19). They are a genuine signal: they are
 * set by infrastructure the request passed through, not by the caller.
 *
 * WHY IT IS STILL ONLY A HINT
 *   - A VPN or proxy defeats it completely, and takes ten seconds to install.
 *     A member who wants to appear elsewhere will appear elsewhere.
 *   - Mobile carrier routing regularly lands a member in a neighbouring
 *     country, so the signal is wrong for honest people too.
 *   - IPv6 and corporate egress are frequently attributed badly.
 *
 * WHY THE HEADER IS IGNORED UNLESS WE KNOW WE ARE BEHIND THAT EDGE
 * A header is only trustworthy if something we control put it there. Off the
 * platform, in local development, or behind a proxy that forwards client
 * headers verbatim, x-vercel-ip-country is just a string the caller typed, and
 * a caller who can type their own country has defeated the gate by typing. So
 * the header is read only when process.env.VERCEL is set (Vercel sets it in
 * every deployment) or the founder has explicitly asserted the deployment sits
 * behind a trusted edge. Otherwise this module reports "unknown" and says so.
 * Exactly the same reasoning as clientIp in lib/rate-limit.ts, which is only
 * ever a fallback for the same reason.
 *
 * WHAT WOULD ACTUALLY BE NEEDED, named plainly so it can be costed:
 *   1. AN IP INTELLIGENCE PROVIDER (MaxMind GeoIP2, IPinfo, IP2Location and
 *      similar) that returns a country AND a VPN, proxy and hosting-provider
 *      flag. The flag is the part that matters, and it is the part no free
 *      source gives. This is a paid service, it is the correct one to buy
 *      first if geo genuinely matters, and resolveCountry is the single
 *      function it plugs into.
 *   2. THE PAYMENT PROVIDER'S OWN DATA, which costs nothing extra because it
 *      arrives with the payment: the card's issuing country and the billing
 *      address. It is a materially stronger signal than an IP because a card
 *      is issued against a real address, and it is the reason orders carry a
 *      geo_source column rather than just a country. It arrives AFTER the
 *      charge rather than before, so it informs refunds and reporting, not the
 *      decision to sell. Wiring the webhook to record it is the obvious next
 *      step and is deliberately not done here, because it is a separate change
 *      to a route that handles money.
 *
 * WHAT THIS DOES NOT COVER: everything a lawyer means by geo. It does not know
 * a member's residence, their tax jurisdiction, or whether the thing being sold
 * is lawful where they are. It knows what country an edge network guessed from
 * an address, when it was allowed to guess at all. */

export type GeoSource = "platform-header" | "none";

export interface GeoResolution {
  /* ISO 3166-1 alpha-2, uppercased, or null when nothing could be established.
     Null is a first-class answer here and is never coerced into a default. */
  country: string | null;
  source: GeoSource;
}

/* The policy, set by the founder in env. Three settings, and the default is
   the one that promises least.

     advisory  (default) refuse a country on the block list, allow everything
               else including an unknown country. With no block list configured
               this enforces nothing, which is the honest starting state: it
               becomes real the moment the founder names a country.
     strict    refuse the block list AND refuse an unknown country. This is the
               only setting where a member behind a plain VPN is not simply
               waved through, and it is also the setting that refuses every
               honest member when the deployment is not behind a trusted edge.
               Choosing it is a real trade and must be a deliberate one.
     off       enforce nothing and record nothing. Kept so that the guardrail
               can be switched off in one place rather than by emptying a list
               and hoping. */
export type GeoMode = "advisory" | "strict" | "off";

export function geoMode(): GeoMode {
  const raw = process.env.COMMERCE_GEO_MODE?.trim().toLowerCase();
  if (raw === "strict" || raw === "off") return raw;
  return "advisory";
}

/* Countries the realm will not sell to, as a comma separated list of ISO
   alpha-2 codes. Empty by default: this file will not invent a policy the
   founder has not set, and a hardcoded list of countries in a source file is a
   legal position taken by a developer, which is precisely the thing to avoid. */
export function blockedCountries(): Set<string> {
  const raw = process.env.COMMERCE_BLOCKED_COUNTRIES ?? "";
  const codes = raw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return new Set(codes);
}

/* True when a header claiming to know the caller's country was put there by
   infrastructure rather than by the caller. See the header for why this gate
   exists at all. */
export function platformHeadersAreTrusted(): boolean {
  if (process.env.GEO_TRUST_PLATFORM_HEADERS === "true") return true;
  /* Vercel sets VERCEL=1 in every deployment, and its edge overwrites
     x-vercel-ip-country on the way in, so a caller cannot forge it there. */
  return process.env.VERCEL === "1";
}

const COUNTRY_HEADERS = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "x-nf-client-connection-country",
];

/* Resolve a country from the request, or report honestly that it could not.
 *
 * Takes the Headers rather than the Request so it is pure and testable, and so
 * the trust decision is passed in rather than read from env inside a branch
 * nobody can exercise. */
export function resolveCountry(
  headers: Headers,
  trusted: boolean = platformHeadersAreTrusted()
): GeoResolution {
  if (!trusted) return { country: null, source: "none" };

  for (const name of COUNTRY_HEADERS) {
    const raw = headers.get(name)?.trim().toUpperCase();
    /* Cloudflare sends XX for "could not determine" and T1 for Tor. Both are
       an absence of an answer rather than an answer, and treating either as a
       country would put a fake code on an order forever. */
    if (!raw || raw === "XX" || raw === "T1") continue;
    if (!/^[A-Z]{2}$/.test(raw)) continue;
    return { country: raw, source: "platform-header" };
  }

  return { country: null, source: "none" };
}

export type GeoVerdict =
  | { allowed: true; country: string | null; source: GeoSource }
  | {
      allowed: false;
      country: string | null;
      source: GeoSource;
      reason: "geo_blocked" | "geo_unknown";
    };

/* Apply the policy to a resolution. Pure, so every branch is testable, which
   matters more here than anywhere else in the guardrails: this is the one
   whose failure mode is refusing honest members. */
export function geoVerdict(
  resolution: GeoResolution,
  mode: GeoMode = geoMode(),
  blocked: Set<string> = blockedCountries()
): GeoVerdict {
  const { country, source } = resolution;

  if (mode === "off") return { allowed: true, country, source };

  if (country && blocked.has(country)) {
    return { allowed: false, country, source, reason: "geo_blocked" };
  }

  if (!country && mode === "strict") {
    return { allowed: false, country, source, reason: "geo_unknown" };
  }

  return { allowed: true, country, source };
}
