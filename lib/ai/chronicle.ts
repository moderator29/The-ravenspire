/* The Chronicle digest (V2 section 10, the row reading "Daily and weekly
   Chronicle: one or two calls a day total. Build first. The whole living realm
   feeling for pennies").

   The single change that matters in section 10 is that the Herald stops waiting
   to be mentioned. A Chronicle is how: once a day the realm reads its own event
   spine and says what happened, and the Ravenry has a voice in it that nobody
   had to summon.

   This file is the half that costs nothing. It takes real rows off
   realm_events and reduces them to counts, and the counts are what the Herald
   is handed. The model is never asked how many Calls were sealed, because the
   realm already knows and a model asked for a figure will supply one.

   Pure and dependency free on purpose, so the reduction can be tested without a
   database and without a key. */

export interface ChronicleEvent {
  kind: string;
  actor_id: string | null;
  house_slug: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface NotableCall {
  token: string | null;
  stance: string | null;
  timeframe: string | null;
  score: number;
  verdict: string;
}

export interface HouseActivity {
  slug: string;
  events: number;
  members: number;
}

export interface ChronicleDigest {
  /* Every event in the window, however it was scoped. */
  events: number;
  /* Distinct members who caused one. The realm's real pulse. */
  actors: number;
  byKind: Record<string, number>;
  callsSealed: number;
  callsResolved: number;
  callsHit: number;
  /* The highest scoring resolved Call in the window, which is the single most
     newsworthy thing the spine can carry. Null when nothing resolved with a
     score on it. */
  bestCall: NotableCall | null;
  crests: string[];
  houses: HouseActivity[];
}

function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/* Reduce a window of real events to the counts the Chronicle is written from. */
export function digestEvents(events: ChronicleEvent[]): ChronicleDigest {
  const byKind: Record<string, number> = {};
  const actors = new Set<string>();
  const houseEvents = new Map<string, { events: number; members: Set<string> }>();
  const crests: string[] = [];

  let callsSealed = 0;
  let callsResolved = 0;
  let callsHit = 0;
  let bestCall: NotableCall | null = null;

  for (const event of events) {
    byKind[event.kind] = (byKind[event.kind] ?? 0) + 1;
    if (event.actor_id) actors.add(event.actor_id);

    if (event.house_slug) {
      const entry = houseEvents.get(event.house_slug) ?? {
        events: 0,
        members: new Set<string>(),
      };
      entry.events += 1;
      if (event.actor_id) entry.members.add(event.actor_id);
      houseEvents.set(event.house_slug, entry);
    }

    const payload = event.payload ?? {};

    if (event.kind === "call.sealed") callsSealed += 1;

    if (event.kind === "call.resolved") {
      callsResolved += 1;
      const verdict = text(payload, "verdict");
      if (verdict === "hit") callsHit += 1;
      const score = num(payload, "score");
      if (score !== null && (bestCall === null || score > bestCall.score)) {
        bestCall = {
          token: text(payload, "token"),
          stance: text(payload, "stance"),
          timeframe: text(payload, "timeframe"),
          score,
          verdict: verdict ?? "unknown",
        };
      }
    }

    if (event.kind === "crest.earned") {
      const title = text(payload, "title") ?? text(payload, "crest_slug");
      if (title) crests.push(title);
    }
  }

  const houses: HouseActivity[] = [...houseEvents.entries()]
    .map(([slug, entry]) => ({
      slug,
      events: entry.events,
      members: entry.members.size,
    }))
    .sort((a, b) => b.events - a.events || a.slug.localeCompare(b.slug));

  return {
    events: events.length,
    actors: actors.size,
    byKind,
    callsSealed,
    callsResolved,
    callsHit,
    bestCall,
    crests,
    houses,
  };
}

export interface Standing {
  slug: string;
  name: string;
  glory: number;
}

/* The digest as the lines the Herald is handed.

   Every line is a count or a name taken from a real row. Nothing is phrased as
   an interpretation, because interpretation is the only thing the model is
   there to add. */
export function digestToFacts(
  digest: ChronicleDigest,
  opts: {
    windowHours: number;
    standings: Standing[];
    houseName: (slug: string) => string;
    newMembers?: number | null;
  }
): string[] {
  const facts: string[] = [];
  facts.push(`Window: the last ${opts.windowHours} hours.`);
  facts.push(
    `Recorded acts across the realm: ${digest.events}, by ${digest.actors} ${digest.actors === 1 ? "member" : "members"}.`
  );

  if (typeof opts.newMembers === "number") {
    facts.push(`Members who entered the realm in the window: ${opts.newMembers}.`);
  }

  facts.push(`Calls sealed: ${digest.callsSealed}.`);
  facts.push(
    digest.callsResolved > 0
      ? `Calls settled: ${digest.callsResolved}, of which ${digest.callsHit} landed.`
      : "No Call settled in the window."
  );

  if (digest.bestCall) {
    const call = digest.bestCall;
    const subject = call.token ? `$${call.token}` : "a claim about the realm";
    facts.push(
      `The highest scoring settled Call: ${subject}${call.stance ? ` ${call.stance === "down" ? "falling" : "rising"}` : ""}${call.timeframe ? ` over ${call.timeframe}` : ""}, verdict ${call.verdict}, score ${call.score}.`
    );
  }

  if (digest.crests.length > 0) {
    facts.push(
      `Crests earned: ${digest.crests.length}. They were: ${digest.crests.slice(0, 6).join(", ")}.`
    );
  }

  for (const [kind, count] of Object.entries(digest.byKind)) {
    if (kind === "call.sealed" || kind === "call.resolved" || kind === "crest.earned") {
      continue;
    }
    facts.push(`Events of kind ${kind}: ${count}.`);
  }

  if (digest.houses.length > 0) {
    facts.push(
      `Houses by acts in the window: ${digest.houses
        .map((h) => `${opts.houseName(h.slug)} ${h.events}`)
        .join(", ")}.`
    );
  }

  if (opts.standings.length > 0) {
    facts.push(
      `Standings right now, by Glory: ${opts.standings
        .map((s, i) => `${i + 1}. ${s.name} ${s.glory}`)
        .join(", ")}.`
    );
  }

  return facts;
}

/* Is there enough here to be worth a Chronicle at all.

   A realm where nothing happened does not get a paid entry describing nothing
   happening. This is a spend decision as much as an editorial one: an empty day
   costs zero rather than a call plus a card saying the day was empty. */
export const MIN_EVENTS_FOR_CHRONICLE = 3;

export function worthChronicling(digest: ChronicleDigest): boolean {
  return digest.events >= MIN_EVENTS_FOR_CHRONICLE;
}

/* A House gets its own summary only when its own members did enough to
   summarise. One call per House per day is the approved shape, and a quiet
   House costs nothing rather than a call producing a paragraph about silence. */
export const MIN_EVENTS_FOR_HOUSE = 4;

export function housesWorthSummarising(digest: ChronicleDigest): HouseActivity[] {
  return digest.houses.filter((h) => h.events >= MIN_EVENTS_FOR_HOUSE);
}

/* The realm's own day, in UTC, which is the key a Chronicle is unique on. Two
   runs of the job on the same day must produce one entry, not two, and the
   spend cap is not the guard for that: an entry that already exists costs
   nothing to detect. */
export function chronicleDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}
