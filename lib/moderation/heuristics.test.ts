import { describe, it, expect } from "vitest";
import { FLAG_AT, flagReason, screen } from "@/lib/moderation/heuristics";

/* The expensive failure here is not a missed spammer, it is a flagged member
   who did nothing wrong: a false flag spends a moderator's attention, which is
   the scarcest thing in the realm. So most of these tests are about what must
   NOT be flagged. */

describe("screen: ordinary posts are left alone", () => {
  const ordinary = [
    "Sealed a Call on $NAKA rising 20 percent over 24h. The volatility read says that is a hard one, so the score is worth having.",
    "WHAT A FINISH",
    "Anyone else watching the Frosthold standings? They have gone up two places this week.",
    "Here is the source I used: https://example.com/report and it is worth reading in full.",
    "gm",
  ];

  for (const text of ordinary) {
    it(`allows: ${text.slice(0, 40)}`, () => {
      const verdict = screen({ text });
      expect(verdict.action).toBe("allow");
      expect(verdict.spam).toBeLessThan(FLAG_AT);
    });
  }

  it("does not flag emphasis in a short shout", () => {
    expect(screen({ text: "LETS GO" }).signals).not.toContain("shouting");
  });

  it("does not flag a post that cites two real sources", () => {
    const verdict = screen({
      text: "The two filings that matter are here https://example.com/one and here https://example.com/two, and together they explain the whole move in the price this week.",
    });
    expect(verdict.action).toBe("allow");
  });
});

describe("screen: the common spam cases", () => {
  it("flags the same words posted again and again", () => {
    const verdict = screen({ text: "buy this coin", repeats: 3 });
    expect(verdict.action).toBe("flag");
    expect(verdict.signals.join()).toContain("repeated 3 times");
  });

  it("flags a body that is mostly links", () => {
    const verdict = screen({
      text: "https://a.example https://b.example https://c.example https://d.example",
    });
    expect(verdict.action).toBe("flag");
  });

  it("flags a wall of mentions", () => {
    const verdict = screen({ text: "look at this", mentions: 9 });
    expect(verdict.spam).toBeGreaterThanOrEqual(0.4);
    expect(verdict.signals.join()).toContain("9 mentions");
  });

  it("flags solicitation stacked on links", () => {
    const verdict = screen({
      text: "GUARANTEED PROFIT, DM me on telegram t.me/whatever for the free airdrop https://scam.example https://scam2.example",
    });
    expect(verdict.action).toBe("flag");
    expect(verdict.signals.join()).toContain("solicitation phrasing x");
  });

  it("flags one word repeated into a post", () => {
    const verdict = screen({
      text: "pump pump pump pump pump pump pump pump it now",
    });
    expect(verdict.signals).toContain("one word repeated");
  });

  it("counts a single solicitation phrase without flagging on it alone", () => {
    const verdict = screen({ text: "DM me if you want to talk about the Call" });
    expect(verdict.signals).toContain("solicitation phrasing");
    expect(verdict.action).toBe("allow");
  });
});

describe("screen: unambiguous abuse", () => {
  it("flags a threat", () => {
    const verdict = screen({ text: "i will find you" });
    expect(verdict.action).toBe("flag");
    expect(verdict.toxicity).toBeGreaterThanOrEqual(FLAG_AT);
  });

  it("flags an instruction to self harm", () => {
    expect(screen({ text: "kys" }).action).toBe("flag");
  });

  it("leaves ordinary heat alone, because heat is not abuse", () => {
    const verdict = screen({
      text: "that Call was terrible and the reasoning behind it was worse",
    });
    expect(verdict.action).toBe("allow");
    expect(verdict.toxicity).toBe(0);
  });
});

describe("flagReason", () => {
  it("tells a moderator what fired and that nothing was removed", () => {
    const reason = flagReason(screen({ text: "kys" }));
    expect(reason).toContain("abuse");
    expect(reason).toContain("Nothing was hidden or removed.");
  });

  it("names spam when spam is what fired", () => {
    const reason = flagReason(screen({ text: "buy this coin", repeats: 4 }));
    expect(reason).toContain("spam");
  });
});
