import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { champions } from "@/lib/game/champions";

const BATTLEFIELDS = new Set([
  "river-crossing",
  "castle-siege",
  "snow-valley",
  "dark-fortress",
]);

/* The exact number of foes the engine spawns per battlefield (mirrors
   FIELD_MODS in components/war/battle-engine.tsx). Kills reported above this
   are provably fabricated, so the server caps kills at the real foe count
   rather than the old blanket clamp of 200. */
const FOE_COUNTS: Record<string, number> = {
  "river-crossing": 26,
  "castle-siege": 30,
  "snow-valley": 24,
  "dark-fortress": 32,
};

const MAX_BATTLES_PER_HOUR = 12;
/* A full clear cannot plausibly happen faster than this, in wall clock or in
   reported duration. Keeps a 3 second "victory" from banking Glory. */
const MIN_VICTORY_SECONDS = 20;

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    action?: "start";
    battle_id?: string;
    champion?: string;
    battlefield?: string;
    result?: "victory" | "defeat";
    kills?: number;
    duration_s?: number;
  } | null;
  if (!body) return json({ error: "bad request" }, 400);

  /* START: the server opens a battle session, records the seed and the
     started_at wall clock, and hands the id back. The client seeds its
     deterministic sim from this and returns the id on finish so elapsed time
     can be verified and the reward can be settled exactly once. */
  if (body.action === "start") {
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const champion =
      body.champion && champions.some((c) => c.slug === body.champion)
        ? body.champion
        : null;
    const battlefield = BATTLEFIELDS.has(body.battlefield ?? "")
      ? (body.battlefield as string)
      : null;
    const { data: created } = await db
      .from("war_battles")
      .insert({
        profile_id: profile.id,
        champion_slug: champion,
        battlefield,
        seed,
        started_at: new Date().toISOString(),
        settled: false,
      })
      .select("id, seed")
      .single();
    if (!created) return json({ error: "unavailable" }, 503);
    return json({ ok: true, battle_id: created.id, seed: created.seed });
  }

  /* FINISH */
  if (!body.champion || !body.result) return json({ error: "bad request" }, 400);
  if (!champions.some((c) => c.slug === body.champion))
    return json({ error: "Unknown champion" }, 400);
  const battlefield = BATTLEFIELDS.has(body.battlefield ?? "")
    ? (body.battlefield as string)
    : "river-crossing";

  /* Server-authoritative rewards: the client reports the outcome, the server
     decides the prize inside hard caps and plausibility walls. Kills cannot
     exceed the number of foes the engine actually spawned. */
  const foeCount = FOE_COUNTS[battlefield] ?? 26;
  const kills = Math.max(0, Math.min(foeCount, Math.floor(body.kills ?? 0)));
  const duration = Math.max(0, Math.min(900, Math.floor(body.duration_s ?? 60)));
  const victory = body.result === "victory";
  if (victory && duration < MIN_VICTORY_SECONDS)
    return json({ error: "No battle is won in a blink. The heralds doubt you." }, 400);
  if (kills > duration * 2)
    return json({ error: "The heralds count blades, not boasts." }, 400);

  /* If a battle session id was issued at start, verify it. The row must belong
     to this profile, be unsettled, and the reported duration cannot exceed the
     real wall clock elapsed since start (a scripted client cannot claim a full
     150s battle in 2s). Finish without an id degrades to the stateless path so
     the current client keeps working. */
  let sessionId: string | null = null;
  if (body.battle_id) {
    const { data: row } = await db
      .from("war_battles")
      .select("id, started_at, settled")
      .eq("id", body.battle_id)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!row || row.settled)
      return json({ error: "That battle has already been settled" }, 409);
    const elapsedS = row.started_at
      ? (Date.now() - new Date(row.started_at).getTime()) / 1000
      : 0;
    if (duration > elapsedS + 5)
      return json({ error: "The heralds measure the sun; your tale runs long." }, 400);
    if (victory && elapsedS < MIN_VICTORY_SECONDS)
      return json({ error: "No battle is won in a blink. The heralds doubt you." }, 400);
    sessionId = row.id;
  }

  /* No more than a dozen settled battles an hour; even legends rest. */
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: recentBattles } = await db
    .from("war_battles")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .eq("settled", true)
    .gt("created_at", hourAgo);
  if ((recentBattles ?? 0) >= MAX_BATTLES_PER_HOUR)
    return json({ error: "Your soldiers need water and rest. Return within the hour." }, 429);

  const glory = Math.min(400, (victory ? 120 : 30) + kills * 2);

  let { data: state } = await db
    .from("war_state")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!state) {
    const { data: created } = await db
      .from("war_state")
      .insert({ profile_id: profile.id })
      .select("*")
      .single();
    state = created;
  }
  if (!state) return json({ error: "unavailable" }, 503);
  if (!state.unlocked_champions.includes(body.champion))
    return json({ error: "That champion is not yet sworn to you" }, 403);

  if (sessionId) {
    /* Single use settle: only the finish that flips settled from false to true
       banks the reward. A replayed finish for the same session changes zero
       rows and is rejected. */
    const { data: settled } = await db
      .from("war_battles")
      .update({
        champion_slug: body.champion,
        battlefield,
        result: body.result,
        glory_earned: glory,
        kills,
        duration_s: duration,
        settled: true,
      })
      .eq("id", sessionId)
      .eq("settled", false)
      .select("id");
    if (!settled || settled.length === 0)
      return json({ error: "That battle has already been settled" }, 409);
  } else {
    await db.from("war_battles").insert({
      profile_id: profile.id,
      champion_slug: body.champion,
      battlefield,
      result: body.result,
      glory_earned: glory,
      kills,
      duration_s: duration,
      settled: true,
    });
  }

  const totals = {
    battles: state.battles + 1,
    wins: state.wins + (victory ? 1 : 0),
    war_glory: state.war_glory + glory,
    gold: state.gold + (victory ? 40 : 10),
  };
  await db
    .from("war_state")
    .update({ ...totals, updated_at: new Date().toISOString() })
    .eq("profile_id", profile.id);
  await award(db, profile.id, {
    glory,
    reason: victory ? "war_victory" : "war_fought",
  });

  return json({
    ok: true,
    glory,
    gold: victory ? 40 : 10,
    battles: totals.battles,
    wins: totals.wins,
    war_glory: totals.war_glory,
  });
}

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);
  const { data: state } = await db
    .from("war_state")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();
  return json({
    state: state ?? {
      unlocked_champions: ["aeron-the-black", "ser-willas", "mira-stormborn"],
      gold: 200,
      war_glory: 0,
      battles: 0,
      wins: 0,
    },
  });
}
