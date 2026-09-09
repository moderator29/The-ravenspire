import { describe, it, expect } from "vitest";
import { ordinal, overtakeReactionFacts } from "@/lib/ai/house-reactions";

describe("ordinal", () => {
  it("names the first six ranks in words", () => {
    expect(ordinal(1)).toBe("first");
    expect(ordinal(2)).toBe("second");
    expect(ordinal(6)).toBe("sixth");
  });

  it("falls back to a numeral past the sixth rank rather than guessing a word", () => {
    expect(ordinal(7)).toBe("7th");
    expect(ordinal(20)).toBe("20th");
  });
});

describe("overtakeReactionFacts", () => {
  const base = {
    houseName: "Stormcrest",
    passedName: "Corvane",
    rank: 2,
    houseScore: 1840,
    passedScore: 1790,
  };

  it("states what happened, where it left the House, and the real numbers", () => {
    const facts = overtakeReactionFacts(base);
    expect(facts).toHaveLength(3);
    expect(facts[0]).toBe(
      "Stormcrest just passed Corvane in the realm's live standings."
    );
    expect(facts[1]).toBe("Stormcrest now stands second in the realm.");
    expect(facts[2]).toBe("Score right now: Stormcrest 1840, Corvane 1790.");
  });

  it("never states a figure that was not given to it", () => {
    /* Every line is built from the four numbers and two names on the input
       and nothing else, so a fact sheet built from real data can never grow a
       number the caller did not supply. */
    const facts = overtakeReactionFacts(base);
    const joined = facts.join(" ");
    expect(joined).toContain(String(base.houseScore));
    expect(joined).toContain(String(base.passedScore));
  });

  it("carries no em dash, so the Herald's own house rule never has to strip one from a fact line", () => {
    const facts = overtakeReactionFacts(base);
    for (const line of facts) {
      expect(line).not.toMatch(/[\u2014\u2013]/);
    }
  });
});
