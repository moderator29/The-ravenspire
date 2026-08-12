import { describe, it, expect } from "vitest";
import {
  majorToMinor,
  lineTotal,
  sumMinor,
  formatMoney,
  money,
} from "@/lib/commerce/money";

describe("money", () => {
  it("converts major to minor without float drift", () => {
    expect(majorToMinor(4.99)).toBe(499);
    expect(majorToMinor(14.99)).toBe(1499);
    expect(majorToMinor(59.99)).toBe(5999);
    /* The classic float trap: 0.1 + 0.2 handled by rounding to the cent. */
    expect(majorToMinor(0.1 + 0.2)).toBe(30);
  });

  it("rejects a negative or non-finite amount", () => {
    expect(() => majorToMinor(-1)).toThrow();
    expect(() => majorToMinor(Number.NaN)).toThrow();
  });

  it("refuses a non-integer minor amount", () => {
    expect(() => money(4.5)).toThrow();
  });

  it("computes a line total as an integer product", () => {
    expect(lineTotal(499, 3)).toBe(1497);
  });

  it("rejects a fractional or non-positive quantity", () => {
    expect(() => lineTotal(499, 0)).toThrow();
    expect(() => lineTotal(499, 1.5)).toThrow();
    expect(() => lineTotal(499, -2)).toThrow();
  });

  it("sums minor amounts, empty is zero", () => {
    expect(sumMinor([])).toBe(0);
    expect(sumMinor([499, 1499, 5999])).toBe(7997);
  });

  it("formats for display only, two decimals", () => {
    expect(formatMoney(money(499))).toBe("$4.99");
    expect(formatMoney(money(5999))).toBe("$59.99");
    expect(formatMoney(money(0))).toBe("$0.00");
  });
});
