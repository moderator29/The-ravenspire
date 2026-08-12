import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { json } from "@/lib/auth/server";
import { normalizeCall, type CallCategory, type CallData } from "@/lib/calls/types";
import {
  RANKED_MINIMUM,
  calibration,
  shrunkAccuracy,
  streaks,
  type CalibrationPoint,
} from "@/lib/calls/analytics";

/* The prediction profile (V2 sections 9.6 and 9.8).

   The realm computed accuracy in one place, over a fifty post window, which is
   finding B3. This reads every Call a member has ever settled and computes the
   record the caller board already ranks by, so the number on a member's profile
   and the number on the board can never disagree.

   Two figures that are deliberately not the same thing:

     Renown        monotonic, permanent, never falls. A legacy.
     Season Rating signed, resets each season, carries the real stakes.

   Both are read from the profile, where the settlement job put them. Nothing
   here computes a reward, and nothing here shows a projection as if it were
   banked.

   Real data only. A member with nothing settled gets zeroes and an honest
   empty state, never a flattering estimate. */

export const dynamic = "force-dynamic";

interface CallRow {
  id: string;
  body: string;
  call: CallData | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const handle = new URL(req.url).searchParams.get("handle")?.trim();
  if (!handle) return json({ error: "bad request" }, 400);

  const { data: profile } = await db
    .from("profiles")
    .select(
      "id, handle, display_name, avatar_url, house_slug, tier, renown, season_rating"
    )
    .eq("handle", handle)
    .maybeSingle();

  if (!profile) return json({ error: "not found" }, 404);

  const { data, error } = await db
    .from("posts")
    .select("id, body, call, created_at")
    .eq("author_id", profile.id)
    .eq("kind", "call")
    .eq("deleted", false)
    .order("created_at", { ascending: true })
    .limit(2000);

  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []) as unknown as CallRow[];

  let hits = 0;
  let total = 0;
  let scoreSum = 0;
  let scored = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let open = 0;

  const settledForStreak: { score?: number | null; hit: boolean }[] = [];
  const points: CalibrationPoint[] = [];
  const byCategory = new Map<CallCategory, { hits: number; total: number }>();

  for (const row of rows) {
    const call = normalizeCall(row.call);
    if (!call) continue;

    if (call.verdict === "open") {
      open += 1;
      continue;
    }
    if (call.verdict !== "hit" && call.verdict !== "miss") continue;

    const hit = call.verdict === "hit";
    total += 1;
    if (hit) hits += 1;
    settledForStreak.push({ score: call.score ?? null, hit });

    if (typeof call.score === "number" && call.score_basis !== "legacy") {
      scoreSum += call.score;
      scored += 1;
    }
    if (typeof call.confidence === "number") {
      confidenceSum += call.confidence;
      confidenceCount += 1;
      points.push({ confidence: call.confidence, hit });
    }

    const category = (call.category ?? "markets") as CallCategory;
    const entry = byCategory.get(category) ?? { hits: 0, total: 0 };
    entry.total += 1;
    if (hit) entry.hits += 1;
    byCategory.set(category, entry);
  }

  const run = streaks(settledForStreak);

  /* The history, newest first, carrying only what a card needs. */
  const history = [...rows]
    .reverse()
    .slice(0, 40)
    .map((row) => {
      const call = normalizeCall(row.call);
      return {
        id: row.id,
        created_at: row.created_at,
        body: row.body,
        call,
      };
    })
    .filter((entry) => entry.call !== null);

  return json({
    caller: {
      handle: profile.handle,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      house_slug: profile.house_slug,
      tier: profile.tier,
      /* Monotonic and permanent. */
      renown: profile.renown ?? 0,
      /* Signed, and reset each season. */
      season_rating: profile.season_rating ?? 0,
    },
    record: {
      total,
      hits,
      misses: total - hits,
      open,
      hit_rate: total > 0 ? hits / total : 0,
      /* What the caller board ranks by. Three lucky Calls divided by 23. */
      score: shrunkAccuracy(hits, total),
      /* Medals are gated here, and the profile says so rather than implying a
         short record is a proven one. */
      ranked: total >= RANKED_MINIMUM,
      ranked_minimum: RANKED_MINIMUM,
      mean_score: scored > 0 ? scoreSum / scored : null,
      scored,
      mean_confidence:
        confidenceCount > 0 ? confidenceSum / confidenceCount : null,
      streak: run.current,
      best_streak: run.best,
      on_fire: run.onFire,
    },
    calibration: calibration(points),
    categories: [...byCategory.entries()]
      .map(([category, entry]) => ({
        category,
        hits: entry.hits,
        total: entry.total,
        hit_rate: entry.total > 0 ? entry.hits / entry.total : 0,
      }))
      .sort((a, b) => b.total - a.total),
    history,
  });
}
