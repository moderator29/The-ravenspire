import { describe, it, expect } from "vitest";
import { crests } from "@/components/brand/crests";
import { SET_ONE } from "@/lib/collectibles/set-one";
import {
  cardTokenId,
  crestSlugsWithIds,
  crestTokenId,
  isSoulbound,
} from "@/lib/collectibles/token-ids";

/* Token ids are the one thing in this product that genuinely cannot be fixed
   later. Once a card is minted at id 10007, id 10007 is that card in every
   wallet and every marketplace, forever, and a later refactor that renumbers
   it does not renumber the tokens people already hold: it just makes the
   platform disagree with the chain about what somebody owns.

   So these tests are not really about the arithmetic. They are a tripwire on
   the tables. Every assertion below fails loudly if a future change reorders a
   catalog, drops a crest, or renames a set. */

describe("card token ids", () => {
  it("gives Set One the first ten thousand ids, keyed by collector number", () => {
    expect(cardTokenId("set-one", 1)).toBe("10001");
    expect(cardTokenId("set-one", 7)).toBe("10007");
    expect(cardTokenId("set-one", 40)).toBe("10040");
  });

  it("issues a distinct id for every card in the set", () => {
    const ids = SET_ONE.cards.map((c) => cardTokenId(SET_ONE.slug, c.number));
    expect(ids).toHaveLength(SET_ONE.counts.total);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("refuses a set with no frozen id space rather than guessing one", () => {
    expect(() => cardTokenId("set-two", 1)).toThrow(/frozen id space/);
  });

  it("refuses a collector number outside the set's room", () => {
    expect(() => cardTokenId("set-one", 0)).toThrow(/out of range/);
    expect(() => cardTokenId("set-one", 10_001)).toThrow(/out of range/);
    expect(() => cardTokenId("set-one", 1.5)).toThrow(/out of range/);
  });
});

describe("crest token ids", () => {
  it("covers the live crest catalog exactly, with nothing left over", () => {
    /* Both directions on purpose. A crest in the catalog with no id cannot be
       claimed, and an id with no crest is a number reserved for something
       nobody can name. */
    const catalog = crests.map((c) => c.slug).sort();
    const frozen = crestSlugsWithIds().sort();
    expect(frozen).toEqual(catalog);
  });

  it("issues a distinct id per crest", () => {
    const ids = crests.map((c) => crestTokenId(c.slug));
    expect(ids.every((id) => id !== null)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("holds the ids the realm has already promised", () => {
    /* Hand written, not derived. If someone reorders the crest catalog this is
       the assertion that stops the reorder from renumbering owned tokens. */
    expect(crestTokenId("took-the-black")).toBe("1");
    expect(crestTokenId("knight-of-the-realm")).toBe("2");
    expect(crestTokenId("warden-of-the-realm")).toBe("3");
    expect(crestTokenId("champion-of-the-season")).toBe("10");
  });

  it("answers null for a crest with no frozen id instead of inventing one", () => {
    expect(crestTokenId("crest-that-does-not-exist")).toBeNull();
  });
});

describe("soulbound law", () => {
  it("binds crests and frees cards", () => {
    expect(isSoulbound("crest")).toBe(true);
    expect(isSoulbound("card")).toBe(false);
  });
});
