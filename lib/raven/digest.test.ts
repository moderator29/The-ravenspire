import { describe, it, expect } from "vitest";
import {
  CALL_DUE_SOON_MS,
  DIGEST_FIRST_WINDOW_MS,
  DIGEST_MAX_WINDOW_MS,
  DIGEST_PER_MEMBER_DAILY,
  DIGEST_RATE_WINDOW_SECONDS,
  DIGEST_REALM_DAILY,
  DIGEST_TTL_MS,
  MIN_REALM_SIGNALS,
  assembleFacts,
  callDueAt,
  digestWindow,
  worthTelling,
  type DigestEvent,
  type DigestInput,
  type StoredDigest,
} from "@/lib/raven/digest";

/* The Herald's digest, tested where it decides rather than where it writes.
 *
 * Nothing here asserts on model prose, because there is none to assert on: the
 * model is never called from this module. What is asserted is the shape of what
 * the assembler feeds it, the freshness decision that stops it being called at
 * all, and the floor that keeps an empty realm silent. Those three are the ones
 * that cost money or tell lies when they are wrong. */

const NOW = new Date("2026-08-13T12:00:00.000Z");

function at(hoursAgo: number): string {
  return new Date(NOW.getTime() - hoursAgo * 3600000).toISOString();
}

function event(over: Partial<DigestEvent> = {}): DigestEvent {
  return {
    kind: "call.resolved",
    actorId: "stranger",
    houseSlug: null,
    payload: {},
    createdAt: at(1),
    actorName: "A Stranger",
    ...over,
  };
}

function input(over: Partial<DigestInput> = {}): DigestInput {
  return {
    now: NOW,
    windowStart: at(6),
    viewer: { id: "me", followingIds: [], houseSlug: null },
    events: [],
    settledCalls: [],
    openCalls: [],
    ledger: { points: 0, glory: 0, entries: 0 },
    house: null,
    followedRavens: { posts: 0, authors: 0 },
    season: null,
    ...over,
  };
}

describe("digestWindow", () => {
  it("opens a first window a day back and is never fresh", () => {
    const window = digestWindow(null, NOW);
    expect(window.fresh).toBe(false);
    expect(Date.parse(window.start)).toBe(NOW.getTime() - DIGEST_FIRST_WINDOW_MS);
  });

  it("is fresh inside the TTL, which is the whole cache decision", () => {
    const stored: StoredDigest = {
      text: "Something happened.",
      windowStart: at(12),
      generatedAt: new Date(NOW.getTime() - DIGEST_TTL_MS + 60000).toISOString(),
      dismissedAt: null,
    };
    expect(digestWindow(stored, NOW).fresh).toBe(true);
  });

  it("is stale once past it", () => {
    const stored: StoredDigest = {
      text: "Something happened.",
      windowStart: at(12),
      generatedAt: new Date(NOW.getTime() - DIGEST_TTL_MS - 1000).toISOString(),
      dismissedAt: null,
    };
    expect(digestWindow(stored, NOW).fresh).toBe(false);
  });

  it("opens the next window where a spoken digest ended, so no hour is told twice", () => {
    const generatedAt = at(9);
    const window = digestWindow(
      { text: "Said something.", windowStart: at(30), generatedAt, dismissedAt: null },
      NOW
    );
    expect(window.start).toBe(generatedAt);
  });

  it("carries a silent window forward rather than consuming it", () => {
    /* Nothing was said about the last nine hours, so those hours are still
       untold and the next digest has to cover them. */
    const windowStart = at(30);
    const window = digestWindow(
      { text: null, windowStart, generatedAt: at(9), dismissedAt: null },
      NOW
    );
    expect(window.start).toBe(windowStart);
  });

  it("never reaches back further than the ceiling", () => {
    const window = digestWindow(
      { text: null, windowStart: at(24 * 60), generatedAt: at(24 * 30), dismissedAt: null },
      NOW
    );
    expect(Date.parse(window.start)).toBe(NOW.getTime() - DIGEST_MAX_WINDOW_MS);
  });

  it("never opens a window that ends before it starts", () => {
    /* A stored time in the future is a clock that disagreed with itself. The
       table rejects window_start > generated_at, so the clamp has to be here. */
    const window = digestWindow(
      { text: "Said something.", windowStart: at(2), generatedAt: at(-48), dismissedAt: null },
      NOW
    );
    expect(Date.parse(window.start)).toBeLessThanOrEqual(NOW.getTime());
  });

  it("falls back to a first window when the stored times are unreadable", () => {
    const window = digestWindow(
      { text: null, windowStart: "not a time", generatedAt: "also not", dismissedAt: null },
      NOW
    );
    expect(window.fresh).toBe(false);
    expect(Date.parse(window.start)).toBe(NOW.getTime() - DIGEST_FIRST_WINDOW_MS);
  });
});

