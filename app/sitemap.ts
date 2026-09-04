import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

const base = siteUrl();

/* Genuinely public URLs only.
 *
 * This file used to list /home, /war, /throne, /raven, /renown and /houses,
 * every one of which sits behind ShellGate: a crawler following the sitemap
 * hit a client redirect to the sign-in gate and indexed a page it never saw.
 * A sitemap that points a crawler at a login wall is worse than a short one,
 * because it teaches the crawler that the whole domain answers that way.
 *
 * What belongs here is what a signed-out visitor can actually read: the
 * landing page, the chest fairness verifier, the legal documents and the
 * gate itself. The other public read surfaces (a Keep at /u/<handle>, a Call,
 * a House hall, a listing, a raven; see PUBLIC_PATTERNS in
 * lib/share/links.ts) are parameterised by member data and cannot be
 * enumerated at build time, so they are distributed by share links and Open
 * Graph cards rather than listed statically. If a static public page is
 * added, it earns a row here; a gated one never does.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    /* Season Zero. It qualifies under the rule above rather than around it:
       the founding round was added to PUBLIC_PATTERNS in lib/share/links.ts,
       so a signed-out visitor genuinely reads it instead of meeting the gate.
       Daily while the window is open, because the raise moves, and it stays
       listed afterwards as the round's own record. */
    { path: "/season-zero", changeFrequency: "daily", priority: 0.9 },
    /* The chest verifier: genuinely useful to somebody who does not have an
       account and does not want one, which is exactly who a fairness proof is
       written for. */
    { path: "/proof", changeFrequency: "monthly", priority: 0.6 },
    { path: "/signin", changeFrequency: "monthly", priority: 0.5 },
    { path: "/legal/terms", changeFrequency: "monthly", priority: 0.3 },
    { path: "/legal/privacy", changeFrequency: "monthly", priority: 0.3 },
  ];

  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
