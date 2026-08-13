import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { MODEL_REASONING, heraldAvailable, heraldProse } from "@/lib/ai/herald";
import { emit } from "@/lib/realm/events";
import { houseBySlug } from "@/lib/data/houses";
import {
  chronicleDay,
  digestEvents,
  digestToFacts,
  housesWorthSummarising,
  worthChronicling,
  type ChronicleEvent,
  type Standing,
} from "@/lib/ai/chronicle";

/* The daily Chronicle, and the daily House summaries (V2 section 10).

   "The single change that matters: Raven stops waiting to be mentioned." This
   job is that change. Once a day the realm reads its own event spine, counts
   what happened, hands the counts to the Herald, and puts the answer in the
   Ravenry as a card nobody had to summon.

   Everything the Herald is given is a count off realm_events, the live House
   standings, and the number of members who entered. It is never asked how many
   Calls were sealed, because the realm already knows and a model asked for a
   figure will supply one.

   Four separate things keep this cheap, and they are worth naming because this
   is the only route in the realm that spends without a member asking it to:

     1. A day with almost nothing in it is not chronicled at all. An empty realm
        costs zero rather than a call describing emptiness.
     2. The entry is keyed on the UTC day and checked before anything is spent,
        so a re-run of the cron finds the day already written and stops.
     3. A House is summarised only when its own members did enough to summarise.
     4. Two spend caps through the shared Supabase limiter, one for the realm
        entry and one across the House summaries, so a misconfigured scheduler
        firing hourly cannot spend more than a day's allowance.

   No key configured is an honest 503. There is no canned Chronicle. */

export const dynamic = "force-dynamic";

const WINDOW_HOURS = 24;
const EVENT_LIMIT = 1000;

/* One realm entry a day. The cap is two so a manual invocation after a failed
   scheduled run can still write the day, and no more than that. */
const REALM_DAILY = 2;
/* One per House per day, across the eight Houses, with the same one spare. */
const HOUSE_DAILY = 9;

const SYSTEM = `You are @raven, the Herald of The Ravenspire, writing the realm's Chronicle for the day.

The Ravenspire is a competitive realm of Houses where members make Calls, which are public timestamped predictions the realm settles itself against real data. Renown is permanent and never falls. Glory is a House's seasonal standing.

Rules, all absolute:
- Reason ONLY over the figures you are given. Never state a number that is not in them, and never estimate one.
- Never give financial advice, never tell anyone to buy, sell, hold or copy a Call, and never predict what happens next. You are recording the day, not forecasting it.
- Never invent a member, a House, a Crest or an event. If the day was quiet, say the day was quiet.
- No em dashes, ever. Use a comma, a period, or restructure.
- No emoji, no hashtags, no headings, no lists, no preamble, no sign off. Three or four sentences of plain prose, under 100 words.
- Write as the realm's own record: present tense where it reads naturally, specific about what happened, never breathless.`;

