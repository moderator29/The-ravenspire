import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* The one path every AI surface in the realm shares and none of them can test
   against a live model: no key configured.
 *
 * House rule 5 says every AI surface is a real Anthropic call over real data,
 * which means the honest answer when there is no key is silence. The failure
 * mode this guards against is the tempting one: a helper that returns a
 * plausible sentence when the model is unreachable, so that a surface always
 * has something to show. That sentence would be presented to a member as the
 * Herald, and it would be a lie.
 *
 * Nothing here asserts on model prose. It asserts that with no key there is no
 * call and no prose at all. */

describe("the Herald with no key configured", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports itself unavailable rather than pretending", async () => {
    const herald = await import("@/lib/ai/herald");
    expect(herald.heraldAvailable()).toBe(false);
    expect(herald.heraldClient()).toBeNull();
  });

  it("returns nothing, never a stand in sentence", async () => {
    const herald = await import("@/lib/ai/herald");
    const text = await herald.heraldProse({
      model: herald.MODEL_BRIEF,
      system: "You are the Herald.",
      user: "Window: the last 6 hours.",
      maxTokens: 220,
    });
    expect(text).toBeNull();
  });

  it("keeps the two model choices distinct, so the cheap surface stays cheap", async () => {
    const herald = await import("@/lib/ai/herald");
    expect(herald.MODEL_BRIEF).not.toBe(herald.MODEL_REASONING);
    expect(herald.MODEL_BRIEF.length).toBeGreaterThan(0);
    expect(herald.MODEL_REASONING.length).toBeGreaterThan(0);
  });
});
