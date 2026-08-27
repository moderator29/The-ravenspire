import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

const base = siteUrl();

/* WHAT THE REALM ASKS TO BE INDEXED, and it used to be the wrong list.
 *
 * The flagship was missing. Calls are the one mechanic this product is built
 * around, and /calls, /explore and /leaderboards, the three surfaces a stranger
 * can actually judge the realm by, were absent while /throne, a coming soon
 * teaser with no mechanics behind it yet, sat at 0.8 daily: the highest
 * priority and the fastest crawl budget in the file went to the page with the
 * least on it. A sitemap is a statement about what matters here, so it now says
 * what matters here.
 *
 * /throne stays listed, because it is a real page and it does explain the
 * season game, but at the priority of a teaser rather than of a product
 * surface, and it changes about as often as the plan does.
 */

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/home", changeFrequency: "hourly", priority: 0.9 },
    /* The flagship. A resolved Call is the only thing the realm makes that a
       stranger can weigh without joining, which makes it the best possible
       entry point and the reason it ranks with the feed. */
    { path: "/calls", changeFrequency: "hourly", priority: 0.9 },
    { path: "/explore", changeFrequency: "hourly", priority: 0.8 },
    { path: "/war", changeFrequency: "daily", priority: 0.8 },
    { path: "/houses", changeFrequency: "daily", priority: 0.8 },
    { path: "/leaderboards", changeFrequency: "daily", priority: 0.8 },
    { path: "/raven", changeFrequency: "weekly", priority: 0.7 },
    /* The three live tools. Each answers a question somebody types into a
       search engine, which is more than most of this list can say. */
    { path: "/scrying", changeFrequency: "daily", priority: 0.7 },
    { path: "/swap", changeFrequency: "weekly", priority: 0.7 },
    { path: "/dna", changeFrequency: "weekly", priority: 0.6 },
    { path: "/renown", changeFrequency: "weekly", priority: 0.6 },
    { path: "/chronicle", changeFrequency: "monthly", priority: 0.6 },
    /* The chest verifier. Listed because it is one of the few pages here that
       is genuinely useful to somebody who does not have an account and does not
       want one, which is exactly who a fairness proof is written for. */
    { path: "/proof", changeFrequency: "monthly", priority: 0.6 },
    { path: "/throne", changeFrequency: "monthly", priority: 0.4 },
  ];

  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
