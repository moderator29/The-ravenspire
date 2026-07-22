import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { champions } from "@/lib/game/champions";

const UPGRADE_BASE_COST = 120;

async function getState(db: NonNullable<ReturnType<typeof adminClient>>, profileId: string) {
  let { data: state } = await db
    .from("war_state")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!state) {
    const { data: created } = await db
      .from("war_state")
      .insert({ profile_id: profileId })
      .select("*")
      .single();
    state = created;
  }
  return state;
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    action?: "daily" | "open_chest" | "upgrade";
    champion?: string;
  } | null;
  if (!body?.action) return json({ error: "bad request" }, 400);

  const state = await getState(db, profile.id);
  if (!state) return json({ error: "unavailable" }, 503);

  if (body.action === "daily") {
    const today = new Date().toISOString().slice(0, 10);
    if (state.last_daily === today)
      return json({ error: "Today's tribute is already claimed. Return with the dawn." }, 409);
    const gold = 60;
    const chest = new Date(today).getUTCDay() === 0 ? 1 : 0; /* chest on the seventh day */
    await db
      .from("war_state")
      .update({
        last_daily: today,
        gold: state.gold + gold,
        chests: state.chests + chest,
      })
      .eq("profile_id", profile.id);
    await award(db, profile.id, { glory: 10, reason: "war_daily" });
    return json({ ok: true, gold, chest, glory: 10 });
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
    await db
      .from("war_state")
      .update({
        chests: state.chests - 1,
        gold: state.gold + gold,
        unlocked_champions: unlocked
          ? [...state.unlocked_champions, unlocked]
          : state.unlocked_champions,
      })
      .eq("profile_id", profile.id);
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
    if (state.gold < cost)
      return json({ error: `The forge asks ${cost} gold; your purse holds ${state.gold}.` }, 409);
    mastery[champ.slug] = level + 1;
    await db
      .from("war_state")
      .update({ gold: state.gold - cost, mastery })
      .eq("profile_id", profile.id);
    return json({ ok: true, level: level + 1, cost });
  }

  return json({ error: "unknown action" }, 400);
}
