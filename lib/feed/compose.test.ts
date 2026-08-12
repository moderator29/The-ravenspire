import { describe, expect, it } from "vitest";
import {
  composeFeed,
  decodeFeedCursor,
  encodeFeedCursor,
  EMPTY_CURSOR,
  type FeedCursor,
  type SourceCursor,
} from "@/lib/feed/compose";
import type { FeedItem } from "@/lib/feed/types";

/* The merge under a cursor.
 *
 * This is the highest traffic path in the product and the one place where a
 * page boundary can silently eat a raven. Two sources, both time ordered, one
 * page, and a density rule that is allowed to hold an item back: every one of
 * those is a chance to drop or repeat a row. The properties that matter are
 * checked here rather than trusted.
 *
 * The fixtures below are test fixtures, not product data. Nothing in this file
 * is ever rendered. */

/* A minute apart, newest first, so a fixture reads in the order it appears. */
function at(minute: number): string {
  return new Date(Date.UTC(2026, 0, 1, 12, minute)).toISOString();
}

function post(id: string, minute: number): FeedItem {
  return {
    type: "post",
    id,
    at: at(minute),
    post: { id } as unknown as FeedItem extends { post: infer P } ? P : never,
  };
}

function event(id: string, minute: number): FeedItem {
  return {
    type: "event",
    id,
    at: at(minute),
    event: { id } as unknown as FeedItem extends { event: infer E } ? E : never,
  };
}

function ids(items: FeedItem[]): string[] {
  return items.map((i) => i.id);
}

/* Walk every page the way the client does, and report what the reader saw. */
function scroll(
  sources: { posts: FeedItem[]; events: FeedItem[] },
  opts: { limit: number; spacing?: number; window?: number }
): { items: FeedItem[]; pages: number } {
  const windowSize = opts.window ?? opts.limit;
  let cursor: FeedCursor = EMPTY_CURSOR;
  const seen: FeedItem[] = [];
  let pages = 0;

  for (let guard = 0; guard < 50; guard += 1) {
    const posts = page(sources.posts, cursor.posts, windowSize);
    const events = page(sources.events, cursor.events, windowSize);
    const result = composeFeed({
      posts,
      events,
      limit: opts.limit,
      ...(opts.spacing !== undefined ? { spacing: opts.spacing } : {}),
      morePosts: posts.length >= windowSize,
      moreEvents: events.length >= windowSize,
      cursor,
    });
    pages += 1;
    seen.push(...result.items);
    if (!result.hasMore) break;
    /* A page that returns nothing and does not move is the infinite loop this
       guards against; the walk would spin here rather than terminate. */
    cursor = result.cursor;
  }

  return { items: seen, pages };
}

/* What a keyset query would return: the cursor's instant and older, minus the
   ids that instant already gave up, newest first, capped at the window. This
   mirrors loadRealmEvents and loadFeed exactly. */
function page(
  source: FeedItem[],
  cursor: SourceCursor,
  windowSize: number
): FeedItem[] {
  const cut = cursor.at ? Date.parse(cursor.at) : Infinity;
  const inclusive = cursor.seen.length > 0;
  return source
    .filter((i) => {
      const t = Date.parse(i.at);
      return inclusive ? t <= cut : t < cut;
    })
    .filter((i) => !cursor.seen.includes(i.id))
    .slice(0, windowSize);
}

