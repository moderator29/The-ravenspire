import { describe, it, expect } from "vitest";
import {
  hoardVisible,
  pnlVisible,
  privacyFlag,
  privacyGates,
  publicPositions,
} from "@/lib/privacy";

/* The privacy gates read a JSON column, which means they read whatever anybody
   has ever written into it: an older client, a hand edit in the dashboard, a
   partially migrated row. The failure that matters is a member who said "hide
   this" and was not heard, and the second is a member who said nothing and was
   hidden anyway, because a product that hides everybody's standing by default
   shows nobody's. Both directions are tested. */

const KEYS = ["hoardVisible", "pnlVisible", "publicPositions"] as const;

describe("privacyFlag", () => {
  it("honours an explicit false", () => {
    for (const key of KEYS) {
      expect(privacyFlag({ privacy: { [key]: false } }, key), key).toBe(false);
    }
  });

  it("honours an explicit true", () => {
    for (const key of KEYS) {
      expect(privacyFlag({ privacy: { [key]: true } }, key), key).toBe(true);
    }
  });

  it("defaults to shown when the member has never said otherwise", () => {
    for (const settings of [
      null,
      undefined,
      {},
      { privacy: {} },
      { privacy: null },
      { profile: { thesis: "hello" } },
      { privacy: { somethingElse: false } },
    ]) {
      expect(privacyFlag(settings, "hoardVisible"), JSON.stringify(settings)).toBe(
        true
      );
    }
  });

  it("ignores a value that is not a boolean", () => {
    /* A client that stringified a checkbox writes "false", and a truthy string
       must not become a privacy setting nobody chose. Only a real boolean
       decides, in either direction. */
    for (const value of ["false", "true", 0, 1, "", [], {}, null]) {
      expect(
        privacyFlag({ privacy: { hoardVisible: value } }, "hoardVisible"),
        JSON.stringify(value)
      ).toBe(true);
    }
  });

  it("is not confused by a settings blob that is not an object", () => {
    for (const settings of ["", "privacy", 42, true, [1, 2, 3]]) {
      expect(privacyFlag(settings, "pnlVisible"), String(settings)).toBe(true);
    }
  });

  it("keeps the three gates independent", () => {
    /* Sealing a Hoard must not seal earnings, and hiding the mix behind a
       total must not hide the total. They are three separate decisions a
       member makes, and one flag standing in for three would silently
       over-hide or under-hide two of them. */
    const settings = { privacy: { hoardVisible: false } };
    expect(hoardVisible(settings)).toBe(false);
    expect(pnlVisible(settings)).toBe(true);
    expect(publicPositions(settings)).toBe(true);
  });
});

describe("privacyGates", () => {
  it("reads all three at once, which is what a share card needs", () => {
    /* An image has no viewer and can never take an "owner sees their own"
       branch, so it reads the raw flags together. */
    expect(
      privacyGates({
        privacy: { hoardVisible: false, pnlVisible: false, publicPositions: true },
      })
    ).toEqual({ hoard: false, pnl: false, positions: true });
  });

  it("is fully open for a member who has never touched settings", () => {
    expect(privacyGates(null)).toEqual({
      hoard: true,
      pnl: true,
      positions: true,
    });
  });
});
