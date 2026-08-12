import { describe, it, expect } from "vitest";
import { bucketKey, eligiblePeers, thresholdBucket } from "@/lib/calls/peers";
import type { CallData } from "@/lib/calls/types";

/* Anti-farming rule 3 of V2 section 9.5. The peer score sums to zero across
   participants, which makes it immune to difficulty but only as long as the
   participants are genuinely independent. Houses are a pre-built coordination
   structure, so a House is the cheapest possible collusion ring and has to be
   excluded by construction rather than detected afterwards. */

const NOW = Date.parse("2026-08-11T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

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
  authorId: string,
  houseSlug: string | null,
  overrides: Partial<CallData> = {},
  offsetMs = 0
) {
  return {
    author_id: authorId,
    house_slug: houseSlug,
    call: call(overrides),
    created_at: new Date(NOW + offsetMs).toISOString(),
  };
}

const OPTS = {
  key: bucketKey(call()) as string,
  authorId: "me",
  houseSlug: "emberfall",
  createdAt: NOW,
  windowMs: DAY,
};

describe("thresholdBucket", () => {
  it("groups moves within five percentage points as the same claim", () => {
    expect(thresholdBucket(0.4)).toBe(thresholdBucket(0.401));
    expect(thresholdBucket(0.4)).toBe(thresholdBucket(0.42));
    expect(thresholdBucket(0.4)).not.toBe(thresholdBucket(0.5));
  });

  it("treats nonsense as no threshold at all", () => {
    expect(thresholdBucket(Number.NaN)).toBe(0);
    expect(thresholdBucket(-1)).toBe(0);
  });
});

describe("bucketKey", () => {
  it("keys a price Call on address and chain, never on the ticker", () => {
    /* Two different tokens sharing a recycled ticker must never share a
       bucket, which is the same identity discipline the price resolver uses to
       settle. */
    const a = bucketKey(call());
    const b = bucketKey(call({ address: "0xdead000000000000000000000000000000000000" }));
    expect(a).not.toBe(b);

    const renamed = bucketKey(call({ token: "SOMETHING-ELSE" }));
    expect(renamed).toBe(a);
  });

  it("separates direction, threshold band and window", () => {
    const base = bucketKey(call());
    expect(bucketKey(call({ stance: "down" }))).not.toBe(base);
    expect(bucketKey(call({ threshold: 0.5 }))).not.toBe(base);
    expect(bucketKey(call({ timeframe: "7d" }))).not.toBe(base);
    expect(bucketKey(call({ threshold: 0.21 }))).toBe(base);
  });

  it("keys an internal Call on the claim itself", () => {
    const claim = bucketKey(
      call({ resolver: "internal", claim: { metric: "house_leads", house_slug: "emberfall" } })
    );
    const other = bucketKey(
      call({ resolver: "internal", claim: { metric: "house_leads", house_slug: "frosthold" } })
    );
    expect(claim).not.toBeNull();
    expect(claim).not.toBe(other);
  });
});

describe("eligiblePeers", () => {
  it("collects independent members who Called the same thing", () => {
    const peers = eligiblePeers(
      [
        row("a", "corvane", { confidence: 0.6 }),
        row("b", "frosthold", { confidence: 0.8 }),
        row("c", null, { confidence: 0.75 }),
      ],
      OPTS
    );
    expect(peers).toEqual([0.6, 0.8, 0.75]);
  });

  it("never counts the member as their own peer", () => {
    const peers = eligiblePeers(
      [row("me", "emberfall", { confidence: 0.9 }), row("a", "corvane", { confidence: 0.6 })],
      OPTS
    );
    expect(peers).toEqual([0.6]);
  });

  it("excludes House-mates, which is the collusion ring the rule exists for", () => {
    const peers = eligiblePeers(
      [
        row("mate-1", "emberfall", { confidence: 0.99 }),
        row("mate-2", "emberfall", { confidence: 0.99 }),
        row("mate-3", "emberfall", { confidence: 0.99 }),
        row("outsider", "frosthold", { confidence: 0.6 }),
      ],
      OPTS
    );
    expect(peers).toEqual([0.6]);
  });

  it("excludes nobody for a member with no House", () => {
    const peers = eligiblePeers(
      [row("a", "emberfall", { confidence: 0.6 }), row("b", "emberfall", { confidence: 0.7 })],
      { ...OPTS, houseSlug: null }
    );
    expect(peers).toEqual([0.6, 0.7]);
  });

  it("counts each member once, taking their first Call in the bucket", () => {
    const peers = eligiblePeers(
      [
        row("a", "corvane", { confidence: 0.6 }),
        row("a", "corvane", { confidence: 0.99 }),
        row("a", "corvane", { confidence: 0.99 }),
      ],
      OPTS
    );
    expect(peers).toEqual([0.6]);
  });

  it("drops Calls on a different claim", () => {
    const peers = eligiblePeers(
      [
        row("a", "corvane", { stance: "down", confidence: 0.9 }),
        row("b", "corvane", { timeframe: "7d", confidence: 0.9 }),
        row("c", "corvane", { threshold: 0.9, confidence: 0.9 }),
        row("d", "corvane", { confidence: 0.65 }),
      ],
      OPTS
    );
    expect(peers).toEqual([0.65]);
  });

  it("drops Calls made too far outside the window to be about the same thing", () => {
    const peers = eligiblePeers(
      [
        row("a", "corvane", { confidence: 0.6 }, DAY / 4),
        row("b", "corvane", { confidence: 0.7 }, -DAY / 4),
        row("stale", "corvane", { confidence: 0.99 }, DAY * 3),
      ],
      OPTS
    );
    expect(peers).toEqual([0.6, 0.7]);
  });

  it("drops Calls carrying no stated confidence, including every pre-V2 row", () => {
    const peers = eligiblePeers(
      [
        row("legacy", "corvane", { confidence: undefined }),
        row("bad-low", "corvane", { confidence: 0.2 }),
        row("bad-high", "corvane", { confidence: 1 }),
        row("good", "corvane", { confidence: 0.66 }),
      ],
      OPTS
    );
    expect(peers).toEqual([0.66]);
  });

  it("returns nothing when every candidate is a House-mate", () => {
    const peers = eligiblePeers(
      [
        row("mate-1", "emberfall", { confidence: 0.9 }),
        row("mate-2", "emberfall", { confidence: 0.9 }),
        row("mate-3", "emberfall", { confidence: 0.9 }),
        row("mate-4", "emberfall", { confidence: 0.9 }),
      ],
      OPTS
    );
    expect(peers).toEqual([]);
  });
});
