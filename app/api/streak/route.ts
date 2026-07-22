import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* The realm's retention spine: a daily streak. GET both advances the streak for
   today (idempotent, once per UTC day) and returns it, so simply opening the
   app on consecutive days keeps the flame alive. A missed day resets to 1. */

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const today = utcDay();
  const yesterday = utcDay(new Date(Date.now() - 86_400_000));

  const { data: row } = await db
    .from("profiles")
    .select("streak, streak_day")
    .eq("id", profile.id)
    .maybeSingle();

  const current = (row?.streak as number | null) ?? 0;
  const lastDay = (row?.streak_day as string | null) ?? null;

  let streak = current;
  let extendedToday = false;

  if (lastDay === today) {
    // Already counted today; nothing to do.
    streak = current;
  } else if (lastDay === yesterday) {
    streak = current + 1;
    extendedToday = true;
  } else {
    // First ever, or a gap: start fresh.
    streak = 1;
    extendedToday = true;
  }

  if (extendedToday) {
    await db
      .from("profiles")
      .update({ streak, streak_day: today })
      .eq("id", profile.id);
  }

  return json({ streak, extendedToday, countedForDay: today });
}
