import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/flags";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { DEADLINE_MODEL, withDeadline } from "@/lib/deadline";
import { MODEL_BRIEF, heraldAvailable, heraldProse } from "@/lib/ai/herald";
import { canView, resolveViewer } from "@/lib/social/feed-server";
import {
  FEED_EVENT_KINDS,
  loadEventActors,
  loadRealmEvents,
} from "@/lib/realm/feed-events";
import { gloryStanding } from "@/lib/houses/view";
import { normalizeCall, type CallData } from "@/lib/calls/types";
import {
  DIGEST_PER_MEMBER_DAILY,
  DIGEST_RATE_WINDOW_SECONDS,
  DIGEST_REALM_DAILY,
  assembleFacts,
  callDueAt,
  digestWindow,
  worthTelling,
  type DigestEvent,
  type OpenCall,
  type SettledCall,
  type StoredDigest,
} from "@/lib/raven/digest";

/* GET /api/raven/digest, and DELETE to dismiss it.
 *
 * The Herald, unprompted. Everywhere else in the realm it answers when spoken
 * to; here it reads what actually happened since it last spoke to this member
 * and says the one thing worth knowing. That is the whole difference between an
 * assistant and a reason to come back.
 *
 * WHAT THE MODEL IS AND IS NOT DOING
 * The server counts. lib/raven/digest.ts turns real rows into a short fact
 * sheet, in the order that decides what matters, and the model is asked for two
 * sentences over it. It is never asked for a figure, and nothing it writes is
 * read back into a table, so no Point, Glory, rank or price can depend on it
 * (house rules 5 and 8).
 *
 * WHAT IT COSTS
 * Four things hold the bill down, and they are worth naming because this route
 * is reached from the most requested page in the product:
 *
 *   1. A stored digest inside its TTL is returned without a model call. A
 *      member refreshing the Ravenry twenty times costs one call.
 *   2. A window with nothing worth telling in it never reaches the model at
 *      all, and the empty answer is stored so the next refresh is free too.
 *   3. The smaller model, because the reasoning was already done in SQL.
 *   4. Two rate limits, one per member and one across the realm, checked in the
 *      last moment before the call and never consumed by a cache hit.
 *
 * HOW IT FAILS
 * Every failure renders as the Herald having had nothing to say: no key, no
 * flag, no database, a refusal, a timeout, a rate limit. All of them return
 * a null digest with a 200, because to a member they are the same thing, and
 * because a canned sentence dressed as the Herald is worse than silence.
 * A failure writes no row, so the next request tries again. */

export const dynamic = "force-dynamic";

/* Bounds on every read, so one member with a long history cannot turn a feed
   load into a table scan. Each is far past what a window this size can hold. */
const EVENT_LIMIT = 120;
const CALL_LIMIT = 200;
const LEDGER_LIMIT = 500;
const FOLLOWED_LIMIT = 200;

const SYSTEM = `You are @raven, the Herald of The Ravenspire, writing one member a short private note about what happened in the realm since you last wrote to them.

The Ravenspire is a competitive realm of Houses where members make Calls, which are public timestamped predictions the realm settles itself against real data. Renown is permanent and never falls. Glory is a House's seasonal standing. Points are earned balances.

Rules, all absolute:
- Reason ONLY over the figures you are given. Never state a number that is not in them, and never estimate one.
- Say the single most important thing first, and stop. You are not summarising the list; you are telling them the one thing they would want to know. The list is already in order of importance, so what matters is usually near the top of it.
- Never give financial advice, never tell anyone to buy, sell, hold or copy a Call, and never predict what happens next.
- Never invent a member, a House, a Crest, a Call or an event.
- No em dashes, ever. Use a comma, a period, or restructure.
- No emoji, no hashtags, no headings, no lists, no greeting, no sign off, no questions.
- One or two sentences of plain prose, under 45 words.
- Address the member as you. Be specific and level. Never breathless, never congratulatory beyond what the figures support.`;

interface StoredRow {
  text: string | null;
  window_start: string;
  generated_at: string;
  dismissed_at: string | null;
}

function stored(row: StoredRow | null): StoredDigest | null {
  if (!row) return null;
  return {
    text: row.text,
    windowStart: row.window_start,
    generatedAt: row.generated_at,
    dismissedAt: row.dismissed_at,
  };
}

/* What a stored digest looks like on the wire. A dismissed digest is nothing:
   the member has already said they are done with it. */
