/* The realm's one reaction palette, shared by every surface that lets a
   member react to something in real time: the Rookery's court (a broadcast
   only, never persisted) and a Whisper's own messages (persisted, one per
   member per message). Six Icon names, nothing invented: a reaction a member
   sends is drawn from exactly this list on both the client and the server
   that accepts it. */
export const REACTIONS = [
  "heart",
  "flame",
  "crown",
  "swords",
  "medal",
  "shield",
] as const;

export type Reaction = (typeof REACTIONS)[number];

export function isReaction(value: unknown): value is Reaction {
  return typeof value === "string" && (REACTIONS as readonly string[]).includes(value);
}