describe("worthTelling", () => {
  it("says nothing about an empty realm", () => {
    const facts = assembleFacts(input());
    expect(facts.personal).toBe(0);
    expect(facts.signals).toBe(0);
    expect(worthTelling(facts)).toBe(false);
  });

  it("still says nothing when the only facts are standing ones", () => {
    /* A House rank and a season clock are true every minute of every day. If
       either counted, every member would get a paid digest every six hours for
       the life of the realm. */
    const facts = assembleFacts(
      input({
        house: {
          name: "House Vantage",
          rank: 3,
          of: 6,
          glory: 400,
          rival: { name: "House Ember", gap: 40, ahead: true },
        },
        season: { name: "Season One", endsAt: at(-24 * 9) },
      })
    );
    expect(facts.lines).toContain(
      "Your House: House Vantage, 3 of 6 on 400 Glory."
    );
    expect(facts.signals).toBe(0);
    expect(worthTelling(facts)).toBe(false);
  });

  it("speaks for one thing that happened to this member", () => {
    const facts = assembleFacts(
      input({
        settledCalls: [{ subject: "$RSP", verdict: "hit", score: 61 }],
      })
    );
    expect(facts.personal).toBe(1);
    expect(worthTelling(facts)).toBe(true);
  });

  it("needs a genuinely busy realm before speaking to a member with no stake", () => {
    const quiet = assembleFacts(input({ events: [event(), event()] }));
    /* Two events by strangers are one line, not three signals. */
    expect(quiet.personal).toBe(0);
    expect(worthTelling(quiet)).toBe(false);

    const busy = assembleFacts(
      input({
        events: [event(), event()],
        followedRavens: { posts: 4, authors: 2 },
        settledCalls: [],
        ledger: { points: 10, glory: 2, entries: 1 },
      })
    );
    expect(busy.signals).toBeGreaterThanOrEqual(MIN_REALM_SIGNALS);
    expect(worthTelling(busy)).toBe(true);
  });
});