function payload(digest: StoredDigest | null) {
  if (!digest || !digest.text || digest.dismissedAt) return { digest: null };
  return {
    digest: { text: digest.text, at: digest.generatedAt },
  };
}

/* The Call's subject in one word. A ticker is the strongest one there is; a
   claim about the realm itself has no ticker, and null reads as "an unnamed
   claim" rather than being invented. */
function callSubject(call: CallData): string | null {
  if (call.token && call.token.trim() !== "") return `$${call.token.toUpperCase()}`;
  if (call.claim && "house_slug" in call.claim) return call.claim.house_slug;
  return null;
}

export async function GET(req: Request) {
  const db = adminClient();
  if (!db) return json({ digest: null });

  /* getProfile, not requireProfile: opening the Ravenry must never create a
     profile row, and a bad token reads as a visitor, who has no digest. */
  const profile = await getProfile(req);
  if (!profile) return json({ digest: null });

  /* Sealed until it is real. Checked before any read, so a sealed realm pays
     nothing for a surface nobody can see. */
  if (!(await getFlag("herald_digest_live"))) return json({ digest: null });

  const { data: row } = await db
    .from("raven_digests")
    .select("text, window_start, generated_at, dismissed_at")
    .eq("profile_id", profile.id)
    .maybeSingle();
  const previous = stored((row as StoredRow | null) ?? null);

  const now = new Date();
  const window = digestWindow(previous, now);
  if (window.fresh) return json(payload(previous));

  /* No key configured is the same answer as a quiet realm, and it is checked
     here so an unconfigured deployment does not run five queries per feed load
     to reach a conclusion it already knows. */
  if (!heraldAvailable()) return json(payload(previous));

  const viewer = await resolveViewer(db, profile);
  const since = window.start;

  const [eventRows, callRows, ledgerRows, houseRows, seasonRow, followedRows] =
    await Promise.all([
      /* The spine, with this member's own audience applied. The Herald is
         never handed an event they could not have seen in their own feed. */
      loadRealmEvents(db, viewer, {
        since,
        kinds: FEED_EVENT_KINDS,
        limit: EVENT_LIMIT,
      }),
      db
        .from("posts")
        .select("call, created_at")
        .eq("author_id", profile.id)
        .eq("kind", "call")
        .eq("deleted", false)
        .order("created_at", { ascending: false })
        .limit(CALL_LIMIT),
      db
        .from("points_ledger")
        .select("points_delta, glory_delta")
        .eq("profile_id", profile.id)
        .gte("created_at", since)
        .limit(LEDGER_LIMIT),
      db
        .from("houses")
        .select("slug, name, glory")
        .order("glory", { ascending: false }),
      db
        .from("seasons")
        .select("name, ends_at")
        .eq("status", "active")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      viewer.followingIds.length > 0
        ? db
            .from("posts")
            .select("author_id, visibility, house_slug, mentions")
            .in("author_id", viewer.followingIds)
            .eq("deleted", false)
            .gte("created_at", since)
            .limit(FOLLOWED_LIMIT)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

  const actors = await loadEventActors(db, eventRows);

  const events: DigestEvent[] = eventRows.map((event) => {
    const actor = event.actor_id ? actors[event.actor_id] : undefined;
    return {
      kind: event.kind,
      actorId: event.actor_id,
      houseSlug: event.house_slug,
      payload: event.payload ?? {},
      createdAt: event.created_at,
      actorName:
        actor?.display_name ?? (actor?.handle ? `@${actor.handle}` : null),
    };
  });

  /* The member's own Calls, split by what the window did to them. Settlement
     writes settled_at into the call itself, so "settled since" is read off the
     stored claim rather than off the row's creation time. */
  const settledCalls: SettledCall[] = [];
  const openCalls: OpenCall[] = [];
  for (const raw of (callRows.data ?? []) as {
    call: unknown;
    created_at: string;
  }[]) {
    const call = normalizeCall(raw.call);
    if (!call) continue;
    if (call.verdict === "open") {
      openCalls.push({
        subject: callSubject(call),
        dueAt: callDueAt(raw.created_at, call.timeframe),
      });
      continue;
    }
    if (call.verdict !== "hit" && call.verdict !== "miss") continue;
    const settledAt = call.settled_at ? Date.parse(call.settled_at) : NaN;
    if (!Number.isFinite(settledAt) || settledAt < Date.parse(since)) continue;
    settledCalls.push({
      subject: callSubject(call),
      verdict: call.verdict,
      score: typeof call.score === "number" ? call.score : null,
    });
  }

  let points = 0;
  let glory = 0;
  const ledgerEntries = (ledgerRows.data ?? []) as {
    points_delta: number | null;
    glory_delta: number | null;
  }[];
  for (const entry of ledgerEntries) {
    points += entry.points_delta ?? 0;
    glory += entry.glory_delta ?? 0;
  }

  /* Ravens from members they follow, gated by the same authoritative check the
     feed uses rather than a second visibility rule written in SQL. */
  const followedAuthors = new Set<string>();
  let followedPosts = 0;
  for (const post of (followedRows.data ?? []) as {
    author_id: string;
    visibility: string | null;
    house_slug: string | null;
    mentions: string[] | null;
  }[]) {
    if (!canView(post, viewer)) continue;
    followedPosts += 1;
    followedAuthors.add(post.author_id);
  }

  const season = seasonRow.data as { name: string; ends_at: string } | null;

  const facts = assembleFacts({
    now,
    windowStart: since,
    viewer: {
      id: viewer.id ?? profile.id,
      followingIds: viewer.followingIds,
      houseSlug: viewer.houseSlug,
    },
    events,
    settledCalls,
    openCalls,
    ledger: { points, glory, entries: ledgerEntries.length },
    house: gloryStanding(
      (houseRows.data ?? []) as { slug: string; name: string; glory: number | null }[],
      viewer.houseSlug
    ),
    followedRavens: { posts: followedPosts, authors: followedAuthors.size },
    season: season ? { name: season.name, endsAt: season.ends_at } : null,
  });

  /* An empty realm produces an empty digest. The row is written so the next
     refresh is free, and it carries the window forward rather than consuming
     it, so a realm that produces one act a day accumulates into something worth
     saying instead of losing each quiet window one at a time. */
  if (!worthTelling(facts)) {
    await db.from("raven_digests").upsert({
      profile_id: profile.id,
      text: null,
      window_start: since,
      generated_at: now.toISOString(),
      facts: { v: 1, lines: facts.lines },
      dismissed_at: null,
    });
    return json({ digest: null });
  }

  /* Checked here and nowhere earlier, so a cache hit and a quiet window never
     consume an allowance they did not spend. A member past their cap is served
     whatever they were last told, which is the same honest nothing as a quiet
     realm rather than an error they cannot act on. */
  const perMember = await rateLimit(
    profileKey("raven-digest", profile.id),
    DIGEST_PER_MEMBER_DAILY,
    DIGEST_RATE_WINDOW_SECONDS
  );
  if (!perMember.ok) return json(payload(previous));
  const realm = await rateLimit(
    "raven-digest:realm",
    DIGEST_REALM_DAILY,
    DIGEST_RATE_WINDOW_SECONDS
  );
  if (!realm.ok) return json(payload(previous));

  let text: string | null = null;
  try {
    text = await withDeadline(
      heraldProse({
        model: MODEL_BRIEF,
        system: SYSTEM,
        user: `Here is everything the realm recorded for this member, in order of importance, and it is all you may use:\n\n${facts.lines.join("\n")}`,
        maxTokens: 220,
      }),
      DEADLINE_MODEL
    );
  } catch {
    /* A deadline, and nothing else reaches here: heraldProse swallows its own
       failures. Either way the Herald had nothing to say. */
    text = null;
  }
  if (!text) return json(payload(previous));

  const generatedAt = now.toISOString();
  await db.from("raven_digests").upsert({
    profile_id: profile.id,
    text,
    window_start: since,
    generated_at: generatedAt,
    /* Stored beside the paragraph, so any sentence a member disputes can be
       checked against the figures the realm actually counted. */
    facts: { v: 1, lines: facts.lines },
    dismissed_at: null,
  });

  return json({ digest: { text, at: generatedAt } });
}

/* Dismissal. A system card carries a primary action or a dismiss (design
   system, section 5), and a dismissal that does not outlive the page load is
   not a dismissal: the card would return on the next render. */
export async function DELETE(req: Request) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const profile = await getProfile(req);
  if (!profile) return json({ error: "unauthorized" }, 401);

  /* Scoped by profile even though the row is keyed on it, the same posture as
     every other write in the Herald's tables. */
  await db
    .from("raven_digests")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("profile_id", profile.id);

  return json({ ok: true });
}
