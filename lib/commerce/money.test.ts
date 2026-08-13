import { describe, it, expect } from "vitest";
import {
  majorToMinor,
  lineTotal,
  sumMinor,
  formatMoney,
  money,
  splitFee,
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

  /* The fee split, which the Bazaar's protocol fee rides on. The exhaustive
     sweep across every price the market allows lives in
     lib/commerce/market.test.ts, where the rate and the bounds are; these are
     the properties the function itself has to hold for any caller. */
  it("splits a fee into two integers that add back up", () => {
    expect(splitFee(1000, 500)).toEqual({
      totalMinor: 1000,
      feeMinor: 50,
      netMinor: 950,
      bps: 500,
    });
    /* Half a cent rounds up, and the net is derived by subtraction rather than
       by a second rounding, so the two halves can never disagree with the
       whole. */
    expect(splitFee(2999, 500)).toMatchObject({ feeMinor: 150, netMinor: 2849 });
    expect(splitFee(0, 500)).toMatchObject({ feeMinor: 0, netMinor: 0 });
    expect(splitFee(1000, 0)).toMatchObject({ feeMinor: 0, netMinor: 1000 });
    expect(splitFee(1000, 10_000)).toMatchObject({ feeMinor: 1000, netMinor: 0 });
  });

  it("refuses a fractional amount or an out of range rate", () => {
    expect(() => splitFee(100.5, 500)).toThrow();
    expect(() => splitFee(100, 500.5)).toThrow();
    expect(() => splitFee(-100, 500)).toThrow();
    expect(() => splitFee(100, 10_001)).toThrow();
  });
});
