import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse } from "../_admin";

/* The war ledger, read live from war_state and war_battles. No static game
   data is counted here: every number below is a real row in the realm. */
export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  const [battles, fighters, stateRows, resultRows, championRows] =
    await Promise.all([
      db.from("war_battles").select("id", { count: "exact", head: true }),
      db.from("war_state").select("profile_id", { count: "exact", head: true }),
      db.from("war_state").select("war_glory, wins, battles, gold"),
      db.from("war_battles").select("result").limit(20000),
      db.from("war_battles").select("champion_slug").limit(20000),
    ]);

  const warGlory = (stateRows.data ?? []).reduce(
    (s, r) => s + ((r as { war_glory: number | null }).war_glory ?? 0),
    0
  );
  const totalGold = (stateRows.data ?? []).reduce(
    (s, r) => s + ((r as { gold: number | null }).gold ?? 0),
    0
  );

  const resultCounts: Record<string, number> = {};
  for (const r of resultRows.data ?? []) {
    const key = (r as { result: string | null }).result ?? "unknown";
    resultCounts[key] = (resultCounts[key] ?? 0) + 1;
  }

  const championCounts: Record<string, number> = {};
  for (const r of championRows.data ?? []) {
    const key = (r as { champion_slug: string | null }).champion_slug;
    if (!key) continue;
    championCounts[key] = (championCounts[key] ?? 0) + 1;
  }
  const topChampions = Object.entries(championCounts)
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const { data: recent } = await db
    .from("war_battles")
    .select(
      "id, champion_slug, battlefield, result, glory_earned, kills, duration_s, created_at, profile:profile_id (handle, display_name)"
    )
    .order("created_at", { ascending: false })
    .limit(25);

  return json({
    stats: {
      battles: battles.count ?? 0,
      fighters: fighters.count ?? 0,
      warGlory,
      totalGold,
    },
    resultCounts,
    topChampions,
    recent: recent ?? [],
  });
}
