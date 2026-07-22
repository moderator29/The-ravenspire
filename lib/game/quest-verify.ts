import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Server-side quest verification, the anti-cheat layer for the earn economy.
   The quest POST no longer takes the client's word: a quest with a verifier
   here is only awarded when the member's REAL activity proves it in the current
   period. Quests with no reliable on-platform signal yet (rallies, being a
   House pillar) have no verifier and stay trusted for now; every point-heavy,
   easily-farmed quest (War, duels, streaks, a worthy raven) is checked against
   real rows.

   All bounds are UTC. Daily resets at 00:00 UTC, weekly on the ISO Monday,
   seasonal at the active season's start. */

export interface QuestBounds {
  dayStart: string;
  weekStart: string;
  seasonStart: string;
}

function dayStartIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

function weekStartIso(now: Date): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon = 0 ... Sun = 6
  d.setUTCDate(d.getUTCDate() - dayNum);
  return d.toISOString();
}

export async function computeBounds(
  db: SupabaseClient,
  now = new Date()
): Promise<QuestBounds> {
  let seasonStart = new Date(now.getTime() - 90 * 86400000).toISOString();
  try {
    const { data } = await db
      .from("seasons")
      .select("started_at")
      .eq("status", "active")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.started_at) seasonStart = data.started_at as string;
  } catch {
    /* fall back to a rolling 90-day window */
  }
  return {
    dayStart: dayStartIso(now),
    weekStart: weekStartIso(now),
    seasonStart,
  };
}

/* Await a head-count query (any supabase count builder is a thenable) and test
   the threshold. Typed loosely to sidestep the builder's heavy generics. */
async function atLeast(
  need: number,
  query: PromiseLike<unknown>
): Promise<boolean> {
  const res = (await query) as { count?: number | null };
  return (res.count ?? 0) >= need;
}

function headCount(db: SupabaseClient, table: string) {
  return db.from(table).select("*", { count: "exact", head: true });
}

type Verifier = (
  db: SupabaseClient,
  profileId: string,
  b: QuestBounds
) => Promise<boolean>;

/* Only quests with a trustworthy real signal appear here. Absent = trusted. */
const VERIFIERS: Record<string, Verifier> = {
  // Daily
  "send-a-worthy-raven": (db, pid, b) =>
    atLeast(
      1,
      headCount(db, "posts")
        .eq("author_id", pid)
        .eq("deleted", false)
        .gte("like_count", 3)
        .gte("created_at", b.dayStart)
    ),
  "cheer-the-crowd": (db, pid, b) =>
    atLeast(
      5,
      headCount(db, "reactions")
        .eq("profile_id", pid)
        .eq("subject_type", "post")
        .gte("created_at", b.dayStart)
    ),
  "welcome-a-newcomer": (db, pid, b) =>
    atLeast(
      1,
      headCount(db, "comments")
        .eq("author_id", pid)
        .eq("deleted", false)
        .gte("created_at", b.dayStart)
    ),
  "attend-live-court": (db, pid, b) =>
    atLeast(
      1,
      headCount(db, "room_participants")
        .eq("profile_id", pid)
        .gte("joined_at", b.dayStart)
    ),
  "enter-a-duel": (db, pid, b) =>
    atLeast(
      1,
      headCount(db, "duels")
        .or(`challenger_id.eq.${pid},opponent_id.eq.${pid}`)
        .gte("created_at", b.dayStart)
    ),
  "vote-in-a-duel": (db, pid, b) =>
    atLeast(
      1,
      headCount(db, "duel_votes")
        .eq("voter_id", pid)
        .gte("created_at", b.dayStart)
    ),
  "war-skirmish": (db, pid, b) =>
    atLeast(
      1,
      headCount(db, "war_battles")
        .eq("profile_id", pid)
        .gte("created_at", b.dayStart)
    ),

  // Weekly
  "win-a-duel-of-wit": (db, pid, b) =>
    atLeast(
      1,
      headCount(db, "duels")
        .eq("winner_id", pid)
        .gte("created_at", b.weekStart)
    ),
  "seven-day-streak": async (db, pid) => {
    const { data } = await db
      .from("profiles")
      .select("streak")
      .eq("id", pid)
      .maybeSingle();
    return ((data?.streak as number | null) ?? 0) >= 7;
  },
  "war-campaign": (db, pid, b) =>
    atLeast(
      5,
      headCount(db, "war_battles")
        .eq("profile_id", pid)
        .gte("created_at", b.weekStart)
    ),
  "host-a-room": async (db, pid, b) => {
    const { data: rooms } = await db
      .from("rooms")
      .select("id")
      .eq("host_id", pid)
      .gte("created_at", b.weekStart);
    const ids = (rooms ?? []).map((r) => r.id as string);
    if (ids.length === 0) return false;
    // At least five guests (non-host participants) across rooms hosted this week.
    return atLeast(
      5,
      headCount(db, "room_participants").in("room_id", ids).neq("profile_id", pid)
    );
  },

  // Seasonal
  "duel-champion": (db, pid, b) =>
    atLeast(
      10,
      headCount(db, "duels")
        .eq("winner_id", pid)
        .gte("created_at", b.seasonStart)
    ),
  "grand-war-veteran": (db, pid, b) =>
    atLeast(
      20,
      headCount(db, "war_battles")
        .eq("profile_id", pid)
        .gte("created_at", b.seasonStart)
    ),
  "season-of-courts": (db, pid, b) =>
    atLeast(
      12,
      headCount(db, "room_participants")
        .eq("profile_id", pid)
        .gte("joined_at", b.seasonStart)
    ),
};

/* True if the quest may be awarded. Quests with no verifier are trusted (no
   reliable signal yet) and return true. A verifier failure returns false. */
export async function verifyQuest(
  db: SupabaseClient,
  profileId: string,
  questSlug: string,
  bounds: QuestBounds
): Promise<boolean> {
  const verifier = VERIFIERS[questSlug];
  if (!verifier) return true;
  try {
    return await verifier(db, profileId, bounds);
  } catch {
    // On a verification error, do not award (fail closed for verified quests).
    return false;
  }
}

export function hasVerifier(questSlug: string): boolean {
  return questSlug in VERIFIERS;
}
