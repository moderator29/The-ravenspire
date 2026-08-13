/* The Herald's digest: deciding what happened, and whether it is worth saying.
 *
 * The Chronicle tells the whole realm what the realm did. This is the other
 * half of the same idea and the harder one: what happened *to you* since the
 * last time the Herald spoke to you, in one paragraph, so that opening the
 * Ravenry answers a question rather than presenting a list.
 *
 * THE DISCIPLINE THIS FILE EXISTS FOR
 * Every line assembled here is a count, a name or a timestamp taken off a real
 * row. The model is handed those lines and asked to write two sentences. It is
 * never asked how many Calls landed, what a member's rank is, or how much a
 * House gained, because the realm already knows all three and a model asked for
 * a figure will supply one. Nothing downstream of this file reads model output
 * back into a table, so no reward, rank or price can depend on what it says
 * (house rule 8).
 *
 * AND THE HARDER HALF OF IT
 * A realm where nothing happened produces no digest. Not a paragraph observing
 * that it was quiet, not a greeting, nothing at all: worthTelling below is the
 * floor, it is checked before a single token is spent, and it is deliberately
 * strict about the difference between a fact that is always true (your House is
 * fourth, the season ends in nine days) and something that actually happened
 * inside the window. Standing facts are context for the sentence. They are
 * never a reason to write one.
 *
 * Pure and dependency free, so the whole decision can be tested without a
 * database and without a key. */

/* How long a digest stays fresh. Inside this, the Ravenry serves the stored
   paragraph and spends nothing, so refreshing the feed is free and a member who
   reads the realm four times a day costs four calls at most. */
export const DIGEST_TTL_MS = 6 * 60 * 60 * 1000;

/* The window a member with no previous digest gets. A day is what "since you
   were last here" means for someone the Herald has never spoken to. */
export const DIGEST_FIRST_WINDOW_MS = 24 * 60 * 60 * 1000;

/* And the ceiling on any window. A member returning after a month does not want
   a month narrated, and a month of rows is a fact sheet nobody can read and a
   bill nobody wants. Past this the digest is about the last week. */
export const DIGEST_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/* A Call inside this of its deadline is news. Further out it is a standing
   fact, and repeating "your Call settles in six days" every six hours is how a
   retention surface becomes a nag. */
export const CALL_DUE_SOON_MS = 24 * 60 * 60 * 1000;

/* How much has to have happened in a realm a member has no personal stake in
   before it is worth a paragraph. One event is not a day; three is a realm
   doing something. */
export const MIN_REALM_SIGNALS = 3;

/* The spend caps, in the same file as the TTL they are sized against rather
   than in the route, so the relationship between them is visible in one place
   and can be asserted.
 *
 * The per member cap is the backstop behind the TTL, not the thing that paces a
 * member: reading the realm at every TTL boundary all day long has to stay
 * inside it, or the cap would be silently truncating an honest member's digests
 * rather than catching a loop. Four windows fit in a day, and six is that with
 * headroom for a clock that drifts and a member who reads at the boundary.
 *
 * The realm cap is the budget line. It is what stops a bad day, a bug or a
 * crawler becoming a bad bill, and it is deliberately far above what the realm
 * can legitimately reach at its current size. */
export const DIGEST_PER_MEMBER_DAILY = 6;
export const DIGEST_REALM_DAILY = 2000;
export const DIGEST_RATE_WINDOW_SECONDS = 86400;

/* At most this many named acts by members they follow. A digest is one
   paragraph, and a fact sheet longer than the paragraph teaches the model to
   write a list. */
const MAX_NAMED = 3;

export interface StoredDigest {
  /* Null when the last window held nothing worth telling. */
  text: string | null;
  windowStart: string;
  generatedAt: string;
  dismissedAt: string | null;
}

