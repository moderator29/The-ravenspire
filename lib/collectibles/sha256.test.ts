import { describe, it, expect } from "vitest";
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  sha256Hex,
  hmacSha256Hex,
  sha256Bytes,
  hmacSha256Bytes,
  toHex,
} from "@/lib/collectibles/sha256";

/* This file is the reason anybody should trust the verifier.
 *
 * `sha256.ts` is a hand written SHA-256, shipped to the browser so a member can
 * rerun a chest draw without asking the realm to do it for them. A hand written
 * hash is exactly the kind of code that is right for the inputs its author
 * tried and wrong for the ones they did not: a missing high length word breaks
 * only past 512MB, a mishandled block boundary breaks only at 55 and 56 bytes,
 * and an HMAC that forgets to hash an oversized key breaks only past 64.
 *
 * So nothing here asserts a digest somebody typed out. Every case is checked
 * against `node:crypto`, an implementation nobody in this repository wrote,
 * over the boundaries that actually bite. If this file ever fails, every
 * commitment the realm has published is void and the verifier is lying, so it
 * is worth more than the roll tests are.
 */

const nodeSha = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const nodeHmac = (key: string, message: string) =>
  createHmac("sha256", Buffer.from(key, "utf8")).update(message, "utf8").digest("hex");

describe("sha256Hex", () => {
  it("matches the one fixed point the whole scheme rests on", () => {
    /* sha256 of the empty string. Written out rather than computed, because it
       is the value `pulls.test.ts` has always pinned and the two must agree. */
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("matches the published NIST vectors", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(
      sha256Hex(
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"
      )
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("matches node:crypto across the block boundary, byte by byte", () => {
    /* 55, 56 and 64 are where the padding decides whether one more block is
       needed. An implementation that gets the length encoding wrong is correct
       on both sides of that seam and wrong exactly on it. */
    for (let n = 0; n <= 130; n += 1) {
      const text = "x".repeat(n);
      expect(sha256Hex(text)).toBe(nodeSha(text));
    }
  });

  it("matches node:crypto on utf8 beyond ascii", () => {
    /* A client seed is whatever the member typed. If the encoding differed
       between the realm and the browser, a member whose seed is not ascii
       would be told their own honest opening was forged. */
    for (const text of ["ravnspire", "寿司", "رافن", "seed \u{1f985}", "éèê"]) {
      expect(sha256Hex(text)).toBe(nodeSha(text));
    }
  });

  it("matches node:crypto on random input", () => {
    for (let i = 0; i < 200; i += 1) {
      const bytes = randomBytes(1 + (i % 200));
      expect(toHex(sha256Bytes(new Uint8Array(bytes)))).toBe(
        createHash("sha256").update(bytes).digest("hex")
      );
    }
  });
});

describe("hmacSha256Hex", () => {
  it("matches node:crypto either side of the 64 byte key boundary", () => {
    /* The realm's server seeds are 64 hex characters, which is exactly the
       block size, so the boundary case is not hypothetical: it is the only
       length this codebase ever uses in production. */
    for (const n of [0, 1, 32, 63, 64, 65, 128]) {
      const key = "k".repeat(n);
      expect(hmacSha256Hex(key, "message")).toBe(nodeHmac(key, "message"));
    }
  });

  it("matches node:crypto on the exact shape the roll produces", () => {
    /* `${clientSeed}:${nonce}:${label}`, with a real 64 hex seed as the key.
       Anything that passes only on toy inputs has not been tested. */
    const seed = randomBytes(32).toString("hex");
    const nonce = "8e2f4c1a-91b7-4a30-9c55-2d6e0f7b3a41";
    for (const label of ["rarity:0", "card:0", "rarity:4", "card:9", "guarantee"]) {
      for (const clientSeed of ["", "my client seed", "\u{1f985}"]) {
        const message = `${clientSeed}:${nonce}:${label}`;
        expect(hmacSha256Hex(seed, message)).toBe(nodeHmac(seed, message));
      }
    }
  });

  it("matches node:crypto on random keys and messages", () => {
    for (let i = 0; i < 120; i += 1) {
      const key = randomBytes(1 + (i % 90));
      const message = randomBytes(1 + ((i * 7) % 200));
      expect(
        toHex(hmacSha256Bytes(new Uint8Array(key), new Uint8Array(message)))
      ).toBe(createHmac("sha256", key).update(message).digest("hex"));
    }
  });
});
