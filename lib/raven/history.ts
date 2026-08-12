/* The rules of a stored Herald conversation.
 *
 * Every decision the persistence routes make that is not a database call lives
 * here: what a message is allowed to be, how a title is derived, which
 * conversations fall off the end of the cap, and what order a list comes back
 * in. The routes are the thin half.
 *
 * The split is not tidiness. A route handler cannot be unit tested without a
 * database, so a cap enforced inside one is a cap nobody checks until a member
 * has 400 conversations. These are pure functions over plain data and the
 * tests hold them directly.
 *
 * Client safe: no server-only import, no database type. The client is not
 * wired to any of this yet and will be wired by someone else, but nothing here
 * would have to move when it is.
 */

/* ------------------------------------------------------------------
   Caps. Every one is enforced on the server and none of them trusts a
   number the client sent.
   ------------------------------------------------------------------ */

/* Conversations kept per member, matching the 40 the client already trims to.
   The oldest by last activity fall off, which is the same rule the drawer
   applies, so a member who has been using the localStorage version sees the
   same history survive the move. */
export const MAX_CONVERSATIONS = 40;

/* Messages kept in one conversation.
 *
 * A separate cap from the conversation count and it is doing different work.
 * Without it one conversation is an unbounded, member-writable row count: the
 * conversation cap does nothing to stop a single thread growing forever, and
 * the read path loads a whole conversation at once. Five hundred is far past
 * any real thread and still bounds the worst case at 40 x 500 rows a member.
 *
 * The oldest fall off, because a conversation is read from the bottom. */
export const MAX_MESSAGES_PER_CONVERSATION = 500;

/* Messages one append may carry. A send produces two, the member's and the
   Herald's; anything near this is a client replaying its whole history. */
export const MAX_APPEND_BATCH = 50;

/* Matches the database check constraint. Beyond this the route rejects rather
   than truncating: storing a shortened copy of what a member said, and calling
   it the record, is a lie the member cannot see. */
export const MAX_CONTENT_CHARS = 16000;

/* Matches the database check constraint. */
export const MAX_TITLE_CHARS = 120;

/* The size of the meta document, serialised. The card payloads are small; this
   exists so a crafted client cannot store megabytes per message. */
export const MAX_META_BYTES = 32000;

export const MESSAGE_ROLES = ["user", "assistant", "error"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export interface IncomingMessage {
  role: MessageRole;
  content: string;
  meta?: Record<string, unknown>;
}

/* ------------------------------------------------------------------
   Validation
   ------------------------------------------------------------------ */

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRole(value: unknown): value is MessageRole {
  return (
    typeof value === "string" &&
    (MESSAGE_ROLES as readonly string[]).includes(value)
  );
}

/* One message off the wire.
 *
 * Deliberately strict about role and length and deliberately permissive about
 * meta, because meta holds the Herald surface's own card shapes and those
 * change without this file changing. What is checked is that it is an object
 * and that it is small. */
export function validateMessage(raw: unknown): Validated<IncomingMessage> {
  if (!raw || typeof raw !== "object")
    return { ok: false, error: "A message must be an object." };
  const m = raw as Record<string, unknown>;

  if (!isRole(m.role))
    return { ok: false, error: "A message needs a role of user, assistant or error." };

  if (typeof m.content !== "string")
    return { ok: false, error: "A message needs text." };
  if (m.content.length > MAX_CONTENT_CHARS)
    return {
      ok: false,
      error: `A message may not exceed ${MAX_CONTENT_CHARS} characters.`,
    };

  let meta: Record<string, unknown> | undefined;
  if (m.meta !== undefined && m.meta !== null) {
    if (typeof m.meta !== "object" || Array.isArray(m.meta))
      return { ok: false, error: "Message meta must be an object." };
    let size = 0;
    try {
      size = JSON.stringify(m.meta).length;
    } catch {
      return { ok: false, error: "Message meta could not be read." };
    }
    if (size > MAX_META_BYTES)
      return { ok: false, error: "Message meta is too large." };
    meta = m.meta as Record<string, unknown>;
  }

  return {
    ok: true,
    value: meta ? { role: m.role, content: m.content, meta } : { role: m.role, content: m.content },
  };
}

/* A batch off the wire. Returns the first failure rather than a list, because
   a client sending one bad message is a client with a bug, not a member who
   needs itemised feedback. */
export function validateMessages(raw: unknown): Validated<IncomingMessage[]> {
  if (!Array.isArray(raw))
    return { ok: false, error: "Messages must be an array." };
  if (raw.length === 0)
    return { ok: false, error: "There are no messages to store." };
  if (raw.length > MAX_APPEND_BATCH)
    return {
      ok: false,
      error: `An append may carry at most ${MAX_APPEND_BATCH} messages.`,
    };
  const out: IncomingMessage[] = [];
  for (const item of raw) {
    const result = validateMessage(item);
    if (!result.ok) return result;
    out.push(result.value);
  }
  return { ok: true, value: out };
}

/* ------------------------------------------------------------------
   Titles
   ------------------------------------------------------------------ */

export const DEFAULT_TITLE = "New chat";

/* A conversation's name, from a member's own first words, matching what the
   client already does so a title does not change when history moves server
   side. Collapses whitespace so a pasted block does not become a title with a
   newline in the middle of it. */
export function deriveTitle(messages: IncomingMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  return normalizeTitle(first?.content ?? "");
}

export function normalizeTitle(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_CHARS).trim();
  return text === "" ? DEFAULT_TITLE : text;
}

