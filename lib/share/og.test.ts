import { describe, it, expect } from "vitest";
import { OG_GENERIC, ogNumber, ogTrim } from "@/lib/share/og";

/* The two pure helpers on the share chassis, and the honest empty card.
 *
 * These look small enough to skip and they are the two most visible functions
 * in the feature: they decide what a 1200x630 image that has already left the
 * product says. A headline that runs off the right edge or a number rendered as
 * NaN is not a bug anybody can fix after the fact, because the card has already
 * been posted. */

describe("ogTrim", () => {
  it("leaves short text exactly as it is", () => {
    expect(ogTrim("Raven Lord", 34)).toBe("Raven Lord");
  });

  it("collapses the whitespace a member typed", () => {
    /* A body with a newline in it renders as a gap in Satori, and a card with
       a hole in the middle of a sentence looks broken rather than airy. */
    expect(ogTrim("  The chart\n\n  says   so.  ", 60)).toBe(
      "The chart says so."
    );
  });

  it("cuts on a word boundary and marks the cut", () => {
    const out = ogTrim("alpha beta gamma delta epsilon", 20);
    expect(out).toBe("alpha beta gamma…");
    expect(out!.length).toBeLessThanOrEqual(21);
  });

  it("cuts mid-word rather than throwing away most of the line", () => {
    /* One very long token: backing off to the last space would leave almost
       nothing, so the cut is taken where it falls. */
    expect(ogTrim("a".repeat(50), 10)).toBe(`${"a".repeat(10)}…`);
  });

  it("is null for anything with nothing in it", () => {
    for (const raw of [null, undefined, "", "   ", "\n\t "]) {
      expect(ogTrim(raw, 40), JSON.stringify(raw)).toBeNull();
    }
  });

  it("never leaves whitespace sitting before the ellipsis", () => {
    /* The cut falls exactly on a space here, and " …" reads as a typo. */
    expect(ogTrim("alpha beta gamma", 11)).toBe("alpha beta…");
  });
});

describe("ogNumber", () => {
  it("groups thousands the way every Board in the product does", () => {
    expect(ogNumber(1234567)).toBe("1,234,567");
    expect(ogNumber(0)).toBe("0");
  });

  it("truncates rather than showing a fraction of a count", () => {
    expect(ogNumber(41.9)).toBe("41");
  });

  it("renders a missing or broken number as zero, never as NaN", () => {
    /* A card reading "NaN RENOWN" is the worst possible failure here: it has
       already left the product and it looks like the realm cannot count. */
    for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(ogNumber(value as number), String(value)).toBe("0");
    }
  });

  it("keeps a negative number negative", () => {
    expect(ogNumber(-40)).toBe("-40");
  });
});

describe("the honest empty card", () => {
  it("carries no numbers at all", () => {
    /* The tempting version of this card has the realm's headline totals on it,
       which would be the product inventing data at the exact moment it has
       none, in front of people with no way to check it. */
    expect(OG_GENERIC.stats ?? []).toEqual([]);
    expect(OG_GENERIC.verdict ?? null).toBeNull();
    const text = [OG_GENERIC.headline, OG_GENERIC.subline, OG_GENERIC.body]
      .filter(Boolean)
      .join(" ");
    expect(text).not.toMatch(/\d/);
  });

  it("names the realm and nobody in it", () => {
    expect(OG_GENERIC.headline).toBe("The Ravenspire");
    expect(OG_GENERIC.subline).not.toMatch(/@/);
  });
});
