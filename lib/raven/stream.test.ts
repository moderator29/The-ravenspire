import { describe, it, expect } from "vitest";
import { drainSseFrames } from "@/lib/raven/stream";

describe("drainSseFrames", () => {
  it("reads a single complete frame", () => {
    const { events, rest } = drainSseFrames(
      'event: text\ndata: {"text":"hello"}\n\n'
    );
    expect(events).toEqual([{ type: "text", text: "hello" }]);
    expect(rest).toBe("");
  });

  it("reads several frames arriving in one chunk", () => {
    const { events, rest } = drainSseFrames(
      'event: text\ndata: {"text":"a"}\n\nevent: text\ndata: {"text":"b"}\n\n'
    );
    expect(events).toEqual([
      { type: "text", text: "a" },
      { type: "text", text: "b" },
    ]);
    expect(rest).toBe("");
  });

  it("holds back a frame split across a chunk boundary", () => {
    const first = drainSseFrames('event: text\ndata: {"te');
    expect(first.events).toEqual([]);
    expect(first.rest).toBe('event: text\ndata: {"te');

    const second = drainSseFrames(first.rest + 'xt":"hello"}\n\n');
    expect(second.events).toEqual([{ type: "text", text: "hello" }]);
    expect(second.rest).toBe("");
  });

  it("parses a done event with an arbitrary result payload", () => {
    const { events } = drainSseFrames(
      'event: done\ndata: {"reply":"hi","suggestions":["a"]}\n\n'
    );
    expect(events).toEqual([
      { type: "done", result: { reply: "hi", suggestions: ["a"] } },
    ]);
  });

  it("parses an error event, with or without a message", () => {
    const withMessage = drainSseFrames(
      'event: error\ndata: {"error":"The Raven is preoccupied. Try again shortly."}\n\n'
    );
    expect(withMessage.events).toEqual([
      { type: "error", message: "The Raven is preoccupied. Try again shortly." },
    ]);

    const withoutMessage = drainSseFrames('event: error\ndata: {}\n\n');
    expect(withoutMessage.events).toEqual([{ type: "error", message: undefined }]);
  });

  it("drops a frame it does not recognise rather than surfacing garbage", () => {
    expect(drainSseFrames('event: ping\ndata: {}\n\n').events).toEqual([]);
    expect(drainSseFrames("event: text\ndata: not json\n\n").events).toEqual([]);
    expect(drainSseFrames('event: text\ndata: {"text":42}\n\n').events).toEqual([]);
  });

  it("ignores a frame with no data line", () => {
    expect(drainSseFrames("event: text\n\n").events).toEqual([]);
  });

  it("is a no-op on an empty buffer", () => {
    const { events, rest } = drainSseFrames("");
    expect(events).toEqual([]);
    expect(rest).toBe("");
  });
});