/* ------------------------------------------------------------------
   Caps, applied
   ------------------------------------------------------------------ */

export interface ConversationOrder {
  id: string;
  updated_at: string;
}

/* The order the list route promises: most recently touched first, ties broken
 * on id so the order is total.
 *
 * Exported and shared with the cap on purpose. The two have to agree or a
 * member sees a conversation in their drawer that the next append silently
 * deletes, because the list kept it and the cap did not. Expressing the order
 * once means they cannot drift apart, and the route's SQL states the same two
 * keys in the same directions. */
export function sortForList<T extends ConversationOrder>(all: T[]): T[] {
  return [...all].sort((a, b) => {
    const at = Date.parse(a.updated_at);
    const bt = Date.parse(b.updated_at);
    /* An unreadable timestamp sorts last rather than throwing, which makes it
       the first thing the cap drops. That is the right direction: a row the
       realm cannot date is the one it should be least attached to. */
    const av = Number.isFinite(at) ? at : 0;
    const bv = Number.isFinite(bt) ? bt : 0;
    if (bv !== av) return bv - av;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/* Which conversations fall off the end once this member has too many.
 *
 * Takes every conversation the member owns and returns the ids to delete. The
 * caller has just created or touched one, so the list it passes already
 * includes it, and the newest by last activity survive. */
export function conversationsOverCap(
  all: ConversationOrder[],
  cap: number = MAX_CONVERSATIONS
): string[] {
  if (all.length <= cap) return [];
  return sortForList(all).slice(cap).map((c) => c.id);
}

export interface MessageOrder {
  id: string;
  seq: number;
}

/* Which messages fall off the front of one conversation once it is too long.
 *
 * The oldest go, because a conversation is read from the bottom and the recent
 * turns are the ones that carry the thread. */
export function messagesOverCap(
  all: MessageOrder[],
  cap: number = MAX_MESSAGES_PER_CONVERSATION
): string[] {
  if (all.length <= cap) return [];
  const sorted = [...all].sort((a, b) => a.seq - b.seq);
  return sorted.slice(0, all.length - cap).map((m) => m.id);
}

/* The next positions for an append, given the highest seq already stored.
 *
 * Returned as a list rather than a starting number so the caller cannot get
 * the arithmetic wrong at the one place a mistake would collide with the
 * unique index and fail the whole write. */
export function nextSeqs(highest: number | null, count: number): number[] {
  const start = highest === null ? 0 : highest + 1;
  return Array.from({ length: count }, (_, i) => start + i);
}
