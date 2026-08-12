import { describe, it, expect } from "vitest";
import { rankSimilar, type SimilarRow } from "@/lib/calls/similar";
import { bucketKey, subjectKey } from "@/lib/calls/peers";
import type { CallData } from "@/lib/calls/types";

/* Similarity here is an exact structured relation, not a guess, which is the
   whole reason section 10 prefers the free path over embeddings. These tests
   pin the three relations and the order they come back in. */

const NOW = Date.parse("2026-08-12T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function call(overrides: Partial<CallData> = {}): CallData {
  return {
    token: "NAKA",
    address: "0x6967b9a8c0b14849cfe8f9e5732b401433fd2898",
    chain: "ethereum",
    stance: "up",
    timeframe: "24h",
    threshold: 0.2,
    confidence: 0.7,
    resolver: "price",
    category: "markets",
    verdict: "open",
    ...overrides,
  };
}

function row(
  id: string,
  authorId: string,
  overrides: Partial<CallData> = {},
  offsetMs = 0
): SimilarRow {
  return {
    id,
    author_id: authorId,
    body: "a Call",
    created_at: new Date(NOW + offsetMs).toISOString(),
    call: call(overrides),
  };
}

const DRAFT = call();
const OPTS = {
  bucket: bucketKey(DRAFT),
  subject: subjectKey(DRAFT),
  stance: "up",
  viewerId: "me",
};

describe("rankSimilar", () => {
  it("names the exact claim, the same direction and the other side", () => {
    const found = rankSimilar(
      [
        row("exact", "a"),
        /* Same coin and direction, a different move over a different window. */
        row("direction", "b", { threshold: 0.05, timeframe: "7d" }),
        /* Same coin, called the other way. */
        row("against", "c", { stance: "down" }),
      ],
      OPTS
    );

    expect(found.map((f) => f.relation)).toEqual([
      "same-claim",
      "same-direction",
      "same-subject",
    ]);
    expect(found.map((f) => f.id)).toEqual(["exact", "direction", "against"]);
  });

  it("drops Calls about anything else", () => {
    const found = rankSimilar(
      [
        row("other", "a", {
          token: "PEPE",
          address: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
        }),
      ],
      OPTS
    );
    expect(found).toEqual([]);
  });

  it("orders equal relations newest first", () => {
    const found = rankSimilar(
      [
        row("old", "a", {}, -5 * HOUR),
        row("new", "b", {}, -1 * HOUR),
        row("middle", "c", {}, -3 * HOUR),
      ],
      OPTS
    );
    expect(found.map((f) => f.id)).toEqual(["new", "middle", "old"]);
  });

  it("marks the member's own Calls rather than passing them off as the crowd", () => {
    const found = rankSimilar([row("mine", "me"), row("theirs", "other")], OPTS);
    expect(found.find((f) => f.id === "mine")?.mine).toBe(true);
    expect(found.find((f) => f.id === "theirs")?.mine).toBe(false);
  });

  it("excludes the Call being read, so a sealed Call is never its own neighbour", () => {
    const found = rankSimilar([row("self", "me"), row("other", "b")], {
      ...OPTS,
      excludeId: "self",
    });
    expect(found.map((f) => f.id)).toEqual(["other"]);
  });

  it("returns nothing at all when the draft has no subject to match on", () => {
    expect(rankSimilar([row("a", "a")], { ...OPTS, subject: null })).toEqual([]);
  });

  it("holds to the limit it is given", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(`c${i}`, `author${i}`, {}, -i * HOUR)
    );
    expect(rankSimilar(rows, { ...OPTS, limit: 3 })).toHaveLength(3);
  });
});