describe("assembleFacts", () => {
  it("always states the window it is talking about", () => {
    const facts = assembleFacts(input({ windowStart: at(6) }));
    expect(facts.lines[0]).toBe("Window: the last 6 hours.");
  });

  it("states a long window in days rather than hours", () => {
    const facts = assembleFacts(input({ windowStart: at(72) }));
    expect(facts.lines[0]).toBe("Window: the last 3 days.");
  });

  it("hands over counts, never an interpretation of them", () => {
    const facts = assembleFacts(
      input({
        settledCalls: [
          { subject: "$RSP", verdict: "hit", score: 61 },
          { subject: "$ETH", verdict: "miss", score: -20 },
        ],
      })
    );
    expect(facts.lines).toContain(
      "Your Calls settled in the window: 2, of which 1 landed."
    );
    expect(facts.lines).toContain(
      "Your highest scoring settled Call: $RSP, verdict hit, score 61."
    );
  });

  it("leads with the member's own Calls, because the sheet is the ranking", () => {
    const facts = assembleFacts(
      input({
        settledCalls: [{ subject: "$RSP", verdict: "hit", score: 61 }],
        ledger: { points: 40, glory: 4, entries: 3 },
        events: [event(), event()],
      })
    );
    const call = facts.lines.findIndex((l) => l.startsWith("Your Calls settled"));
    const ledger = facts.lines.findIndex((l) => l.startsWith("Settled to you"));
    const realm = facts.lines.findIndex((l) => l.startsWith("Elsewhere in the realm"));
    expect(call).toBeGreaterThan(0);
    expect(ledger).toBeGreaterThan(call);
    expect(realm).toBeGreaterThan(ledger);
  });

  it("counts an open Call as news only once it is close", () => {
    const far = assembleFacts(
      input({
        openCalls: [
          { subject: "$RSP", dueAt: new Date(NOW.getTime() + 6 * 86400000).toISOString() },
        ],
      })
    );
    expect(far.personal).toBe(0);
    expect(far.lines).toContain("Your Calls still open: 1.");

    const near = assembleFacts(
      input({
        openCalls: [
          {
            subject: "$RSP",
            dueAt: new Date(NOW.getTime() + CALL_DUE_SOON_MS - 3600000).toISOString(),
          },
        ],
      })
    );
    expect(near.personal).toBe(1);
    expect(near.lines).toContain(
      "Of those, 1 settles within a day, the nearest on $RSP in about 23 hours."
    );
  });

  it("names a member the reader follows, and never one they do not", () => {
    const facts = assembleFacts(
      input({
        viewer: { id: "me", followingIds: ["friend"], houseSlug: null },
        events: [
          event({ actorId: "friend", actorName: "Vale", kind: "crest.earned", payload: { title: "First Blood" } }),
          event({ actorId: "stranger", actorName: "Nobody" }),
        ],
      })
    );
    expect(facts.lines).toContain(
      "Vale, whom you follow, earned a Crest: First Blood."
    );
    expect(facts.lines.some((l) => l.includes("Nobody"))).toBe(false);
  });

  it("attributes an act to the member themselves rather than to a stranger", () => {
    const facts = assembleFacts(
      input({
        events: [event({ actorId: "me", kind: "quest.completed", payload: { title: "Muster" } })],
      })
    );
    expect(facts.lines).toContain("You completed a quest: Muster.");
    expect(facts.lines.some((l) => l.startsWith("Elsewhere in the realm"))).toBe(false);
  });

  it("never counts one event twice across the sections", () => {
    const facts = assembleFacts(
      input({
        viewer: { id: "me", followingIds: ["friend"], houseSlug: "vantage" },
        events: [
          event({ actorId: "me", houseSlug: "vantage" }),
          event({ actorId: "friend", houseSlug: null, actorName: "Vale" }),
          event({ actorId: "stranger", houseSlug: null }),
        ],
      })
    );
    const elsewhere = facts.lines.find((l) => l.startsWith("Elsewhere in the realm"));
    expect(elsewhere).toBe("Elsewhere in the realm: 1 settled a Call.");
  });

  it("reads the rival from the member's side of the gap", () => {
    const behind = assembleFacts(
      input({
        house: {
          name: "House Vantage",
          rank: 2,
          of: 6,
          glory: 400,
          rival: { name: "House Ember", gap: 40, ahead: true },
        },
      })
    );
    expect(behind.lines).toContain("Nearest rival: House Ember, 40 Glory ahead of you.");
  });

  it("says Points and Glory, never a token amount", () => {
    const facts = assembleFacts(
      input({ ledger: { points: 120, glory: 8, entries: 4 } })
    );
    const line = facts.lines.find((l) => l.startsWith("Settled to you"));
    expect(line).toBe("Settled to you in the window: 120 Points and 8 Glory, across 4 entries.");
    expect(facts.lines.some((l) => l.includes("$RSP"))).toBe(false);
  });

  it("stays short enough to be one paragraph's worth of facts", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      event({ actorId: `friend${i}`, actorName: `Friend ${i}` })
    );
    const facts = assembleFacts(
      input({
        viewer: {
          id: "me",
          followingIds: many.map((e) => e.actorId as string),
          houseSlug: null,
        },
        events: many,
      })
    );
    /* Three named acts at most, whatever the window held. */
    expect(facts.lines.filter((l) => l.includes("whom you follow")).length).toBe(3);
  });
});

describe("the spend caps", () => {
  it("lets an honest member read the realm all day without being cut off", () => {
    /* The cap is the backstop behind the TTL, not the thing that paces a
       member. A member who opens the Ravenry at every window boundary for a
       whole day must stay inside it, or the cap is silently truncating an
       honest reader rather than catching a loop. */
    const windowsInADay = Math.floor(86400000 / DIGEST_TTL_MS);
    expect(DIGEST_PER_MEMBER_DAILY).toBeGreaterThanOrEqual(windowsInADay);
  });

  it("still bounds a member hard", () => {
    /* And it is a bound, not a formality: a page reloading in a loop cannot
       spend more than a handful of calls a day. */
    expect(DIGEST_PER_MEMBER_DAILY).toBeLessThanOrEqual(2 * (86400000 / DIGEST_TTL_MS));
    expect(DIGEST_RATE_WINDOW_SECONDS).toBe(86400);
  });

  it("caps the realm above any one member", () => {
    expect(DIGEST_REALM_DAILY).toBeGreaterThan(DIGEST_PER_MEMBER_DAILY);
  });
});

describe("callDueAt", () => {
  it("reads each timeframe the realm uses", () => {
    const sealed = "2026-08-13T00:00:00.000Z";
    expect(callDueAt(sealed, "24h")).toBe("2026-08-14T00:00:00.000Z");
    expect(callDueAt(sealed, "7d")).toBe("2026-08-20T00:00:00.000Z");
    expect(callDueAt(sealed, "30d")).toBe("2026-09-12T00:00:00.000Z");
  });

  it("returns nothing rather than guessing at an unreadable row", () => {
    expect(callDueAt("2026-08-13T00:00:00.000Z", null)).toBeNull();
    expect(callDueAt("2026-08-13T00:00:00.000Z", "fortnight")).toBeNull();
    expect(callDueAt("not a time", "24h")).toBeNull();
  });
});
