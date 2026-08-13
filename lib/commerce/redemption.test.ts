import { describe, it, expect } from "vitest";
import {
  generateCode,
  normalizeCode,
  hashCode,
  isWellFormed,
} from "@/lib/commerce/redemption";

describe("redemption codes", () => {
  it("generates a well-formed, grouped code", () => {
    const code = generateCode();
    expect(isWellFormed(code)).toBe(true);
    expect(code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/);
  });

  it("never uses confusable characters", () => {
    for (let i = 0; i < 50; i++) {
      const code = normalizeCode(generateCode());
      expect(code).not.toMatch(/[O0IL1]/);
    }
  });

  it("normalises case, dashes and stray punctuation to one canonical form", () => {
    const code = generateCode();
    const messy = code.toLowerCase().replace(/-/g, " . ");
    expect(normalizeCode(messy)).toBe(normalizeCode(code));
  });

  it("hashes the same code identically regardless of formatting", () => {
    const code = generateCode();
    expect(hashCode(code)).toBe(hashCode(code.toLowerCase()));
    expect(hashCode(code)).toBe(hashCode(code.replace(/-/g, "")));
  });

  it("hashes distinct codes distinctly", () => {
    expect(hashCode(generateCode())).not.toBe(hashCode(generateCode()));
  });

  it("produces a hex digest, never the code in the clear", () => {
    const code = generateCode();
    const hash = hashCode(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(normalizeCode(code));
  });

  it("rejects a code of the wrong length", () => {
    expect(isWellFormed("ABCD")).toBe(false);
    expect(isWellFormed("")).toBe(false);
  });
});
