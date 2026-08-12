import { describe, it, expect } from "vitest";
import {
  chronicleDay,
  digestEvents,
  digestToFacts,
  housesWorthSummarising,
  worthChronicling,
  type ChronicleEvent,
} from "@/lib/ai/chronicle";

/* The Chronicle is the one Herald surface nobody triggers, so nobody is there
   to notice if it starts describing a day that did not happen. The counts it is
   written from are therefore pinned here, including the two spend decisions:
   a quiet realm and a quiet House both cost nothing. */

function event(overrides: Partial<ChronicleEvent> = {}): ChronicleEvent {
  return {
    kind: "call.sealed",
    actor_id: "member-a",
    house_slug: "corvane",
    payload: {},
    created_at: "2026-08-12T09:00:00.000Z",
    ...overrides,
  };
}

describe("digestEvents", () => {
  it("counts distinct actors rather than acts", () => {
    const digest = digestEvents([
      event({ actor_id: "a" }),
      event({ actor_id: "a" }),
      event({ actor_id: "b" }),
      event({ actor_id: null }),
    ]);
    expect(digest.events).toBe(4);
    expect(digest.actors).toBe(2);
  });

  it("separates Calls sealed from Calls settled, and counts the hits", () => {
    const digest = digestEvents([
      event({ kind: "call.sealed" }),
      event({ kind: "call.sealed" }),
      event({ kind: "call.resolved", payload: { verdict: "hit", score: 12 } }),
      event({ kind: "call.resolved", payload: { verdict: "miss", score: -30 } }),
    ]);
    expect(digest.callsSealed).toBe(2);
    expect(digest.callsResolved).toBe(2);
    expect(digest.callsHit).toBe(1);
  });

  it("picks the highest scoring settled Call and carries its real figures", () => {
    const digest = digestEvents([
      event({
        kind: "call.resolved",
        payload: { verdict: "hit", score: 12, token: "NAKA", stance: "up", timeframe: "24h" },
      }),
      event({
        kind: "call.resolved",
        payload: { verdict: "hit", score: 71, token: "PEPE", stance: "down", timeframe: "7d" },
      }),
    ]);
    expect(digest.bestCall).toEqual({
      token: "PEPE",
      stance: "down",
      timeframe: "7d",
      score: 71,
      verdict: "hit",
    });
  });

  it("has no best Call when nothing settled carried a score", () => {
    const digest = digestEvents([
      event({ kind: "call.resolved", payload: { verdict: "hit" } }),
    ]);
    expect(digest.bestCall).toBeNull();
  });

  it("ranks Houses by acts and counts their distinct members", () => {
    const digest = digestEvents([
      event({ house_slug: "corvane", actor_id: "a" }),
      event({ house_slug: "corvane", actor_id: "a" }),
      event({ house_slug: "emberfall", actor_id: "b" }),
      event({ house_slug: "emberfall", actor_id: "c" }),
      event({ house_slug: "emberfall", actor_id: "d" }),
      event({ house_slug: null, actor_id: "e" }),
    ]);
    expect(digest.houses).toEqual([
      { slug: "emberfall", events: 3, members: 3 },
      { slug: "corvane", events: 2, members: 1 },
    ]);
  });

  it("names the crests that were actually earned", () => {
    const digest = digestEvents([
      event({ kind: "crest.earned", payload: { title: "First Blood" } }),
      event({ kind: "crest.earned", payload: { crest_slug: "oathkeeper" } }),
      event({ kind: "crest.earned", payload: {} }),
    ]);
    expect(digest.crests).toEqual(["First Blood", "oathkeeper"]);
  });
});

describe("spend decisions", () => {
  it("refuses to write a Chronicle about a day where nothing happened", () => {
    expect(worthChronicling(digestEvents([]))).toBe(false);
    expect(worthChronicling(digestEvents([event(), event()]))).toBe(false);
    expect(worthChronicling(digestEvents([event(), event(), event()]))).toBe(true);
  });

  it("summarises only the Houses that did enough to summarise", () => {
    const digest = digestEvents([
      ...Array.from({ length: 5 }, (_, i) =>
        event({ house_slug: "corvane", actor_id: `a${i}` })
      ),
      event({ house_slug: "emberfall", actor_id: "b" }),
    ]);
    expect(housesWorthSummarising(digest).map((h) => h.slug)).toEqual(["corvane"]);
  });
});

describe("digestToFacts", () => {
  const opts = {
    windowHours: 24,
    standings: [
      { slug: "corvane", name: "House Corvane", glory: 900 },
      { slug: "emberfall", name: "House Emberfall", glory: 700 },
    ],
    houseName: (slug: string) => slug,
  };

  it("states an empty settlement day plainly rather than omitting it", () => {
    const facts = digestToFacts(digestEvents([event()]), opts);
    expect(facts.join("\n")).toContain("No Call settled in the window.");
  });

  it("carries the standings and the hit count", () => {
    const facts = digestToFacts(
      digestEvents([
        event({ kind: "call.resolved", payload: { verdict: "hit", score: 40 } }),
      ]),
      opts
    ).join("\n");
    expect(facts).toContain("Calls settled: 1, of which 1 landed.");
    expect(facts).toContain("1. House Corvane 900");
  });

  it("never invents a figure it was not given", () => {
    const facts = digestToFacts(digestEvents([]), {
      ...opts,
      standings: [],
      newMembers: null,
    }).join("\n");
    expect(facts).not.toContain("undefined");
    expect(facts).not.toContain("NaN");
    expect(facts).not.toContain("Members who entered");
  });
});

describe("chronicleDay", () => {
  it("keys on the realm's own UTC day so one day is one entry", () => {
    expect(chronicleDay(new Date("2026-08-12T23:59:00.000Z"))).toBe("2026-08-12");
    expect(chronicleDay(new Date("2026-08-13T00:01:00.000Z"))).toBe("2026-08-13");
  });
});
