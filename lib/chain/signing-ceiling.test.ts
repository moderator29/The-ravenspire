import { describe, expect, it } from "vitest";
import {
  formatCeilingEther,
  MAX_CEILING_WEI,
  overCeilingSentence,
  parseCeilingEther,
  parseCeilingWei,
  withinCeiling,
} from "@/lib/chain/signing-ceiling";

/* The amount arithmetic, which is the part of this mission that can be wrong by
 * a factor of a billion without anybody noticing until a member signs something.
 *
 * Every case here is either a real input a member can type or a real value the
 * database can hand back. Nothing needs a chain.
 */

const ONE_ETH = 10n ** 18n;

describe("parseCeilingEther", () => {
  it("converts whole and fractional ether exactly", () => {
    expect(parseCeilingEther("1")).toBe(ONE_ETH);
    expect(parseCeilingEther("0")).toBe(0n);
    expect(parseCeilingEther("0.5")).toBe(ONE_ETH / 2n);
    expect(parseCeilingEther("0.001")).toBe(10n ** 15n);
  });

  it("is exact past the point where a float stops being", () => {
    /* 0.1 + 0.2 is the famous one, but the failure that matters here is
       quieter: Number loses exactness above 2^53, which in wei is about
       0.009 ETH, so a Number-based parser is wrong for almost every real
       ceiling a member would set. */
    expect(parseCeilingEther("0.1")).toBe(100_000_000_000_000_000n);
    expect(parseCeilingEther("0.123456789012345678")).toBe(
      123_456_789_012_345_678n
    );
  });

  it("keeps the full eighteen decimal places", () => {
    expect(parseCeilingEther("0.000000000000000001")).toBe(1n);
  });

  it("tolerates surrounding whitespace, because a paste carries it", () => {
    expect(parseCeilingEther("  0.25  ")).toBe(ONE_ETH / 4n);
  });

  it("refuses a nineteenth decimal place rather than silently dropping it", () => {
    /* This is the case a lenient parser gets wrong: it truncates and returns a
       ceiling the member did not set. Refusing sends them back to the field. */
    expect(parseCeilingEther("0.0000000000000000001")).toBeNull();
  });

  it("refuses forms nobody meant", () => {
    expect(parseCeilingEther("1e18")).toBeNull();
    expect(parseCeilingEther("-1")).toBeNull();
    expect(parseCeilingEther("+1")).toBeNull();
    expect(parseCeilingEther(".5")).toBeNull();
    expect(parseCeilingEther("1.")).toBeNull();
    expect(parseCeilingEther("1,000")).toBeNull();
    expect(parseCeilingEther("1 000")).toBeNull();
    expect(parseCeilingEther("0x1")).toBeNull();
    expect(parseCeilingEther("")).toBeNull();
    expect(parseCeilingEther("   ")).toBeNull();
    expect(parseCeilingEther("Infinity")).toBeNull();
    expect(parseCeilingEther("NaN")).toBeNull();
    expect(parseCeilingEther("1.2.3")).toBeNull();
  });

  it("refuses a value the ceiling column could not hold", () => {
    expect(parseCeilingEther("10000000")).toBe(MAX_CEILING_WEI);
    expect(parseCeilingEther("10000001")).toBeNull();
  });
});

describe("parseCeilingWei", () => {
  it("reads the decimal string the database and the wire carry", () => {
    expect(parseCeilingWei("1000000000000000000")).toBe(ONE_ETH);
    expect(parseCeilingWei("0")).toBe(0n);
  });

  it("refuses anything that is not a plain integer", () => {
    expect(parseCeilingWei("1.0")).toBeNull();
    expect(parseCeilingWei("-1")).toBeNull();
    expect(parseCeilingWei("1e18")).toBeNull();
    expect(parseCeilingWei("")).toBeNull();
  });

  it("refuses a value above what the column holds", () => {
    expect(parseCeilingWei((MAX_CEILING_WEI + 1n).toString())).toBeNull();
  });

  it("does not quietly agree with the ether parser", () => {
    /* The two take strings that look alike and mean amounts a billion billion
       apart. "1" is one ether to one of them and one wei to the other, and a
       single function that guessed would guess wrong here. */
    expect(parseCeilingWei("1")).toBe(1n);
    expect(parseCeilingEther("1")).toBe(ONE_ETH);
  });
});

describe("formatCeilingEther", () => {
  it("shows the reading, not the storage", () => {
    expect(formatCeilingEther(ONE_ETH)).toBe("1");
    expect(formatCeilingEther(ONE_ETH / 2n)).toBe("0.5");
    expect(formatCeilingEther(0n)).toBe("0");
  });

  it("keeps every significant digit it was given", () => {
    expect(formatCeilingEther(123_456_789_012_345_678n)).toBe(
      "0.123456789012345678"
    );
    expect(formatCeilingEther(1n)).toBe("0.000000000000000001");
  });

  it("round trips whatever a member can type", () => {
    for (const input of ["0", "1", "0.5", "0.1", "12.34", "0.000000000000000001"]) {
      const wei = parseCeilingEther(input);
      expect(wei).not.toBeNull();
      expect(formatCeilingEther(wei as bigint)).toBe(input);
    }
  });
});

describe("withinCeiling", () => {
  it("permits everything when the member set no ceiling", () => {
    expect(withinCeiling(MAX_CEILING_WEI, null)).toBe(true);
  });

  it("treats a ceiling of zero as a real refusal, not as no ceiling", () => {
    /* A member who only ever claims cards and never wants a Ravenspire screen
       asking them to move value sets zero, and that has to be honoured exactly.
       A null-ish check anywhere in this path would read 0n as "unset" and
       permit everything, which is the one bug that would turn the strictest
       setting into the loosest. */
    expect(withinCeiling(0n, 0n)).toBe(true);
    expect(withinCeiling(1n, 0n)).toBe(false);
  });

  it("is inclusive at the boundary", () => {
    /* A member who sets 0.1 means they will sign for 0.1. */
    const ceiling = ONE_ETH / 10n;
    expect(withinCeiling(ceiling, ceiling)).toBe(true);
    expect(withinCeiling(ceiling + 1n, ceiling)).toBe(false);
    expect(withinCeiling(ceiling - 1n, ceiling)).toBe(true);
  });

  it("holds a wei apart at a scale a float could not see", () => {
    const ceiling = parseCeilingEther("1") as bigint;
    expect(withinCeiling(ceiling + 1n, ceiling)).toBe(false);
  });
});

describe("overCeilingSentence", () => {
  it("names both numbers and where to change one", () => {
    const sentence = overCeilingSentence(ONE_ETH, ONE_ETH / 2n);
    expect(sentence).toContain("1 ETH");
    expect(sentence).toContain("0.5 ETH");
    /* "over your limit" without the limit is an error message that makes
       somebody go hunting for a settings screen. */
    expect(sentence).toContain("Vault");
  });
});
