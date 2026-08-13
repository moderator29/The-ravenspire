import { describe, it, expect } from "vitest";
import {
  bannerFor,
  isPublicSharePath,
  readBanner,
  sharePath,
  shareUrl,
  type ShareTarget,
} from "@/lib/share/links";

/* The hostile half of lib/share/links.ts.
 *
 * Every case here is a URL somebody else controls. A share path is built from
 * a handle a member chose, opened by a stranger who can edit it, and asked
 * about by the gate that decides whether to bounce them. The three failures
 * that matter are: a path escaping its shape, a private surface reading as
 * public, and a banner crediting somebody who did not earn it. */

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("sharePath", () => {
  it("builds the six shapes", () => {
    expect(sharePath({ kind: "keep", handle: "raven_lord" })).toBe("/u/raven_lord");
    expect(sharePath({ kind: "call", id: UUID })).toBe(`/calls/${UUID}`);
    expect(sharePath({ kind: "house", slug: "house-of-embers" })).toBe(
      "/houses/house-of-embers"
    );
    expect(
      sharePath({ kind: "crest", handle: "raven_lord", slug: "lord-of-light" })
    ).toBe("/u/raven_lord/crest/lord-of-light");
    expect(sharePath({ kind: "proof", reference: UUID })).toBe(`/proof/${UUID}`);
    expect(sharePath({ kind: "listing", id: UUID })).toBe(`/market/${UUID}`);
  });

  it("normalises the handle rather than minting a second URL for one Keep", () => {
    expect(sharePath({ kind: "keep", handle: "@RavenLord" })).toBe("/u/ravenlord");
    expect(sharePath({ kind: "keep", handle: "  ravenlord  " })).toBe("/u/ravenlord");
  });

  it("refuses anything that is not the realm's own shape", () => {
    const bad: ShareTarget[] = [
      { kind: "keep", handle: "../../admin" },
      { kind: "keep", handle: "a" },
      { kind: "keep", handle: "x".repeat(21) },
      { kind: "keep", handle: "raven lord" },
      { kind: "keep", handle: "raven/lord" },
      { kind: "keep", handle: "raven?banner=thief" },
      { kind: "keep", handle: "raven#fragment" },
      { kind: "keep", handle: "raven%2f..%2fadmin" },
      { kind: "keep", handle: "" },
      { kind: "call", id: "not-a-uuid" },
      { kind: "call", id: `${UUID} OR 1=1` },
      { kind: "house", slug: "House Of Embers" },
      { kind: "house", slug: "-leading-hyphen" },
      { kind: "house", slug: "trailing-hyphen-" },
      { kind: "house", slug: "double--hyphen" },
      { kind: "house", slug: "a".repeat(65) },
      { kind: "crest", handle: "ravenlord", slug: "" },
      { kind: "crest", handle: "", slug: "lord-of-light" },
      { kind: "proof", reference: "0" },
      { kind: "listing", id: "'; drop table market_listings; --" },
    ];
    for (const target of bad) {
      expect(sharePath(target), JSON.stringify(target)).toBeNull();
    }
  });

  it("refuses a kind it has never heard of", () => {
    /* A target arriving from JSON, from an older client, or from a caller who
       widened the union and forgot this switch. It must not fall through to a
       path built out of undefined. */
    const rogue = { kind: "throne", id: UUID } as unknown as ShareTarget;
    expect(sharePath(rogue)).toBeNull();
  });
});

describe("isPublicSharePath", () => {
  it("admits exactly the shapes sharePath produces", () => {
    expect(isPublicSharePath("/u/ravenlord")).toBe(true);
    expect(isPublicSharePath("/u/ravenlord/crest/lord-of-light")).toBe(true);
    expect(isPublicSharePath(`/calls/${UUID}`)).toBe(true);
    expect(isPublicSharePath("/houses/house-of-embers")).toBe(true);
    expect(isPublicSharePath(`/market/${UUID}`)).toBe(true);
    expect(isPublicSharePath(`/post/${UUID}`)).toBe(true);
  });

  it("tolerates a trailing slash, because chat clients add them", () => {
    expect(isPublicSharePath("/u/ravenlord/")).toBe(true);
    expect(isPublicSharePath(`/calls/${UUID}/`)).toBe(true);
  });

  it("tolerates display casing on a handle", () => {
    expect(isPublicSharePath("/u/RavenLord")).toBe(true);
  });

  it("does not let a public prefix open a private child", () => {
    /* The failure this rule exists for: a startsWith check would make every
       one of these public because a real public path is a prefix of them. */
    expect(isPublicSharePath("/houses/house-of-embers/admin")).toBe(false);
    expect(isPublicSharePath("/u/ravenlord/settings")).toBe(false);
    expect(isPublicSharePath("/u/ravenlord/crest/lord-of-light/edit")).toBe(false);
    expect(isPublicSharePath(`/calls/${UUID}/resolve`)).toBe(false);
    expect(isPublicSharePath(`/market/${UUID}/pay`)).toBe(false);
  });

  it("keeps the member-only realm shut", () => {
    for (const path of [
      "/",
      "/home",
      "/keep",
      "/vault",
      "/ledger",
      "/whispers",
      "/settings",
      "/admin",
      "/admin/users",
      "/war/battle",
      "/market",
      "/houses",
      "/calls",
      "/u",
      "/u/",
      "/u/ab",
      "/banners",
    ]) {
      expect(isPublicSharePath(path), path).toBe(false);
    }
  });

  it("refuses anything that is not a rooted path", () => {
    expect(isPublicSharePath("u/ravenlord")).toBe(false);
    expect(isPublicSharePath("https://evil.example/u/ravenlord")).toBe(false);
    expect(isPublicSharePath("//evil.example/u/ravenlord")).toBe(false);
    expect(isPublicSharePath("")).toBe(false);
  });
});

