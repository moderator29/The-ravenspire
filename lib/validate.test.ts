import { describe, expect, it } from "vitest";
import {
  boundedInt,
  boundedString,
  evmAddress,
  txHash,
  uuid,
} from "@/lib/validate";

/* These predicates guard the values interpolated into PostgREST .or() filter
   strings, where , ( ) and . are grammar. The cases that matter most are the
   ones that would smuggle those characters through. */

describe("uuid", () => {
  it("accepts a canonical v4 uuid in either case", () => {
    expect(uuid("6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b")).toBe(true);
    expect(uuid("6F1A2B3C-4D5E-4F60-8A9B-0C1D2E3F4A5B")).toBe(true);
  });

  it("rejects filter grammar and near misses", () => {
    expect(uuid("not-a-uuid")).toBe(false);
    expect(uuid("6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5")).toBe(false); // short
    expect(uuid("6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b,x.eq.y")).toBe(false);
    expect(uuid("6f1a2b3c)4d5e-4f60-8a9b-0c1d2e3f4a5b")).toBe(false);
    expect(uuid(42)).toBe(false);
    expect(uuid(null)).toBe(false);
    expect(uuid(undefined)).toBe(false);
  });
});

describe("txHash", () => {
  it("accepts a 32-byte 0x hash", () => {
    expect(txHash(`0x${"ab".repeat(32)}`)).toBe(true);
    expect(txHash(`0x${"AB".repeat(32)}`)).toBe(true);
  });

  it("rejects wrong lengths, missing prefix and non-hex", () => {
    expect(txHash("ab".repeat(32))).toBe(false);
    expect(txHash(`0x${"ab".repeat(31)}`)).toBe(false);
    expect(txHash(`0x${"gg".repeat(32)}`)).toBe(false);
    expect(txHash(12345)).toBe(false);
  });
});

describe("evmAddress", () => {
  it("accepts a 20-byte 0x address", () => {
    expect(evmAddress(`0x${"a1".repeat(20)}`)).toBe(true);
  });

  it("rejects wrong lengths and non-hex", () => {
    expect(evmAddress(`0x${"a1".repeat(19)}`)).toBe(false);
    expect(evmAddress(`0x${"zz".repeat(20)}`)).toBe(false);
    expect(evmAddress("")).toBe(false);
  });
});

describe("boundedString", () => {
  it("accepts a non-empty string up to the bound", () => {
    expect(boundedString("hello", 5)).toBe(true);
  });

  it("rejects empty, overlong and non-strings", () => {
    expect(boundedString("", 5)).toBe(false);
    expect(boundedString("hello!", 5)).toBe(false);
    expect(boundedString(5, 5)).toBe(false);
  });
});

describe("boundedInt", () => {
  it("accepts integers on and inside the bounds", () => {
    expect(boundedInt(1, 1, 10)).toBe(true);
    expect(boundedInt(10, 1, 10)).toBe(true);
  });

  it("rejects floats, out-of-range values and non-numbers", () => {
    expect(boundedInt(3.7, 1, 10)).toBe(false);
    expect(boundedInt(0, 1, 10)).toBe(false);
    expect(boundedInt(11, 1, 10)).toBe(false);
    expect(boundedInt(NaN, 1, 10)).toBe(false);
    expect(boundedInt("3", 1, 10)).toBe(false);
  });
});
