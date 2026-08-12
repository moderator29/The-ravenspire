/* The interest allowlist (V2 Part Two, section 27.3).
 *
 * One explicit list of everything a member can register interest in, shared
 * by the API route (validation) and the client (typing). Never freeform: a
 * feature key that is not listed here is a 400, so the interest table can
 * only ever hold keys the product actually promised to notify about.
 *
 * Two groups:
 *   - The three collectibles chapters, keyed by their product names.
 *   - The six existing /soon chapters, keyed by their nav slugs, so the
 *     rewired "Notify me" on those pages registers something real too.
 */

export const COLLECTIBLE_FEATURES = ["reliquary", "warchests", "mercer"] as const;

export const CHAPTER_FEATURES = [
  "flock",
  "almanac",
  "mint",
  "prophecies",
  "raven-agent",
  "long-night",
] as const;

export const INTEREST_FEATURES = [
  ...COLLECTIBLE_FEATURES,
  ...CHAPTER_FEATURES,
] as const;

export type CollectibleFeature = (typeof COLLECTIBLE_FEATURES)[number];
export type InterestFeature = (typeof INTEREST_FEATURES)[number];

export function isInterestFeature(value: unknown): value is InterestFeature {
  return (
    typeof value === "string" &&
    (INTEREST_FEATURES as readonly string[]).includes(value)
  );
}
