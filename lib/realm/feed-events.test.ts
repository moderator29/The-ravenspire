import { describe, expect, it } from "vitest";
import { EVENT_KINDS } from "@/lib/realm/events";
import { FEED_EVENT_KINDS } from "@/lib/realm/feed-events";

/* The kind list the Ravenry asks for, checked against the spine it asks from.
 *
 * Neither of these is typed against the other: both are `as const` arrays of
 * string literals, so a typo in FEED_EVENT_KINDS is not a type error. It is
 * also not a runtime error, which is the problem. loadRealmEvents filters the
 * requested kinds against EVENT_KINDS before building the query, so:
 *
 *   one misspelled kind    that card silently never appears again, and nothing
 *                          anywhere reports it. The feed looks fine.
 *   every kind misspelled  the filter reduces to an empty array, the `.in()`
 *                          is skipped entirely, and the feed asks for EVERY
 *                          kind on the spine, including call.sealed, which is
 *                          excluded precisely because it doubles every Call in
 *                          the timeline.
 *
 * Both failures are invisible to typecheck and to the build, and the second one
 * is worse than the first, so the list is pinned here instead. */

describe("FEED_EVENT_KINDS", () => {
  it("only names kinds that exist on the spine", () => {
    const spine = new Set<string>(EVENT_KINDS);
    const unknown = FEED_EVENT_KINDS.filter((kind) => !spine.has(kind));
    expect(unknown).toEqual([]);
  });

  it("names each kind once", () => {
    expect(new Set(FEED_EVENT_KINDS).size).toBe(FEED_EVENT_KINDS.length);
  });

  it("is never empty, because an empty list asks for everything", () => {
    /* loadRealmEvents skips the `.in()` filter when the resolved list is empty,
       so an empty FEED_EVENT_KINDS does not show nothing, it shows all. */
    expect(FEED_EVENT_KINDS.length).toBeGreaterThan(0);
  });

  it("excludes call.sealed, which the post already carries", () => {
    /* Sealing a Call writes the post that carries it. Rendering both would put
       every Call in the timeline twice, and the post is the richer card. */
    expect(FEED_EVENT_KINDS).not.toContain("call.sealed");
  });
});
