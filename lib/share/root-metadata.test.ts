import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* THE REGRESSION THAT COST THE MOST AND SHOWED THE LEAST.
 *
 * `app/layout.tsx` carried `openGraph.images` and `twitter.images`, both naming
 * one static PNG. Metadata is inherited by every route below a layout, and
 * file-based metadata only fills a key the segment does not already have, so
 * those two keys beat every `opengraph-image.tsx` in the product. Every Keep,
 * raven, Call and House shared to X unfurled as the same cropped champion
 * lineup, and `app/opengraph-image.tsx` had never once reached a crawler.
 *
 * Nothing failed. The build was green, the routes existed, the images rendered
 * when fetched directly, and the only symptom was on somebody else's website.
 * That is precisely the shape of defect a test has to hold, because no human
 * reviewing a diff that adds a nice default image will see it.
 *
 * Verified against a running server when this was written: every route's
 * `og:image` and `twitter:image` now point at that route's own card.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const APP = `${HERE}../../app`;

describe("the root layout does not override the per route cards", () => {
  const layout = readFileSync(`${APP}/layout.tsx`, "utf8");

  it("names no image in openGraph or twitter", () => {
    /* A static image named at the root is not a default, it is an override. */
    expect(layout).not.toMatch(/openGraph:[\s\S]*?images:/);
    expect(layout).not.toMatch(/twitter:[\s\S]*?images:/);
  });

  it("still declares the large card, which is what makes the image fill the frame", () => {
    /* Removing the images must not take the card type with it: without
       summary_large_image X renders a thumbnail and the whole point is lost. */
    expect(layout).toMatch(/card:\s*"summary_large_image"/);
  });

  it("has a root card of its own, so the landing page is not left bare", () => {
    expect(readdirSync(APP)).toContain("opengraph-image.tsx");
  });
});
