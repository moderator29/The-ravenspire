import { after } from "next/server";
import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { emit } from "@/lib/realm/events";
import { getFlag } from "@/lib/flags";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { quests, type Quest } from "@/lib/game/quests";
import { computeBounds, verifyQuest } from "@/lib/game/quest-verify";
import type { SupabaseClient } from "@supabase/supabase-js";

/* SEALED, and not deleted.
 *
 * The Throne's mechanics, quests and duels, have no caller anywhere in the
 * product: no page, no component, no library reaches either route. What they
 * do have is an economy. This one awards points and Glory, Glory decides the
 * Clash and the Throne and the Season, and Season standing is what converts.
 * A live, unwatched, unlinked route that mints the convertible currency is the
 * worst shape a surface can have: nobody is looking at it and everybody can
 * reach it.
 *
 * Deleting it would be the wrong answer too. The V2 plan dissolves these
 * mechanics into the Ravenry rather than restoring the Throne as a
 * destination, and the verification work in lib/game/quest-verify.ts is the
 * hard half of that. So the code stays and the door closes.
 *
 * throne_mechanics_live is the door. It follows the same posture as every
 * other chapter flag: FAIL CLOSED. There is no row for it in realm_flags and
 * that is deliberate, because getFlag reads an unknown key, a missing table
 * and an unreachable database all as false. The flag needs no migration to
 * seal, only a row to open, and until somebody writes that row on purpose
 * these routes answer as though they do not exist.
 */
const THRONE_FLAG = "throne_mechanics_live";

/* What a sealed route answers with. Not 423 (sealed until launch), which tells
   a caller there is something here worth waiting for: while the mechanics have
   no surface, the honest answer is that this is not a thing the realm offers. */
function sealed() {
  return json({ error: "not found" }, 404);
}

/* The period key a quest completion is bucketed under, derived from cadence:
   daily quests reset every day, weekly quests every ISO week, seasonal quests
   once per season. Storing the wrong key (as the old code did, using today's
   date for every cadence) let weekly and seasonal quests be reclaimed daily. */
function dailyPeriod(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function isoWeekPeriod(now: Date): string {
  // ISO 8601 week: weeks start Monday, week 1 holds the year's first Thursday.
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon = 0 ... Sun = 6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // shift to the week's Thursday
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/* The current season id, e.g. "s1". Falls back to a fixed id if the seasons
   table cannot be read, so seasonal quests never silently collapse to daily. */
async function seasonPeriod(db: SupabaseClient): Promise<string> {
  const { data } = await db
    .from("seasons")
    .select("id")
    .eq("status", "active")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return `s${data?.id ?? 1}`;
}

async function periodFor(
  db: SupabaseClient,
  cadence: Quest["cadence"],
  now: Date
): Promise<string> {
  if (cadence === "weekly") return isoWeekPeriod(now);
  if (cadence === "seasonal") return seasonPeriod(db);
  return dailyPeriod(now);
}

export async function GET(req: Request) {
  if (!(await getFlag(THRONE_FLAG))) return sealed();
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* Return completions for the current period of each cadence, keyed
     explicitly rather than with a gte(today) filter that was blind to
     cadence and dropped weekly/seasonal completions after midnight. */
  const now = new Date();
  const periods = [
    dailyPeriod(now),
    isoWeekPeriod(now),
    await seasonPeriod(db),
  ];
  const { data } = await db
    .from("user_quests")
    .select("quest_slug, period")
    .eq("profile_id", profile.id)
    .in("period", periods);
  return json({ completed: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await getFlag(THRONE_FLAG))) return sealed();
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded) return json({ error: "Finish onboarding first" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* The second lock, for the day the flag is opened. There are eighteen quests
     across three cadences, so a member with a full board claims eighteen times
     and never sixty; anything past that is a loop, and this route awards the
     convertible currency. */
  const rl = await rateLimit(profileKey("quests", profile.id), 60, 3600);
  if (!rl.ok)
    return json(
      {
        error: "You have claimed enough for one hour. Return shortly.",
        retryAfter: rl.retryAfter,
      },
      429
    );

  const body = (await req.json().catch(() => null)) as { quest?: string } | null;
  const quest = quests.find((q) => q.slug === body?.quest);
  if (!quest) return json({ error: "Unknown quest" }, 400);

  /* Anti-cheat: verify the member's real activity actually completed this quest
     in the current period before awarding anything. Quests without a reliable
     on-platform signal yet stay trusted (verifyQuest returns true for them). */
  const bounds = await computeBounds(db, new Date());
  const done = await verifyQuest(db, profile.id, quest.slug, bounds);
  if (!done) {
    return json(
      { error: "You have not completed this quest yet. Do the deed, then claim." },
      403
    );
  }

  /* Period is derived from the quest's own cadence, so a weekly or seasonal
     quest occupies a single row for the whole week or season and cannot be
     reclaimed each day. Uniqueness on (profile_id, quest_slug, period) then
     rejects a second claim inside the same period. */
  const period = await periodFor(db, quest.cadence, new Date());
  const { error } = await db.from("user_quests").insert({
    profile_id: profile.id,
    quest_slug: quest.slug,
    period,
  });
  if (error) return json({ error: "Already completed for this period" }, 409);

  const granted = await award(db, profile.id, {
    points: quest.points,
    glory: quest.glory,
    reason: `quest_${quest.slug}`,
    category: "social",
  });

  /* Quests stop being a private checklist and become a strip the realm can see.
     Subject is the quest and its period together, so a weekly quest completed
     in two different weeks is two events while a retried request is one. */
  after(async () => {
    await emit(db, {
      kind: "quest.completed",
      actorId: profile.id,
      subjectType: "quest",
      subjectId: `${quest.slug}:${period}`,
      houseSlug: profile.house_slug,
      payload: {
        v: 1,
        quest_slug: quest.slug,
        name: quest.name,
        cadence: quest.cadence,
        period,
        points: granted.points,
        glory: granted.glory,
      },
    });
  });

  /* Report what was actually granted, not what the quest is worth, so a member
     who has spent the day's social allowance is told the truth. */
  return json({
    ok: true,
    glory: granted.glory,
    points: granted.points,
    capped: granted.capped,
  });
}
