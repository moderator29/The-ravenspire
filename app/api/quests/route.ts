import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { quests, type Quest } from "@/lib/game/quests";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded) return json({ error: "Finish onboarding first" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as { quest?: string } | null;
  const quest = quests.find((q) => q.slug === body?.quest);
  if (!quest) return json({ error: "Unknown quest" }, 400);

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

  await award(db, profile.id, {
    points: quest.points,
    glory: quest.glory,
    reason: `quest_${quest.slug}`,
  });
  return json({ ok: true, glory: quest.glory, points: quest.points });
}