describe("composeFeed", () => {
  it("interleaves two sources by time, newest first", () => {
    const result = composeFeed({
      posts: [post("p1", 50), post("p2", 30), post("p3", 10)],
      events: [event("e1", 40), event("e2", 20)],
      limit: 10,
      spacing: 0,
    });
    expect(ids(result.items)).toEqual(["p1", "e1", "p2", "e2", "p3"]);
    expect(result.hasMore).toBe(false);
  });

  it("gives a raven the tie, because it is the richer card", () => {
    const result = composeFeed({
      posts: [post("p1", 20)],
      events: [event("e1", 20)],
      limit: 10,
      spacing: 0,
    });
    expect(ids(result.items)).toEqual(["p1", "e1"]);
  });

  it("returns an empty page and no cursor movement when both sources are dry", () => {
    const result = composeFeed({ posts: [], events: [], limit: 10 });
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toEqual(EMPTY_CURSOR);
  });

  it("carries a source's cursor forward when it contributed nothing", () => {
    const cursor = {
      posts: { at: at(9), seen: [] },
      events: { at: at(8), seen: ["e0"] },
    };
    const result = composeFeed({
      posts: [post("p1", 5)],
      events: [],
      limit: 10,
      cursor,
    });
    expect(result.cursor.posts).toEqual({ at: at(5), seen: ["p1"] });
    /* The events window was empty, so its position must not move. Advancing it
       to the posts cursor would skip every event between the two. */
    expect(result.cursor.events).toEqual({ at: at(8), seen: ["e0"] });
  });

  it("takes each source as a prefix, so a cursor never skips a row", () => {
    const posts = [post("p1", 50), post("p2", 40)];
    const events = [event("e1", 45), event("e2", 35)];
    const result = composeFeed({ posts, events, limit: 3, spacing: 0 });
    expect(ids(result.items)).toEqual(["p1", "e1", "p2"]);
    expect(result.cursor).toEqual({
      posts: { at: at(40), seen: ["p2"] },
      events: { at: at(45), seen: ["e1"] },
    });
    expect(result.hasMore).toBe(true);
  });
});

