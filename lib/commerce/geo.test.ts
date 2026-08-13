import { describe, expect, it } from "vitest";
import { geoVerdict, resolveCountry, type GeoResolution } from "@/lib/commerce/geo";

/* Geo is the guardrail whose failure mode is refusing honest members, so every
   branch of it is exercised here rather than sampled. The two properties that
   matter most are the two easiest to break by accident: an untrusted header is
   never read, and an unknown country is never quietly turned into an allowed
   one. */

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("resolveCountry", () => {
  it("ignores every country header when the platform is not trusted", () => {
    /* The whole point. Off a trusted edge, x-vercel-ip-country is a string the
       caller typed, and a caller who can type their own country has defeated
       the gate by typing. */
    const res = resolveCountry(
      headers({ "x-vercel-ip-country": "GB", "cf-ipcountry": "US" }),
      false
    );
    expect(res).toEqual({ country: null, source: "none" });
  });

  it("reads the platform header when it is trusted", () => {
    expect(resolveCountry(headers({ "x-vercel-ip-country": "gb" }), true)).toEqual({
      country: "GB",
      source: "platform-header",
    });
  });

  it("reads Cloudflare and Netlify headers too", () => {
    expect(resolveCountry(headers({ "cf-ipcountry": "DE" }), true).country).toBe("DE");
    expect(
      resolveCountry(headers({ "x-nf-client-connection-country": "FR" }), true).country
    ).toBe("FR");
  });

  it("treats Cloudflare's XX and T1 as an absence of an answer", () => {
    /* XX is "could not determine" and T1 is Tor. Recording either as a country
       would put a fake code on an order forever. */
    expect(resolveCountry(headers({ "cf-ipcountry": "XX" }), true).country).toBeNull();
    expect(resolveCountry(headers({ "cf-ipcountry": "T1" }), true).country).toBeNull();
  });

  it("refuses anything that is not two letters", () => {
    expect(resolveCountry(headers({ "cf-ipcountry": "GBR" }), true).country).toBeNull();
    expect(resolveCountry(headers({ "cf-ipcountry": "1" }), true).country).toBeNull();
    expect(resolveCountry(headers({ "cf-ipcountry": "" }), true).country).toBeNull();
  });

  it("falls through a junk header to a good one", () => {
    const res = resolveCountry(
      headers({ "x-vercel-ip-country": "XX", "cf-ipcountry": "IE" }),
      true
    );
    expect(res.country).toBe("IE");
  });

  it("reports null with no headers at all", () => {
    expect(resolveCountry(headers({}), true)).toEqual({ country: null, source: "none" });
  });
});

const known: GeoResolution = { country: "GB", source: "platform-header" };
const unknown: GeoResolution = { country: null, source: "none" };

describe("geoVerdict", () => {
  it("enforces nothing when the mode is off, even against a blocked country", () => {
    const v = geoVerdict(known, "off", new Set(["GB"]));
    expect(v.allowed).toBe(true);
  });

  it("refuses a blocked country in advisory mode", () => {
    const v = geoVerdict(known, "advisory", new Set(["GB"]));
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe("geo_blocked");
  });

  it("allows an unknown country in advisory mode", () => {
    /* Advisory is the default, and with no block list configured it enforces
       nothing at all. That is the honest starting state, not an oversight: it
       becomes real the moment the founder names a country. */
    expect(geoVerdict(unknown, "advisory", new Set(["GB"])).allowed).toBe(true);
    expect(geoVerdict(unknown, "advisory", new Set()).allowed).toBe(true);
  });

  it("refuses an unknown country in strict mode", () => {
    const v = geoVerdict(unknown, "strict", new Set());
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe("geo_unknown");
  });

  it("allows a known, unblocked country in strict mode", () => {
    expect(geoVerdict(known, "strict", new Set(["US"])).allowed).toBe(true);
  });

  it("carries the country and source through every verdict", () => {
    /* The order records both, and a verdict that dropped them would leave the
       audit trail with a decision and no basis for it. */
    for (const mode of ["off", "advisory", "strict"] as const) {
      const v = geoVerdict(known, mode, new Set(["GB"]));
      expect(v.country).toBe("GB");
      expect(v.source).toBe("platform-header");
    }
  });
});
