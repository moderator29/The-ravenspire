/* Reading a Server-Sent Events reply from /api/raven.
 *
 * Pure framing logic, kept apart from the fetch and the DOM stream reader
 * that use it, so the one part that is easy to get wrong (splitting a raw
 * byte stream into whole frames when a frame can arrive split across two
 * network chunks, or two frames can arrive in one chunk) is testable
 * without a real network stream. lib/raven/stream.test.ts is the split-chunk
 * half of that: the case a hand test with a single fetch would never hit.
 */

export type RavenTextEvent = { type: "text"; text: string };
export type RavenDoneEvent = { type: "done"; result: Record<string, unknown> };
export type RavenErrorEvent = { type: "error"; message?: string };
export type RavenStreamEvent = RavenTextEvent | RavenDoneEvent | RavenErrorEvent;

/* One SSE frame is "event: NAME\ndata: JSON\n\n" (a blank line ends it). A
 * frame is data only when `data` parses; anything else is a frame this
 * client does not understand, and it is dropped rather than surfaced,
 * since a stream that speaks a newer protocol than this build knows should
 * degrade to "said nothing new" rather than crash the transcript. */
function parseFrame(frame: string): RavenStreamEvent | null {
  let event = "message";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (event === "text" && typeof obj.text === "string") {
    return { type: "text", text: obj.text };
  }
  if (event === "done") {
    return { type: "done", result: obj };
  }
  if (event === "error") {
    return {
      type: "error",
      message: typeof obj.error === "string" ? obj.error : undefined,
    };
  }
  return null;
}

/* Takes everything read from the wire so far and returns every complete
 * frame in it, plus whatever incomplete tail is left to prepend to the next
 * chunk. Frames are separated by a blank line ("\n\n"); a chunk boundary
 * from the network has no relationship to a frame boundary, so the tail
 * genuinely can be a half-written frame, and treating it as one that
 * simply parsed to nothing would silently drop real text. */
export function drainSseFrames(buffer: string): {
  events: RavenStreamEvent[];
  rest: string;
} {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: RavenStreamEvent[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const parsed = parseFrame(trimmed);
    if (parsed) events.push(parsed);
  }
  return { events, rest };
}

/* Reads a fetch Response's body as a live sequence of Herald stream events,
 * calling `onEvent` for each as it becomes available. Resolves once the
 * stream ends (naturally, or the connection drops), never throws: a torn
 * connection ends the sequence exactly as if the server had sent nothing
 * further, and the caller decides from what it already has (some spoken
 * text with no `done`, or nothing at all) what to show for that. */
export async function readRavenStream(
  res: Response,
  onEvent: (event: RavenStreamEvent) => void
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = drainSseFrames(buffer);
      buffer = rest;
      for (const event of events) onEvent(event);
    }
  } catch {
    /* A dropped connection mid-stream. Whatever was already relayed to
       onEvent stands; there is nothing further to read. */
  }
}
