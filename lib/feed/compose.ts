import type { FeedItem } from "@/lib/feed/types";

/* Interleaving two time ordered sources under one cursor.
 *
 * The Ravenry reads ravens and realm events, both newest first, and has to
 * return them as one page a member can keep scrolling. Three things make that
 * harder than a sort:
 *
 * 1. A single timestamp cursor cannot describe a page drawn from two tables.
 *    "Everything before 12:04" is fine while one source produces the page and
 *    ambiguous the moment page composition is allowed to hold an item back. So
 *    the cursor carries one keyset position per source, and each source is
 *    consumed as a strict prefix of its own window. A source that contributed
 *    nothing keeps the position it came in with.
 *
 * 2. Two rows can share an instant exactly. emitMany() writes a whole batch of
 *    realm events in one statement, and every row in one statement takes the
 *    same now(), so House overtakes and settlement passes arrive as groups
 *    stamped identically. A cursor that says "strictly older than T" drops
 *    every sibling of the row it stopped on. So a position is an instant plus
 *    the ids already consumed at that instant, and the next page re-reads the
 *    instant and skips them.
 *
 * 3. The design system caps how dense system cards may be: no more than one per
 *    five ravens, and never two adjacent (DESIGN-SYSTEM.md section 5), enforced
 *    server side. The page therefore sometimes declines an event it was given,
 *    which is the other reason the per-source cursor above is not optional.
 *
 *    A cap that could starve is worse than no cap. In a young realm there may
 *    be more events than ravens, and a feed that hid them to preserve a ratio
 *    would be a quieter lie than an empty one. So the spacing rule holds only
 *    while there are ravens left in the window to separate events with; once
 *    they run out, events flow.
 *
 * Nothing here touches a database, which is the point: this is where an off by
 * one hides, and it is a pure function with tests beside it. */

/* One source's keyset position: the instant the last page ended on, and the
   ids already returned from that exact instant. */
export interface SourceCursor {
  at: string | null;
  seen: string[];
}

export interface FeedCursor {
  posts: SourceCursor;
  events: SourceCursor;
}

const START: SourceCursor = { at: null, seen: [] };

export const EMPTY_CURSOR: FeedCursor = { posts: START, events: START };

/* Ravens required between two system cards. Five, per the design law. */
export const SYSTEM_CARD_SPACING = 5;

/* A tie group larger than this is not a batch, it is a bug or an import, and
   an unbounded list of ids does not belong in a query string. Past it the
   cursor behaves as a plain keyset and the overflow is left behind rather than
   repeated forever. */
const MAX_SEEN = 64;

const SOURCE_SEP = "|";
const SEEN_SEP = "~";

/* The cursor on the wire. Opaque to the client by convention, readable by a
   person debugging a page, and safe inside a query string once
   URLSearchParams has encoded it. */
export function encodeFeedCursor(cursor: FeedCursor): string | null {
  if (!cursor.posts.at && !cursor.events.at) return null;
  return `${encodeSource(cursor.posts)}${SOURCE_SEP}${encodeSource(cursor.events)}`;
}

function encodeSource(source: SourceCursor): string {
  if (!source.at) return "";
  return source.seen.length > 0
    ? `${source.at}${SEEN_SEP}${source.seen.join(",")}`
    : source.at;
}

export function decodeFeedCursor(raw: string | null | undefined): FeedCursor {
  if (!raw) return EMPTY_CURSOR;
  if (raw.includes(SOURCE_SEP)) {
    const [posts, events] = raw.split(SOURCE_SEP);
    return { posts: decodeSource(posts), events: decodeSource(events) };
  }
  /* A bare timestamp is the old posts-only cursor. Honour it for both sources
     rather than dropping a caller mid scroll. */
  const single = decodeSource(raw);
  return { posts: single, events: single };
}

function decodeSource(raw: string | undefined): SourceCursor {
  if (!raw) return START;
  const [at, seen] = raw.split(SEEN_SEP);
  if (!at || Number.isNaN(Date.parse(at))) return START;
  return {
    at,
    seen: seen ? seen.split(",").filter(Boolean).slice(0, MAX_SEEN) : [],
  };
}

/* Milliseconds, newest first. An unparseable time sorts to the very end rather
   than poisoning the comparison. */
function ts(item: FeedItem): number {
  const t = Date.parse(item.at);
  return Number.isNaN(t) ? -Infinity : t;
}

export interface ComposeInput {
  /* Both newest first. Each is one window of its source, already audience
     filtered and already cut to at most the fetch limit. */
  posts: FeedItem[];
  events: FeedItem[];
  limit: number;
  /* Whether each window was truncated by its own fetch limit, meaning the
     source has more rows past it. */
  morePosts?: boolean;
  moreEvents?: boolean;
  /* The cursor this page was requested with, carried forward per source. */
  cursor?: FeedCursor;
  spacing?: number;
}

export interface ComposeResult {
  items: FeedItem[];
  cursor: FeedCursor;
  hasMore: boolean;
}

export function composeFeed({
  posts,
  events,
  limit,
  morePosts = false,
  moreEvents = false,
  cursor = EMPTY_CURSOR,
  spacing = SYSTEM_CARD_SPACING,
}: ComposeInput): ComposeResult {
  const items: FeedItem[] = [];
  let i = 0;
  let j = 0;
  /* Ravens placed since the last system card. Starts satisfied so a page may
     open with an event; a page that could never lead with one would bury every
     Call verdict behind five ravens forever. */
  let sincePost = spacing;
  /* Once an event is held back, no later event may be placed either. Each
     source is consumed as a prefix, so placing an older event after declining
     a newer one would lose the newer one for good. */
  let eventsClosed = false;

  while (items.length < limit) {
    const post = posts[i];
    const event = eventsClosed ? undefined : events[j];
    if (!post && !event) break;

    /* A raven wins a tie. Two items stamped the same instant are usually a
       raven and the event it caused, and the raven is the richer card. */
    const takeEvent = Boolean(event) && (!post || ts(event!) > ts(post));

    if (takeEvent) {
      if (sincePost < spacing && i < posts.length) {
        eventsClosed = true;
        continue;
      }
      items.push(event!);
      j += 1;
      sincePost = 0;
    } else {
      items.push(post!);
      i += 1;
      sincePost += 1;
    }
  }

  return {
    items,
    cursor: {
      posts: advance(posts, i, cursor.posts),
      events: advance(events, j, cursor.events),
    },
    hasMore: i < posts.length || j < events.length || morePosts || moreEvents,
  };
}

/* Where a source's next page starts, given how much of this window it gave.
   A source that gave nothing keeps its incoming position exactly. */
function advance(
  source: FeedItem[],
  taken: number,
  incoming: SourceCursor
): SourceCursor {
  if (taken === 0) return incoming;
  const at = source[taken - 1]!.at;
  const seen: string[] = [];
  /* The window may have started part way through this instant, so anything the
     previous page already reported at the same instant has to stay named. */
  if (incoming.at === at) seen.push(...incoming.seen);
  for (let n = taken - 1; n >= 0 && source[n]!.at === at; n -= 1) {
    if (!seen.includes(source[n]!.id)) seen.push(source[n]!.id);
  }
  return { at, seen: seen.slice(0, MAX_SEEN) };
}
