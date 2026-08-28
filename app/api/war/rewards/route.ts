import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { champions } from "@/lib/game/champions";
import { warState } from "@/lib/game/war-state";
import { profileKey, rateLimit } from "@/lib/rate-limit";

const UPGRADE_BASE_COST = 120;

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* The RPCs below are each atomic and self-limiting (one daily claim, a
     chest per chest held, gold per upgrade), so this ceiling only bounds how
     hard a script can hammer them. A member claims, opens and upgrades a few
     times an evening. */
  const rl = await rateLimit(profileKey("war_rewards", profile.id), 60, 3600);
  if (!rl.ok)
    return json(
      { error: "The quartermaster needs a moment. Return shortly.", retryAfter: rl.retryAfter },
      429
    );

  const body = (await req.json().catch(() => null)) as {
    action?: "daily" | "open_chest" | "upgrade";
    champion?: string;
  } | null;
  if (!body?.action) return json({ error: "bad request" }, 400);

  const state = await warState(db, profile.id);
  if (!state) return json({ error: "unavailable" }, 503);

  /* D2: every settle below is an RPC whose false answer is a real refusal a
     member has to believe ("already claimed today", "no chests to open", "your
     purse is short"). All three used to read { data } alone, so an RPC that
     was never migrated, or a call that errored, came back as data === null,
     which is not true, which rendered as that same permanent-looking refusal.
     A member would be told they had already claimed a tribute they had never
     been paid. An error is not a false: it is the quartermaster being absent,
     and it answers 503 so the surface can say "come back" and mean it. */
  const unreachable = () =>
    json(
      { error: "The quartermaster is not at his post. Return shortly." },
      503
    );

  if (body.action === "daily") {
    const today = new Date().toISOString().slice(0, 10);
    const gold = 60;
    const chest = new Date(today).getUTCDay() === 0 ? 1 : 0; /* chest on the seventh day */
    /* B6: the "already claimed today" test lives inside the update, so two
       taps arriving together cannot both pass a check the other is about to
       invalidate. Only the call that actually paid gets true back. */
    const claim = await db.rpc("war_claim_daily", {
      p_profile_id: profile.id,
      p_today: today,
      p_gold: gold,
      p_chests: chest,
    });
    if (claim.error) return unreachable();
    if (claim.data !== true)
      return json({ error: "Today's tribute is already claimed. Return with the dawn." }, 409);
    /* The daily muster draws on the same War allowance as a battle does. Ten
       Glory will never reach the ceiling on its own, and it is categorised
       anyway so that the day's total is the whole day's War, not the part of
       it somebody remembered to count. */
    const granted = await award(db, profile.id, {
      glory: 10,
      reason: "war_daily",
      category: "war",
    });
    return json({ ok: true, gold, chest, glory: granted.glory });
  }

  if (body.action === "open_chest") {
    if (state.chests < 1)
      return json({ error: "No relic chests to open. Battles and devotion earn them." }, 409);
    /* The chest speaks: gold always, a champion when fortune smiles. */
    const roll = Math.random();
    const gold = 80 + Math.floor(Math.random() * 120);
    let unlocked: string | null = null;
    if (roll > 0.65) {
      const locked = champions.filter(
        (c) => c.art && !state.unlocked_champions.includes(c.slug)
      );
      if (locked.length) {
        const pick = locked[Math.floor(Math.random() * locked.length)];
        unlocked = pick.slug;
      }
    }
    /* B6: the purse test is the update's WHERE clause. Two opens racing on a
       single chest used to both pass the check above and both pay out. */
    const opened = await db.rpc("war_open_chest", {
      p_profile_id: profile.id,
      p_gold: gold,
      p_unlock: unlocked,
    });
    if (opened.error) return unreachable();
    if (opened.data !== true)
      return json({ error: "No relic chests to open. Battles and devotion earn them." }, 409);
    return json({ ok: true, gold, unlocked });
  }

  if (body.action === "upgrade") {
    const champ = champions.find((c) => c.slug === body.champion);
    if (!champ) return json({ error: "Unknown champion" }, 400);
    if (!state.unlocked_champions.includes(champ.slug))
      return json({ error: "That champion is not yet sworn to you" }, 403);
    const mastery = (state.mastery ?? {}) as Record<string, number>;
    const level = mastery[champ.slug] ?? 0;
    if (level >= 10)
      return json({ error: "Mastery stands at its peak" }, 409);
    const cost = UPGRADE_BASE_COST + level * 60;
    mastery[champ.slug] = level + 1;
    /* B6: the purse test and the spend are one statement, so two upgrades
       racing on the same gold cannot both be forged. */
    const spent = await db.rpc("war_spend_gold", {
      p_profile_id: profile.id,
      p_cost: cost,
      p_mastery: mastery,
    });
    if (spent.error) return unreachable();
    if (spent.data !== true)
      return json({ error: `The forge asks ${cost} gold; your purse holds ${state.gold}.` }, 409);
    return json({ ok: true, level: level + 1, cost });
  }

  return json({ error: "unknown action" }, 400);
}
