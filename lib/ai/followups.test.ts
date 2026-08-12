import { describe, it, expect } from "vitest";
import { splitFollowUps } from "@/lib/ai/followups";

describe("splitFollowUps", () => {
  it("returns the whole text and no suggestions when the block is absent", () => {
    const r = splitFollowUps("Ether is holding steady around 3,900 today.");
    expect(r.text).toBe("Ether is holding steady around 3,900 today.");
    expect(r.suggestions).toEqual([]);
  });

  it("splits the answer from a well formed block", () => {
    const raw = [
      "Stormcrest suits a fast, aggressive caller.",
      "",
      "<<<FOLLOWUPS>>>",
      "What are Stormcrest's words?",
      "Who leads Stormcrest right now?",
      "How do I swear to them?",
    ].join("\n");
    const r = splitFollowUps(raw);
    expect(r.text).toBe("Stormcrest suits a fast, aggressive caller.");
    expect(r.suggestions).toEqual([
      "What are Stormcrest's words?",
      "Who leads Stormcrest right now?",
      "How do I swear to them?",
    ]);
  });

  it("caps at three even when the model over-produces", () => {
    const raw = "Answer.\n<<<FOLLOWUPS>>>\none\ntwo\nthree\nfour\nfive";
    expect(splitFollowUps(raw).suggestions).toEqual(["one", "two", "three"]);
  });

  it("strips numbering, bullets and quotes the model may add", () => {
    const raw = 'Answer.\n<<<FOLLOWUPS>>>\n1. first\n- second\n* third';
    expect(splitFollowUps(raw).suggestions).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("tolerates whitespace and the hyphenated spelling in the marker", () => {
    const raw = "Answer.\n<<< FOLLOW-UPS >>>\nkeep this";
    const r = splitFollowUps(raw);
    expect(r.text).toBe("Answer.");
    expect(r.suggestions).toEqual(["keep this"]);
  });

  it("never lets the marker leak into the spoken text", () => {
    const raw = "Answer.\n<<<FOLLOWUPS>>>";
    const r = splitFollowUps(raw);
    expect(r.text).toBe("Answer.");
    expect(r.text).not.toContain("<<<");
    expect(r.suggestions).toEqual([]);
  });

  it("drops a run on line that is really a broken format", () => {
    const long = "x".repeat(200);
    const raw = `Answer.\n<<<FOLLOWUPS>>>\n${long}\nshort one`;
    expect(splitFollowUps(raw).suggestions).toEqual(["short one"]);
  });
});
