import { describe, expect, it } from "vitest";
import {
  DEFAULT_TITLE,
  MAX_APPEND_BATCH,
  MAX_CONTENT_CHARS,
  MAX_CONVERSATIONS,
  MAX_MESSAGES_PER_CONVERSATION,
  MAX_TITLE_CHARS,
  conversationsOverCap,
  deriveTitle,
  messagesOverCap,
  nextSeqs,
  normalizeTitle,
  sortForList,
  validateMessage,
  validateMessages,
} from "@/lib/raven/history";

const at = (iso: string) => `${iso}T00:00:00.000Z`;

describe("the conversation cap is server authoritative", () => {
  it("keeps everything below the cap", () => {
    const all = Array.from({ length: MAX_CONVERSATIONS }, (_, i) => ({
      id: `c${i}`,
      updated_at: at(`2026-08-${String((i % 28) + 1).padStart(2, "0")}`),
    }));
    expect(conversationsOverCap(all)).toEqual([]);
  });

  it("drops the least recently touched once over", () => {
    const all = [
      { id: "new", updated_at: at("2026-08-12") },
      { id: "mid", updated_at: at("2026-08-11") },
      { id: "old", updated_at: at("2026-08-10") },
    ];
    expect(conversationsOverCap(all, 2)).toEqual(["old"]);
  });

  it("drops as many as it takes, not one at a time", () => {
    const all = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      /* c0 newest, c9 oldest. */
      updated_at: at(`2026-08-${String(20 - i).padStart(2, "0")}`),
    }));
    const dropped = conversationsOverCap(all, 4);
    expect(dropped).toHaveLength(6);
    expect(dropped).not.toContain("c0");
    expect(dropped).toContain("c9");
  });

  it("is deterministic when two share a timestamp", () => {
    const all = [
      { id: "b", updated_at: at("2026-08-10") },
      { id: "a", updated_at: at("2026-08-10") },
      { id: "c", updated_at: at("2026-08-12") },
    ];
    /* A cap that picks a different victim per run cannot be tested or
       reasoned about, so ties break on id. */
    expect(conversationsOverCap(all, 2)).toEqual(["b"]);
    expect(conversationsOverCap(all, 2)).toEqual(["b"]);
  });

  it("treats an unreadable timestamp as oldest rather than throwing", () => {
    const all = [
      { id: "good", updated_at: at("2026-08-12") },
      { id: "broken", updated_at: "not a date" },
    ];
    expect(conversationsOverCap(all, 1)).toEqual(["broken"]);
  });

  it("defaults to the cap the client already uses", () => {
    expect(MAX_CONVERSATIONS).toBe(40);
  });
});

describe("the message cap bounds one conversation", () => {
  it("keeps everything below the cap", () => {
    const all = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, seq: i }));
    expect(messagesOverCap(all, 10)).toEqual([]);
  });

  it("drops the oldest, because a thread is read from the bottom", () => {
    const all = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, seq: i }));
    expect(messagesOverCap(all, 4)).toEqual(["m0", "m1"]);
  });

  it("orders by seq, not by the order it was handed", () => {
    const all = [
      { id: "late", seq: 9 },
      { id: "early", seq: 1 },
      { id: "mid", seq: 5 },
    ];
    expect(messagesOverCap(all, 2)).toEqual(["early"]);
  });

  it("is a different cap from the conversation cap and does different work", () => {
    /* Without this one, a single thread is an unbounded row count that the
       conversation cap does nothing about. */
    expect(MAX_MESSAGES_PER_CONVERSATION).toBeGreaterThan(MAX_CONVERSATIONS);
  });
});

describe("seq assignment cannot collide", () => {
  it("starts at zero for an empty conversation", () => {
    expect(nextSeqs(null, 3)).toEqual([0, 1, 2]);
  });

  it("continues after the highest stored", () => {
    expect(nextSeqs(7, 2)).toEqual([8, 9]);
  });

  it("returns nothing for an empty append", () => {
    expect(nextSeqs(4, 0)).toEqual([]);
  });

  it("never reuses the highest, which the unique index would reject", () => {
    expect(nextSeqs(0, 1)).toEqual([1]);
  });
});

