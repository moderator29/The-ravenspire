import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { siteUrl } from "@/lib/site";

/* The canonical origin, and the thing that made this worth a test.
 *
 * It was written by hand in four files and was THREE DIFFERENT HOSTS at once:
 * the metadata base, robots and the sitemap all named a deployment host, and the
 * checkout return URL fell back to a domain the realm has never owned. All four
 * were wrong simultaneously and nothing failed, because an absolute URL renders
 * perfectly and only misbehaves somewhere the build cannot see.
 *
 * So the sweep below is the real test: no shipped file may write an origin of
 * its own. The rest guard the fallback, because a deployment with a typo in an
 * env var must not take the build down and must not point members at nothing.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const LIVE = "https://theravenspire.xyz";
const original = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = original;
});

describe("the canonical origin", () => {
  it("falls back to the real domain, not to a placeholder", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(siteUrl()).toBe(LIVE);
  });

  it("follows the environment when a deployment sets one", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://preview.example.com";
    expect(siteUrl()).toBe("https://preview.example.com");
  });

  it("strips a trailing slash and any path, so nothing builds a double slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://theravenspire.xyz/";
    expect(siteUrl()).toBe(LIVE);
    process.env.NEXT_PUBLIC_APP_URL = "https://theravenspire.xyz/home";
    expect(siteUrl()).toBe(LIVE);
  });

  it("survives a typo rather than failing the build", () => {
    /* metadataBase calls new URL() on this at module load. A throw here takes
       down every page in the product for one bad character in a dashboard. */
    for (const bad of ["not a url", "", "   ", "javascript:alert(1)", "ftp://x.y"]) {
      process.env.NEXT_PUBLIC_APP_URL = bad;
      expect(siteUrl(), bad).toBe(LIVE);
    }
  });
});

describe("no shipped file writes an origin of its own", () => {
  /* The four that did, plus the one that reads it. If a fifth ever hardcodes a
     host, it belongs on this list with a reason, or it belongs in lib/site.ts. */
  const files = [
    "app/layout.tsx",
    "app/robots.ts",
    "app/sitemap.ts",
    "app/api/commerce/checkout/route.ts",
  ];

  it("names no absolute ravenspire host outside lib/site.ts", () => {
    for (const file of files) {
      const text = readFileSync(`${HERE}../${file}`, "utf8");
      /* Matches an http(s) URL on any ravenspire host: the old deployment host,
         the domain the realm never owned, and the live one. Even the correct
         domain is wrong here, because a second copy of the right answer is how
         the four copies of the wrong one happened. */
      const found = text.match(/https?:\/\/[a-z0-9.-]*ravenspire[a-z0-9.-]*/gi);
      expect(found, `${file} hardcodes ${found?.join(", ")}`).toBeNull();
    }
  });
});
