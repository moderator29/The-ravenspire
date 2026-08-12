/* Splitting the Herald's spoken answer from the follow-up block it appends.
 *
 * Pure, and deliberately not `server-only`, so the parser that decides what a
 * member sees can be unit tested without standing up the Anthropic client.
 * lib/ai/raven.ts asks the model to end its reply with a marked block of
 * two or three follow-up lines; this reads that block back off and, crucially,
 * strips the marker from the text no matter what, so a malformed block can
 * never be spoken aloud to a member.
 *
 * Tolerant on purpose. The marker matches case-insensitively with optional
 * inner whitespace and an optional hyphen ("FOLLOWUPS" or "FOLLOW-UPS"),
 * because a model otherwise obeying the format should not have its follow-ups
 * dropped, or worse have the marker leak into the reply, over a stray space.
 * When the block is absent, which is a legitimate outcome, the whole text is
 * the answer and there are no suggestions. */

const MARKER = /<<<\s*FOLLOW-?UPS\s*>>>/i;

export function splitFollowUps(raw: string): {
  text: string;
  suggestions: string[];
} {
  const at = raw.search(MARKER);
  if (at === -1) return { text: raw.trim(), suggestions: [] };

  const text = raw.slice(0, at).trim();
  const after = raw.slice(at).replace(MARKER, "");
  const suggestions = after
    .split("\n")
    .map((l) => l.replace(/^[\s\-*\d.)]+/, "").trim())
    /* Drop empties and anything too long to be a chip; a run-on line is a
       model that broke format, not a follow-up. */
    .filter((l) => l.length > 1 && l.length <= 120)
    .slice(0, 3);

  /* If the marker was emitted with no usable lines under it, the answer still
     stands and simply has no follow-ups. The `|| raw.trim()` guards the odd
     case where the marker is the very first thing in the output. */
  return { text: text || raw.trim(), suggestions };
}