describe("message validation", () => {
  it("accepts the three roles the surface uses", () => {
    for (const role of ["user", "assistant", "error"]) {
      expect(validateMessage({ role, content: "hello" }).ok).toBe(true);
    }
  });

  it("refuses an unknown role rather than storing it", () => {
    /* The database has the same check. This is the half that gives the member
       a sentence instead of a constraint violation. */
    expect(validateMessage({ role: "system", content: "x" }).ok).toBe(false);
  });

  it("refuses a message with no text field", () => {
    expect(validateMessage({ role: "user" }).ok).toBe(false);
    expect(validateMessage({ role: "user", content: 42 }).ok).toBe(false);
  });

  it("accepts empty text, which an error message legitimately has", () => {
    expect(validateMessage({ role: "error", content: "" }).ok).toBe(true);
  });

  it("rejects rather than truncates an oversized message", () => {
    const big = { role: "user", content: "x".repeat(MAX_CONTENT_CHARS + 1) };
    const result = validateMessage(big);
    expect(result.ok).toBe(false);
    /* Truncating and storing it would present a shortened copy as the record
       of what the member said. */
  });

  it("accepts exactly the maximum", () => {
    expect(
      validateMessage({ role: "user", content: "x".repeat(MAX_CONTENT_CHARS) }).ok
    ).toBe(true);
  });

  it("takes an arbitrary meta object, because card shapes are not its business", () => {
    const result = validateMessage({
      role: "assistant",
      content: "here",
      meta: { cards: [{ symbol: "RSP" }], sources: [], browsed: true },
    });
    expect(result.ok).toBe(true);
  });

  it("refuses meta that is not an object", () => {
    expect(validateMessage({ role: "user", content: "x", meta: [] }).ok).toBe(false);
    expect(validateMessage({ role: "user", content: "x", meta: "no" }).ok).toBe(false);
  });

  it("refuses meta large enough to be a storage attack", () => {
    const meta = { blob: "x".repeat(40000) };
    expect(validateMessage({ role: "user", content: "x", meta }).ok).toBe(false);
  });

  it("refuses a non object", () => {
    expect(validateMessage(null).ok).toBe(false);
    expect(validateMessage("hello").ok).toBe(false);
  });
});

describe("batch validation", () => {
  it("accepts a normal send, which is two messages", () => {
    const result = validateMessages([
      { role: "user", content: "what is a Call" },
      { role: "assistant", content: "A public timestamped read." },
    ]);
    expect(result.ok).toBe(true);
  });

  it("refuses an empty append", () => {
    expect(validateMessages([]).ok).toBe(false);
  });

  it("refuses a client replaying its whole history", () => {
    const many = Array.from({ length: MAX_APPEND_BATCH + 1 }, () => ({
      role: "user",
      content: "x",
    }));
    expect(validateMessages(many).ok).toBe(false);
  });

  it("refuses the whole batch when one message is bad", () => {
    const result = validateMessages([
      { role: "user", content: "fine" },
      { role: "wrong", content: "bad" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("refuses something that is not an array", () => {
    expect(validateMessages({ role: "user", content: "x" }).ok).toBe(false);
  });
});

describe("titles", () => {
  it("takes the member's first words", () => {
    expect(
      deriveTitle([
        { role: "assistant", content: "greeting" },
        { role: "user", content: "how does Renown work" },
      ])
    ).toBe("how does Renown work");
  });

  it("falls back when the member has said nothing", () => {
    expect(deriveTitle([{ role: "assistant", content: "hello" }])).toBe(
      DEFAULT_TITLE
    );
    expect(deriveTitle([])).toBe(DEFAULT_TITLE);
  });

  it("collapses whitespace so a pasted block is one line", () => {
    expect(normalizeTitle("a\n\n  b\tc  ")).toBe("a b c");
  });

  it("falls back for whitespace only, rather than titling a conversation with a space", () => {
    expect(normalizeTitle("   \n  ")).toBe(DEFAULT_TITLE);
  });

  it("fits the column the database declares", () => {
    const long = normalizeTitle("word ".repeat(200));
    expect(long.length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
  });

  it("does not leave a trailing space when it cuts", () => {
    const cut = normalizeTitle("x".repeat(MAX_TITLE_CHARS - 1) + " tail");
    expect(cut).toBe(cut.trim());
  });
});

describe("the list order and the cap agree", () => {
  /* The invariant this protects: the conversations the list route returns are
     exactly the ones the cap keeps. If the two orders ever diverge, a member
     sees a conversation in their drawer that the next append silently deletes,
     and nothing anywhere reports it. Both read sortForList, and the route's
     SQL states the same two keys in the same directions. */
  const sample = [
    { id: "d", updated_at: at("2026-08-09") },
    { id: "b", updated_at: at("2026-08-12") },
    { id: "a", updated_at: at("2026-08-12") },
    { id: "c", updated_at: at("2026-08-10") },
  ];

  it("orders most recently touched first", () => {
    expect(sortForList(sample).map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps exactly what the list would show first", () => {
    for (const cap of [1, 2, 3, 4]) {
      const kept = sortForList(sample)
        .slice(0, cap)
        .map((c) => c.id);
      const dropped = conversationsOverCap(sample, cap);
      expect(kept.filter((id) => dropped.includes(id))).toEqual([]);
      expect(kept.length + dropped.length).toBe(sample.length);
    }
  });

  it("does not mutate what it was handed", () => {
    const before = sample.map((c) => c.id);
    sortForList(sample);
    conversationsOverCap(sample, 2);
    expect(sample.map((c) => c.id)).toEqual(before);
  });
});