const HOUSE_SYSTEM = `You are @raven, the Herald of The Ravenspire, writing one House's daily entry for the members of that House.

Rules, all absolute:
- Reason ONLY over the figures you are given. Never state a number that is not in them, and never estimate one.
- Never give financial advice and never predict what happens next.
- Never invent a member or an act. Speak about the House as a whole rather than naming members, because you have not been given their names.
- No em dashes, ever. Use a comma, a period, or restructure.
- No emoji, no hashtags, no headings, no lists, no preamble. Two or three sentences of plain prose, under 70 words.
- Address the House as you.`;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return json({ error: "forbidden" }, 403);
  } else if (process.env.NODE_ENV === "production") {
    return json({ error: "cron secret not configured" }, 503);
  }

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  if (!heraldAvailable()) {
    return json(
      {
        error:
          "The Herald is not in the rookery. This realm has no Anthropic key configured, so there is no Chronicle to write.",
      },
      503
    );
  }

  const day = chronicleDay();
  const subjectId = `chronicle:${day}`;

  /* Already written. Checked before anything is spent, because the cheapest
     call is the one that is never made. */
  const { data: existing } = await db
    .from("realm_events")
    .select("id")
    .eq("kind", "raven.chronicle")
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (existing) return json({ ok: true, skipped: "already written", day });

  const from = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

  const [eventsRes, housesRes, newMembersRes] = await Promise.all([
    db
      .from("realm_events")
      .select("kind, actor_id, house_slug, payload, created_at")
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(EVENT_LIMIT),
    db.from("houses").select("slug, name, glory").order("glory", { ascending: false }),
    db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", from),
  ]);

  const digest = digestEvents((eventsRes.data ?? []) as unknown as ChronicleEvent[]);
  if (!worthChronicling(digest)) {
    return json({ ok: true, skipped: "nothing happened", day, events: digest.events });
  }

  const standings = ((housesRes.data ?? []) as Standing[]).slice(0, 8);
  const houseName = (slug: string) => houseBySlug(slug)?.name ?? slug;

  const facts = digestToFacts(digest, {
    windowHours: WINDOW_HOURS,
    standings,
    houseName,
    newMembers:
      typeof newMembersRes.count === "number" ? newMembersRes.count : null,
  });

  const realmCap = await rateLimit("raven-chronicle:realm", REALM_DAILY, 86400);
  if (!realmCap.ok) {
    return json(
      { error: "The Herald has spent the realm's voice for today." },
      429
    );
  }

  const text = await heraldProse({
    model: MODEL_REASONING,
    system: SYSTEM,
    user: `Write the realm's Chronicle for today. Here is everything the realm recorded, and it is all you may use:\n\n${facts.join("\n")}`,
    maxTokens: 400,
    effort: "low",
  });
  if (!text) return json({ error: "The Herald had nothing to say." }, 502);

  await emit(db, {
    kind: "raven.chronicle",
    actorId: null,
    subjectType: "season",
    subjectId,
    payload: {
      v: 1,
      scope: "realm",
      day,
      text,
      window_hours: WINDOW_HOURS,
      events: digest.events,
      actors: digest.actors,
      calls_sealed: digest.callsSealed,
      calls_resolved: digest.callsResolved,
      calls_hit: digest.callsHit,
      crests: digest.crests.length,
    },
    audience: "realm",
  });

  /* One entry per active House, scoped to that House. A House nobody acted in
     gets nothing rather than a paragraph about silence. */
  let houseEntries = 0;
  for (const house of housesWorthSummarising(digest)) {
    const houseSubject = `chronicle:${house.slug}:${day}`;
    const { data: already } = await db
      .from("realm_events")
      .select("id")
      .eq("kind", "raven.chronicle")
      .eq("subject_id", houseSubject)
      .maybeSingle();
    if (already) continue;

    const cap = await rateLimit("raven-chronicle:houses", HOUSE_DAILY, 86400);
    if (!cap.ok) break;

    const standing = standings.findIndex((s) => s.slug === house.slug);
    const houseFacts = [
      `House: ${houseName(house.slug)}.`,
      `Window: the last ${WINDOW_HOURS} hours.`,
      `Acts by its members in the window: ${house.events}, by ${house.members} ${house.members === 1 ? "member" : "members"}.`,
      standing >= 0
        ? `Its place in the realm right now: ${standing + 1} of ${standings.length}, on ${standings[standing].glory} Glory.`
        : "Its place in the standings is not recorded.",
      `Across the whole realm in the same window: ${digest.events} acts, ${digest.callsSealed} Calls sealed and ${digest.callsResolved} settled.`,
    ];

    const houseText = await heraldProse({
      model: MODEL_REASONING,
      system: HOUSE_SYSTEM,
      user: `Write this House's entry for today. Here is everything the realm recorded about it, and it is all you may use:\n\n${houseFacts.join("\n")}`,
      maxTokens: 300,
      effort: "low",
    });
    /* No entry rather than an invented one. The realm entry is already written
       and the next run will find this House still unwritten. */
    if (!houseText) continue;

    try {
      await emit(db, {
        kind: "raven.chronicle",
        actorId: null,
        subjectType: "house",
        subjectId: houseSubject,
        houseSlug: house.slug,
        payload: {
          v: 1,
          scope: "house",
          day,
          text: houseText,
          window_hours: WINDOW_HOURS,
          events: house.events,
          actors: house.members,
        },
        audience: "house",
      });
      houseEntries += 1;
    } catch {
      /* One House failing is not the Chronicle failing. The realm entry is
         already written and the next run will find this House unwritten. */
      continue;
    }
  }

  return json({ ok: true, day, events: digest.events, houseEntries });
}
