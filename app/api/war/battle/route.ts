import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { DAILY_WAR_GOLD_CAP } from "@/lib/economy/allowances";
import { champions } from "@/lib/game/champions";
import { warState } from "@/lib/game/war-state";

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

  /* The battle session id is mandatory. The row must belong to this profile,
     be unsettled, and the reported duration cannot exceed the real wall clock
     elapsed since start (a scripted client cannot claim a full 150s battle in
     2s). The old stateless fallback let a client that never called start
     simply declare victories, which made every wall-clock check above it
     decorative; a finish with no id is now refused outright. */
  if (!body.battle_id)
    return json(
      { error: "No battle was started. Begin one before you claim it." },
      400
    );
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
  const sessionId = row.id;

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

  const state = await warState(db, profile.id);
  if (!state) return json({ error: "unavailable" }, 503);
  if (!state.unlocked_champions.includes(body.champion))
    return json({ error: "That champion is not yet sworn to you" }, 403);

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

  const gold = victory ? 40 : 10;
  /* B6: one statement banks the battle and hands back the running totals, so
     two battles settling together cannot each write over the other's, and the
     numbers reported are the true post-battle standing rather than the values
     read before the write. The capped variant also enforces the daily gold
     ceiling inside the same row lock, so gold gets the treatment Glory already
     has and two settles racing at the ceiling cannot both spend the room.

     A1: THE ERROR IS READ, AND THE CLAIM IS RELEASED WHEN IT FAILS. This call
     used to destructure { data } alone. If the capped RPC was not migrated the
     call answered 42883 (undefined function), data came back null, and every
     number below fell through to its `??` and reported a battle that war_state
     never recorded: fabricated totals, no gold, no Glory, and the row already
     flipped to settled so the member could never replay it. Now: the older
     war_settle_battle (20260811120100, four arguments, no gold cap) is tried
     when the capped one is simply absent, and when neither can settle, the
     settled flag is put back and the request refuses honestly. The guarded
     flip above stays where it is because it is the claim that makes settling
     single use; releasing it is what makes a failed claim retryable. */
  type SettleTotals = {
    battles: number;
    wins: number;
    war_glory: number;
    gold: number;
    gold_granted: number;
  };
  const firstRow = (rows: unknown): SettleTotals | null => {
    const row = Array.isArray(rows) ? rows[0] : rows;
    return (row ?? null) as SettleTotals | null;
  };
  /* An RPC Postgres has never heard of, rather than one that ran and failed. */
  const rpcMissing = (code: string | undefined) =>
    code === "42883" || code === "42P01";

  const capped = await db.rpc("war_settle_battle_capped", {
    p_profile_id: profile.id,
    p_victory: victory,
    p_glory: glory,
    p_gold: gold,
    p_daily_gold_cap: DAILY_WAR_GOLD_CAP,
  });
  let totals = capped.error ? null : firstRow(capped.data);
  if (capped.error && rpcMissing(capped.error.code)) {
    /* The uncapped ancestor. It banks the battle and returns four columns, so
       the day's gold ceiling is not enforced on this path; that is a smaller
       wrong than telling a member they won a battle the realm never recorded,
       and it disappears the moment the migration lands. */
    const legacy = await db.rpc("war_settle_battle", {
      p_profile_id: profile.id,
      p_victory: victory,
      p_glory: glory,
      p_gold: gold,
    });
    const legacyRow = legacy.error
      ? null
      : (firstRow(legacy.data) as Omit<SettleTotals, "gold_granted"> | null);
    totals = legacyRow ? { ...legacyRow, gold_granted: gold } : null;
  }

  if (!totals) {
    /* Nothing was banked. Release the claim so the battle can be finished
       again, and say so rather than reporting numbers off the pre-battle read. */
    await db
      .from("war_battles")
      .update({ settled: false })
      .eq("id", sessionId)
      .eq("settled", true);
    return json(
      {
        error:
          "The heralds could not enter your battle in the rolls. Nothing was banked; claim it again shortly.",
      },
      503
    );
  }

  /* Categorised, so it draws on the daily War allowance rather than minting
     Glory without limit. Twelve settled battles an hour against a 400 Glory
     ceiling per battle used to be roughly 115,000 Glory a day from one member,
     and Glory decides the Clash, the Throne and the Season. */
  const granted = await award(db, profile.id, {
    glory,
    reason: victory ? "war_victory" : "war_fought",
    category: "war",
  });

  return json({
    ok: true,
    /* What was actually banked, not what the battle was worth. A member who
       has spent the day's allowance is told so rather than shown a number the
       ledger did not write. Gold reports the same way: the granted figure,
       which the ceiling may have trimmed. */
    glory: granted.glory,
    glory_capped: granted.capped,
    /* Read straight off the settle now, with no fallback to the standing that
       was read before the write: a settle that did not happen refuses above
       rather than reaching this and guessing. */
    gold: totals.gold_granted,
    gold_capped: totals.gold_granted < gold,
    battles: totals.battles,
    wins: totals.wins,
    war_glory: totals.war_glory,
  });
}

/* The member's standing, created from the table's own defaults on first read.
   This used to answer a member with no row yet from a hand-written object that
   listed the champions and the gold and forgot `chests` and `mastery`, so a
   new member was told "No chests" while the database was already granting them
   one. The row is the only honest answer, so the row is what is made. */
export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);
  const state = await warState(db, profile.id);
  if (!state) return json({ error: "unavailable" }, 503);
  return json({ state });
}
