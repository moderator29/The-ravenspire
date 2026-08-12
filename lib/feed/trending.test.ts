import { describe, expect, it } from "vitest";
import {
  MIN_REPLIES,
  MIN_WEIGHTED,
  REPLY_WEIGHT,
  trendingNow,
  weighted,
} from "@/lib/feed/trending";

const NOW = Date.parse("2026-08-12T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3.6e6).toISOString();

function post(over: Partial<Parameters<typeof weighted>[0]> = {}) {
  return {
    id: "a",
    author_id: "author",
    created_at: hoursAgo(6),
    reply_count: 10,
    like_count: 10,
    ...over,
  };
}

describe("the floor holds", () => {
  it("returns nothing for an empty realm", () => {
    expect(trendingNow([], NOW)).toBeNull();
  });

  it("returns nothing when the busiest raven is below the reply floor", () => {
    const quiet = post({ reply_count: MIN_REPLIES - 1, like_count: 500 });
    expect(trendingNow([quiet], NOW)).toBeNull();
  });

  it("returns nothing when total engagement is below the weighted floor", () => {
    /* Clears the reply floor exactly and brings nothing with it. The two
       floors have to be independent or the second one does no work, which is
       what this asserts: the bare minimum replies alone is not a discussion. */
    const thin = post({ reply_count: MIN_REPLIES, like_count: 0 });
    expect(weighted(thin)).toBeLessThan(MIN_WEIGHTED);
    expect(trendingNow([thin], NOW)).toBeNull();
  });

  it("the weighted floor is not a restatement of the reply floor", () => {
    expect(MIN_WEIGHTED).toBeGreaterThan(MIN_REPLIES * REPLY_WEIGHT);
  });

  it("lets the bare minimum through once it brings something with it", () => {
    const enough = post({ reply_count: MIN_REPLIES, like_count: 3 });
    expect(trendingNow([enough], NOW)?.id).toBe("a");
  });

  it("a lot of likes never substitutes for a discussion", () => {
    const agreeable = post({ reply_count: 0, like_count: 9999 });
    expect(trendingNow([agreeable], NOW)).toBeNull();
  });
});

describe("velocity, not accumulation", () => {
  it("prefers the faster raven over the larger one", () => {
    const fast = post({ id: "fast", reply_count: 8, like_count: 4, created_at: hoursAgo(3) });
    const slow = post({ id: "slow", reply_count: 20, like_count: 40, created_at: hoursAgo(46) });
    expect(trendingNow([slow, fast], NOW)?.id).toBe("fast");
  });

  it("ignores anything older than the window", () => {
    const stale = post({ id: "stale", reply_count: 99, like_count: 99, created_at: hoursAgo(100) });
    expect(trendingNow([stale], NOW)).toBeNull();
  });

  it("does not let a minutes old raven win on one reply", () => {
    /* Without an age floor this divides by almost zero and beats everything. */
    const newborn = post({ id: "new", reply_count: 4, like_count: 0, created_at: hoursAgo(0.05) });
    const real = post({ id: "real", reply_count: 12, like_count: 30, created_at: hoursAgo(5) });
    expect(trendingNow([newborn, real], NOW)?.id).toBe("real");
  });

  it("survives a future timestamp rather than ranking it first", () => {
    const skewed = post({ id: "skew", created_at: new Date(NOW + 3.6e6).toISOString() });
    expect(trendingNow([skewed], NOW)).toBeNull();
  });

  it("survives an unparseable timestamp", () => {
    const broken = post({ id: "broken", created_at: "not a date" });
    expect(trendingNow([broken], NOW)).toBeNull();
  });
});

describe("a reply outweighs a reaction", () => {
  it("weights replies by the stated constant", () => {
    expect(weighted(post({ reply_count: 2, like_count: 0 }))).toBe(2 * REPLY_WEIGHT);
    expect(weighted(post({ reply_count: 0, like_count: 5 }))).toBe(5);
  });

  it("picks the argued raven over the liked one at equal age", () => {
    const argued = post({ id: "argued", reply_count: 10, like_count: 0 });
    const liked = post({ id: "liked", reply_count: 4, like_count: 17 });
    expect(weighted(argued)).toBeGreaterThan(weighted(liked));
    expect(trendingNow([liked, argued], NOW)?.id).toBe("argued");
  });

  it("treats negative counters as zero rather than as credit", () => {
    expect(weighted(post({ reply_count: -5, like_count: -5 }))).toBe(0);
  });
});

describe("it returns one raven or none", () => {
  it("returns exactly the top raven", () => {
    const a = post({ id: "a", reply_count: 6, like_count: 2, created_at: hoursAgo(10) });
    const b = post({ id: "b", reply_count: 9, like_count: 9, created_at: hoursAgo(4) });
    const c = post({ id: "c", reply_count: 5, like_count: 1, created_at: hoursAgo(30) });
    const top = trendingNow([a, b, c], NOW);
    expect(top?.id).toBe("b");
  });
});