describe("bannerFor", () => {
  it("credits a member sharing their own moment", () => {
    expect(bannerFor({ handle: "ravenlord", own: true })).toBe("ravenlord");
  });

  it("drops the banner when the sharer is not the subject", () => {
    /* Sharing somebody else's Keep and taking the recruit for it would be
       reassigning a member the subject had at least as good a claim to. */
    expect(bannerFor({ handle: "ravenlord", own: false })).toBeNull();
  });

  it("drops the banner when there is no handle to credit", () => {
    expect(bannerFor({ handle: null, own: true })).toBeNull();
    expect(bannerFor({ handle: "", own: true })).toBeNull();
    expect(bannerFor(null)).toBeNull();
    expect(bannerFor(undefined)).toBeNull();
  });

  it("refuses a handle that is not a handle", () => {
    expect(bannerFor({ handle: "a b", own: true })).toBeNull();
    expect(bannerFor({ handle: "x".repeat(40), own: true })).toBeNull();
  });
});

describe("shareUrl", () => {
  const origin = "https://ravenspire.vercel.app";

  it("returns an absolute URL a chat client will not mangle", () => {
    expect(shareUrl(origin, { kind: "keep", handle: "ravenlord" })).toBe(
      "https://ravenspire.vercel.app/u/ravenlord"
    );
  });

  it("carries the banner only on a member's own moment", () => {
    expect(
      shareUrl(origin, { kind: "keep", handle: "ravenlord" }, {
        handle: "ravenlord",
        own: true,
      })
    ).toBe("https://ravenspire.vercel.app/u/ravenlord?banner=ravenlord");
    expect(
      shareUrl(origin, { kind: "keep", handle: "someoneelse" }, {
        handle: "ravenlord",
        own: false,
      })
    ).toBe("https://ravenspire.vercel.app/u/someoneelse");
  });

  it("uses the origin it was handed, so a preview shares preview links", () => {
    expect(
      shareUrl("http://localhost:3000", { kind: "house", slug: "embers" })
    ).toBe("http://localhost:3000/houses/embers");
  });

  it("refuses an origin that is not http or https", () => {
    /* A share control that will build a javascript: URL is a share control
       that will one day be handed one. */
    expect(shareUrl("javascript:alert(1)", { kind: "keep", handle: "ravenlord" })).toBeNull();
    expect(shareUrl("data:text/html,x", { kind: "keep", handle: "ravenlord" })).toBeNull();
    expect(shareUrl("not an origin", { kind: "keep", handle: "ravenlord" })).toBeNull();
  });

  it("returns null when the target itself is unshareable", () => {
    expect(shareUrl(origin, { kind: "call", id: "nope" })).toBeNull();
  });
});

describe("readBanner", () => {
  it("reads a real handle out of a query string", () => {
    expect(readBanner("?banner=ravenlord")).toBe("ravenlord");
    expect(readBanner("banner=@RavenLord")).toBe("ravenlord");
    expect(readBanner(new URLSearchParams({ banner: "ravenlord" }))).toBe(
      "ravenlord"
    );
  });

  it("refuses anything that is not a handle", () => {
    /* This value is attacker controlled by definition: it is in a URL a
       stranger was handed, it gets stowed in localStorage and it is later
       posted to /api/onboard. */
    for (const raw of [
      "",
      "a",
      "<script>alert(1)</script>",
      "ravenlord&banner=thief",
      "../../admin",
      "x".repeat(200),
      "raven lord",
    ]) {
      expect(readBanner(`banner=${encodeURIComponent(raw)}`), raw).toBeNull();
    }
  });

  it("still reads the older ?ref= spelling", () => {
    /* Links minted by the referral panel and the Vault's earn card are already
       in circulation as /?ref=<code>, and they have to keep crediting. */
    expect(readBanner("?ref=ravenlord")).toBe("ravenlord");
    expect(readBanner("?ref=@RavenLord")).toBe("ravenlord");
  });

  it("prefers banner when a URL somehow carries both", () => {
    expect(readBanner("?banner=ravenlord&ref=thief")).toBe("ravenlord");
  });

  it("is null when no banner was raised", () => {
    expect(readBanner("")).toBeNull();
    expect(readBanner("?tab=calls")).toBeNull();
  });
});