export interface DigestWindow {
  /* True when the stored digest is still inside its TTL, which is the whole
     cache decision: fresh means serve the row and spend nothing. */
  fresh: boolean;
  /* Where the next digest's window opens. */
  start: string;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/* The cache decision and the window, together, because they are the same
   question asked from two sides: what has this member already been told, and
   what have they therefore not been told yet.
 *
 * A window opens where the last digest ended, so no hour is narrated twice. The
 * exception is a stored digest with no text: nothing was said about that
 * window, so it is carried forward rather than skipped, and a realm producing
 * one act a day accumulates into a digest instead of losing each quiet window
 * one at a time. */
export function digestWindow(
  stored: StoredDigest | null,
  now: Date
): DigestWindow {
  const at = now.getTime();
  const floor = at - DIGEST_MAX_WINDOW_MS;

  if (!stored) {
    return { fresh: false, start: iso(Math.max(floor, at - DIGEST_FIRST_WINDOW_MS)) };
  }

  const generated = Date.parse(stored.generatedAt);
  const fresh = Number.isFinite(generated) && at - generated < DIGEST_TTL_MS;

  const previous = stored.text ? generated : Date.parse(stored.windowStart);
  const start = Number.isFinite(previous)
    ? Math.max(floor, previous)
    : Math.max(floor, at - DIGEST_FIRST_WINDOW_MS);

  /* A stored time in the future is a clock that disagreed with itself, and a
     window that ends before it starts is rejected by the table and meaningless
     to every reader. Clamp rather than throw: the worst case is a digest about
     an instant, which is empty, which is already a case this handles. */
  return { fresh, start: iso(Math.min(at, start)) };
}

export interface DigestViewer {
  id: string;
  followingIds: readonly string[];
  houseSlug: string | null;
}

/* One row off the realm event spine, already audience filtered by the caller,
   with its actor's name resolved. The Herald is never handed an event this
   member could not have seen in their own feed. */
export interface DigestEvent {
  kind: string;
  actorId: string | null;
  houseSlug: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  actorName: string | null;
}

export interface SettledCall {
  /* The subject in one word: a ticker, a House, whatever the claim was about.
     Null on a row that predates pinned subjects. */
  subject: string | null;
  verdict: "hit" | "miss";
  score: number | null;
}

export interface OpenCall {
  subject: string | null;
  /* When the claim runs out. Null when the row carries no readable timeframe,
     in which case it is counted but never described as due. */
  dueAt: string | null;
}

export interface DigestHouse {
  name: string;
  rank: number;
  of: number;
  glory: number;
  rival: { name: string; gap: number; ahead: boolean } | null;
}

export interface DigestInput {
  now: Date;
  windowStart: string;
  viewer: DigestViewer;
  events: readonly DigestEvent[];
  settledCalls: readonly SettledCall[];
  openCalls: readonly OpenCall[];
  /* What settled in their Ledger inside the window. Points and Glory, never a
     token amount (house rule 7). */
  ledger: { points: number; glory: number; entries: number };
  house: DigestHouse | null;
  followedRavens: { posts: number; authors: number };
  season: { name: string; endsAt: string } | null;
}

export interface DigestFacts {
  /* The fact sheet, one line each, exactly as the model receives it. */
  lines: string[];
  /* Things that happened inside the window and touch this member: their Calls,
     their Ledger, their House, the members they follow. */
  personal: number;
  /* Everything that happened inside the window, personal or not. Standing
     facts are counted in neither. */
  signals: number;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function hoursBetween(from: string, to: Date): number {
  const start = Date.parse(from);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.round((to.getTime() - start) / 3600000));
}

function windowLabel(from: string, to: Date): string {
  const hours = hoursBetween(from, to);
  if (hours < 48) return `the last ${plural(Math.max(1, hours), "hour", "hours")}`;
  return `the last ${plural(Math.round(hours / 24), "day", "days")}`;
}

/* A kind, as a person would say it. An unmapped kind falls back to its own
   name rather than being dropped: an honest ugly noun beats a silent gap. */
const KIND_WORDS: Record<string, string> = {
  "call.resolved": "settled a Call",
  "crest.earned": "earned a Crest",
  "house.overtake": "overtook a rival House",
  "duel.opened": "opened a duel",
  "quest.completed": "completed a quest",
  "oath.sworn": "swore an oath to a House",
  "discussion.trending": "started a discussion the realm is reading",
  "standings.snapshot": "standings were recorded",
  "season.milestone": "the season turned",
  "raven.chronicle": "the Chronicle was written",
};

function kindWords(kind: string): string {
  return KIND_WORDS[kind] ?? kind;
}

function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/* Everything the realm counted, as the lines the Herald is handed.
 *
 * Reading order is deliberate and it is the ranking: their own Calls, then
 * their Ledger, then their House, then the members they follow, then the realm.
 * The model is told to lead with the most important thing, and the sheet is
 * already in that order, so "most important" is a decision the server made. */
export function assembleFacts(input: DigestInput): DigestFacts {
  const lines: string[] = [];
  let personal = 0;
  let signals = 0;

  lines.push(`Window: ${windowLabel(input.windowStart, input.now)}.`);

  /* 1. Their own Calls, settled. The single most personal thing the realm can
        say to a member, and the only one that is a verdict on them. */
  if (input.settledCalls.length > 0) {
    const hits = input.settledCalls.filter((c) => c.verdict === "hit");
    lines.push(
      `Your Calls settled in the window: ${input.settledCalls.length}, of which ${hits.length} landed.`
    );
    const best = [...input.settledCalls]
      .filter((c) => typeof c.score === "number")
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    if (best) {
      lines.push(
        `Your highest scoring settled Call: ${best.subject ? best.subject : "an unnamed claim"}, verdict ${best.verdict}, score ${best.score}.`
      );
    }
    personal += 1;
    signals += 1;
  }

  /* 2. Calls still running. A promise already made is the strongest reason to
        come back, but only once it is close enough to be news. */
  const due = input.openCalls
    .filter((c) => c.dueAt !== null)
    .map((c) => ({ ...c, at: Date.parse(c.dueAt as string) }))
    .filter((c) => Number.isFinite(c.at) && c.at > input.now.getTime())
    .filter((c) => c.at - input.now.getTime() <= CALL_DUE_SOON_MS)
    .sort((a, b) => a.at - b.at);
  if (input.openCalls.length > 0) {
    lines.push(`Your Calls still open: ${input.openCalls.length}.`);
  }
  if (due.length > 0) {
    const hours = Math.max(
      1,
      Math.round((due[0]!.at - input.now.getTime()) / 3600000)
    );
    lines.push(
      `Of those, ${due.length} ${due.length === 1 ? "settles" : "settle"} within a day, the nearest ${due[0]!.subject ? `on ${due[0]!.subject} ` : ""}in about ${plural(hours, "hour", "hours")}.`
    );
    personal += 1;
    signals += 1;
  }

  /* 3. The Ledger. Server settled against verified events, which is why it can
        be stated as a figure at all. */
  if (input.ledger.entries > 0 && (input.ledger.points !== 0 || input.ledger.glory !== 0)) {
    const parts: string[] = [];
    if (input.ledger.points !== 0) parts.push(`${input.ledger.points} Points`);
    if (input.ledger.glory !== 0) parts.push(`${input.ledger.glory} Glory`);
    lines.push(
      `Settled to you in the window: ${parts.join(" and ")}, across ${plural(input.ledger.entries, "entry", "entries")}.`
    );
    personal += 1;
    signals += 1;
  }

  /* 4. Their House. The standing itself is context and is never a reason to
        write; what its members did inside the window is. */
  const mine = input.viewer.houseSlug;
  const houseEvents = mine
    ? input.events.filter(
        (e) => e.houseSlug === mine && e.actorId !== input.viewer.id
      )
    : [];
  if (input.house) {
    /* Every House's name already begins with the word House, so this reads
       "Your House: House Corvane" rather than "your House House Corvane". */
    lines.push(
      `Your House: ${input.house.name}, ${input.house.rank} of ${input.house.of} on ${input.house.glory} Glory.`
    );
    if (input.house.rival) {
      const r = input.house.rival;
      lines.push(
        `Nearest rival: ${r.name}, ${r.gap} Glory ${r.ahead ? "ahead of you" : "behind you"}.`
      );
    }
  }
  if (houseEvents.length > 0) {
    lines.push(
      `Acts under your own banner in the window: ${plural(houseEvents.length, "act", "acts")}.`
    );
    personal += 1;
    signals += 1;
  }

  /* 5. Their own acts. Recorded because a member's own Crest or quest is the
        thing they most want acknowledged, and the spine already carries it. */
  const ownEvents = input.events.filter((e) => e.actorId === input.viewer.id);
  for (const event of ownEvents.slice(0, MAX_NAMED)) {
    const title = text(event.payload, "title");
    lines.push(`You ${kindWords(event.kind)}${title ? `: ${title}` : ""}.`);
  }
  if (ownEvents.length > 0) {
    personal += 1;
    signals += 1;
  }

  /* 6. The members they follow. Named, because "someone you follow" is a
        weaker sentence than a name, and the name is already loaded. */
  const following = new Set(input.viewer.followingIds);
  const followed = input.events.filter(
    (e) => e.actorId !== null && e.actorId !== input.viewer.id && following.has(e.actorId)
  );
  for (const event of followed.slice(0, MAX_NAMED)) {
    if (!event.actorName) continue;
    const title = text(event.payload, "title");
    lines.push(
      `${event.actorName}, whom you follow, ${kindWords(event.kind)}${title ? `: ${title}` : ""}.`
    );
  }
  if (input.followedRavens.posts > 0) {
    lines.push(
      `Ravens from members you follow: ${input.followedRavens.posts}, by ${plural(input.followedRavens.authors, "member", "members")}.`
    );
  }
  if (followed.length > 0 || input.followedRavens.posts > 0) {
    personal += 1;
    signals += 1;
  }

  /* 7. The realm. Whatever is left, as counts by kind. */
  const rest = input.events.filter(
    (e) =>
      e.actorId !== input.viewer.id &&
      !(e.actorId !== null && following.has(e.actorId)) &&
      !(mine !== null && e.houseSlug === mine)
  );
  if (rest.length > 0) {
    const byKind = new Map<string, number>();
    for (const event of rest) {
      byKind.set(event.kind, (byKind.get(event.kind) ?? 0) + 1);
    }
    lines.push(
      `Elsewhere in the realm: ${[...byKind.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([kind, count]) => `${count} ${kindWords(kind)}`)
        .join(", ")}.`
    );
    signals += 1;
  }

  /* 8. The season. A clock, and standing context like the House rank: never on
        its own a reason to write. */
  if (input.season) {
    const days = Math.ceil(
      (Date.parse(input.season.endsAt) - input.now.getTime()) / 86400000
    );
    if (Number.isFinite(days) && days > 0) {
      lines.push(
        `The season ${input.season.name} ends in ${plural(days, "day", "days")}.`
      );
    }
  }

  return { lines, personal, signals };
}

/* Is there anything here worth a paragraph.
 *
 * Checked before anything is spent, because the cheapest call is the one that
 * is never made, and because a digest that has to reach for something to say is
 * the exact failure this surface was built to avoid. One thing that happened to
 * this member is enough. Absent that, the realm has to have been genuinely busy
 * before a member with no stake in it is told about it. */
export function worthTelling(facts: DigestFacts): boolean {
  if (facts.personal > 0) return true;
  return facts.signals >= MIN_REALM_SIGNALS;
}

/* When a Call sealed at `createdAt` over `timeframe` runs out.
 *
 * The deadline is not stored: a Call carries the window it was made over, and
 * settlement derives the rest. Null for a timeframe this realm does not use, so
 * an unreadable row is counted as open and never described as due. */
export function callDueAt(
  createdAt: string,
  timeframe: string | null | undefined
): string | null {
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start)) return null;
  const hours =
    timeframe === "24h" ? 24 : timeframe === "7d" ? 168 : timeframe === "30d" ? 720 : null;
  if (hours === null) return null;
  return new Date(start + hours * 3600000).toISOString();
}
