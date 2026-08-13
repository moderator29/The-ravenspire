import { describe, it, expect } from "vitest";
import { normalizeShipping } from "@/lib/commerce/shipping";

/* A physical order must never ship to a fabricated or half-formed address, so
   the normaliser is strict on output: a required field missing returns null,
   which the checkout route turns into an honest rejection. These tests pin that
   boundary and the input spellings the reader accepts. */

const COMPLETE = {
  name: "Aeron Vale",
  line1: "1 Raven Road",
  city: "Kingsreach",
  region: "CA",
  postalCode: "90210",
  country: "US",
};

describe("normalizeShipping", () => {
  it("returns a canonical address for a complete input", () => {
    expect(normalizeShipping(COMPLETE)).toEqual({
      name: "Aeron Vale",
      line1: "1 Raven Road",
      city: "Kingsreach",
      region: "CA",
      postalCode: "90210",
      country: "US",
    });
  });

  it("rejects a missing required field", () => {
    for (const field of ["name", "line1", "city", "postalCode", "country"]) {
      const partial = { ...COMPLETE } as Record<string, unknown>;
      delete partial[field];
      expect(normalizeShipping(partial)).toBeNull();
    }
  });

  it("rejects a blank required field", () => {
    expect(normalizeShipping({ ...COMPLETE, city: "   " })).toBeNull();
  });

  it("rejects a non-object", () => {
    expect(normalizeShipping(null)).toBeNull();
    expect(normalizeShipping("1 Raven Road")).toBeNull();
    expect(normalizeShipping(undefined)).toBeNull();
  });

  it("accepts the common field spellings and normalises them", () => {
    const result = normalizeShipping({
      name: "Aeron Vale",
      address1: "1 Raven Road",
      address2: "Tower 3",
      city: "Kingsreach",
      state: "CA",
      postal_code: "90210",
      country: "us",
    });
    expect(result).toEqual({
      name: "Aeron Vale",
      line1: "1 Raven Road",
      line2: "Tower 3",
      city: "Kingsreach",
      region: "CA",
      postalCode: "90210",
      country: "US",
    });
  });

  it("upcases a two-letter country code but leaves a full name alone", () => {
    expect(normalizeShipping({ ...COMPLETE, country: "gb" })?.country).toBe("GB");
    expect(
      normalizeShipping({ ...COMPLETE, country: "United Kingdom" })?.country
    ).toBe("United Kingdom");
  });

  it("omits optional fields when absent rather than emitting empties", () => {
    const result = normalizeShipping({
      name: "Aeron Vale",
      line1: "1 Raven Road",
      city: "Kingsreach",
      postalCode: "90210",
      country: "US",
    });
    expect(result).toEqual({
      name: "Aeron Vale",
      line1: "1 Raven Road",
      city: "Kingsreach",
      postalCode: "90210",
      country: "US",
    });
    expect(result && "line2" in result).toBe(false);
    expect(result && "region" in result).toBe(false);
    expect(result && "email" in result).toBe(false);
  });

  it("caps an overlong field rather than storing unbounded input", () => {
    const long = "x".repeat(500);
    const result = normalizeShipping({ ...COMPLETE, line1: long });
    expect(result?.line1.length).toBe(200);
  });
});