describe("composeFeed paging", () => {
  it("shows every row exactly once across pages", () => {
    const posts = Array.from({ length: 23 }, (_, n) =>
      post(`p${n}`, 200 - n * 2)
    );
    const events = Array.from({ length: 11 }, (_, n) =>
      event(`e${n}`, 199 - n * 3)
    );
    const { items } = scroll({ posts, events }, { limit: 7, spacing: 0 });
    expect(ids(items).sort()).toEqual(
      [...ids(posts), ...ids(events)].sort()
    );
    expect(new Set(ids(items)).size).toBe(34);
  });

  it("keeps the whole scroll in time order when nothing is held back", () => {
    const posts = Array.from({ length: 15 }, (_, n) => post(`p${n}`, 90 - n));
    const events = Array.from({ length: 9 }, (_, n) =>
      event(`e${n}`, 88 - n * 2)
    );
    const { items } = scroll({ posts, events }, { limit: 5, spacing: 0 });
    const times = items.map((i) => Date.parse(i.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("terminates rather than refetching a page it already returned", () => {
    const posts = Array.from({ length: 9 }, (_, n) => post(`p${n}`, 60 - n));
    const events = Array.from({ length: 9 }, (_, n) => event(`e${n}`, 59 - n));
    const { items, pages } = scroll({ posts, events }, { limit: 6 });
    expect(new Set(ids(items)).size).toBe(18);
    expect(pages).toBeLessThan(12);
  });

  it("never loses a row when the window is wider than the page", () => {
    const posts = Array.from({ length: 20 }, (_, n) => post(`p${n}`, 100 - n));
    const events = Array.from({ length: 20 }, (_, n) =>
      event(`e${n}`, 100 - n)
    );
    const { items } = scroll(
      { posts, events },
      { limit: 6, spacing: 2, window: 30 }
    );
    expect(new Set(ids(items)).size).toBe(40);
  });
});

describe("composeFeed density", () => {
  it("never places two system cards next to each other", () => {
    const posts = Array.from({ length: 30 }, (_, n) => post(`p${n}`, 300 - n));
    const events = Array.from({ length: 30 }, (_, n) =>
      event(`e${n}`, 300 - n)
    );
    const { items } = scroll({ posts, events }, { limit: 10, window: 30 });
    /* Only within the stretch where ravens were still available to separate
       them: once the ravens run out, events are allowed to flow. */
    const firstDry = items.findIndex(
      (_, n) => n > 0 && items.slice(n).every((i) => i.type === "event")
    );
    const spaced = firstDry === -1 ? items : items.slice(0, firstDry);
    for (let n = 1; n < spaced.length; n += 1) {
      if (spaced[n]!.type === "event") {
        expect(spaced[n - 1]!.type).toBe("post");
      }
    }
  });

  it("holds an event back rather than crowding, and shows it later", () => {
    const posts = [post("p1", 90), post("p2", 80), post("p3", 70)];
    const events = [event("e1", 95), event("e2", 85)];
    const first = composeFeed({ posts, events, limit: 4, spacing: 5 });
    expect(ids(first.items)).toEqual(["e1", "p1", "p2", "p3"]);
    /* e2 was declined, so the events cursor must still sit at e1. */
    expect(first.cursor.events).toEqual({ at: at(95), seen: ["e1"] });
    expect(first.hasMore).toBe(true);

    const second = composeFeed({
      posts: [],
      events: [event("e2", 85)],
      limit: 4,
      spacing: 5,
      cursor: first.cursor,
    });
    expect(ids(second.items)).toEqual(["e2"]);
  });

  it("lets events flow once there are no ravens left to space them with", () => {
    const events = Array.from({ length: 5 }, (_, n) => event(`e${n}`, 50 - n));
    const result = composeFeed({ posts: [], events, limit: 10, spacing: 5 });
    expect(ids(result.items)).toEqual(["e0", "e1", "e2", "e3", "e4"]);
  });

  it("still fills a page with ravens after declining an event", () => {
    const posts = Array.from({ length: 6 }, (_, n) => post(`p${n}`, 60 - n));
    const events = [event("e0", 61), event("e1", 59)];
    const result = composeFeed({ posts, events, limit: 5, spacing: 5 });
    expect(ids(result.items)).toEqual(["e0", "p0", "p1", "p2", "p3"]);
  });
});

describe("composeFeed timestamp ties", () => {
  it("names what it consumed at the instant it stopped on", () => {
    const posts = [post("p1", 40), post("p2", 30), post("p3", 30)];
    const result = composeFeed({ posts, events: [], limit: 2, spacing: 0 });
    /* p3 shares p2's instant. The next page re-reads that instant and skips
       p2 by name, which is the only way p3 survives the boundary. */
    expect(ids(result.items)).toEqual(["p1", "p2"]);
    expect(result.cursor.posts).toEqual({ at: at(30), seen: ["p2"] });
  });

  it("accumulates the instant's ids while a tie group spans pages", () => {
    const first = composeFeed({
      posts: [post("p1", 30), post("p2", 30)],
      events: [],
      limit: 2,
      spacing: 0,
      cursor: { posts: { at: at(30), seen: ["p0"] }, events: { at: null, seen: [] } },
    });
    /* p0 came from the previous page at the same instant, so it has to stay
       named or the page after this one would serve it again. */
    expect(first.cursor.posts).toEqual({
      at: at(30),
      seen: ["p0", "p2", "p1"],
    });
  });

  it("walks a batch stamped one instant without dropping or repeating a row", () => {
    /* An emitMany batch: every row written by one statement shares now(). */
    const events = [
      event("e1", 40),
      event("e2", 30),
      event("e3", 30),
      event("e4", 30),
      event("e5", 20),
    ];
    const { items } = scroll({ posts: [], events }, { limit: 2, spacing: 0 });
    expect(ids(items)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
  });

  it("walks a tie group that is wider than a whole page", () => {
    const posts = Array.from({ length: 7 }, (_, n) => post(`p${n}`, 30));
    const { items } = scroll({ posts, events: [] }, { limit: 2, spacing: 0 });
    expect(new Set(ids(items)).size).toBe(7);
    expect(ids(items).length).toBe(7);
  });
});

describe("feed cursor encoding", () => {
  it("round trips both positions and what each instant gave up", () => {
    const cursor = {
      posts: { at: at(30), seen: ["p7", "p8"] },
      events: { at: at(20), seen: ["e3"] },
    };
    const encoded = encodeFeedCursor(cursor);
    expect(encoded).toBeTruthy();
    expect(decodeFeedCursor(encoded)).toEqual(cursor);
  });

  it("round trips a cursor with one side unset", () => {
    const cursor = {
      posts: { at: at(30), seen: [] },
      events: { at: null, seen: [] },
    };
    expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
  });

  it("encodes an empty cursor as nothing at all", () => {
    expect(encodeFeedCursor(EMPTY_CURSOR)).toBeNull();
  });

  it("reads a bare timestamp as the old posts-only cursor", () => {
    expect(decodeFeedCursor(at(15))).toEqual({
      posts: { at: at(15), seen: [] },
      events: { at: at(15), seen: [] },
    });
  });

  it("treats a malformed cursor as the start of the timeline", () => {
    expect(decodeFeedCursor("not-a-time")).toEqual(EMPTY_CURSOR);
    expect(decodeFeedCursor("nonsense|rubbish")).toEqual(EMPTY_CURSOR);
    expect(decodeFeedCursor(undefined)).toEqual(EMPTY_CURSOR);
  });
});
