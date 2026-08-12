import { json, requireProfile } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadSeasonWindow } from "@/lib/houses/oath";
import { recomputeSeason } from "@/lib/houses/scoring";

/* POST /api/houses/recompute
 *
 * Resolve the House standings and rotate the seasonal leadership.
 *
 * Two callers, one path. The cron hits it with the shared secret on the same
 * schedule the verdict job runs, so standings resolve right after the Calls
 * that moved them; an admin can trigger it by hand when a season boundary or a
 * correction needs to land immediately.
 *
 * Idempotent by construction. Everything is derived from points_ledger and the
 * oath history, so a second run in the same minute writes the same rows and
 * raises no second event. */

export const dynamic = "force-dynamic";

async function authorize(req: Request): Promise<Response | null> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return null;

  /* The only other caller is a steward pressing the button in admin. There is
     deliberately no unauthenticated fallback when CRON_SECRET is unset: an
     open recompute would let anyone rewrite the standings cache. */
  const profile = await requireProfile(req);
  if (profile?.is_admin) return null;

  return json({ error: "forbidden" }, 403);
}

export async function POST(req: Request) {
  const denied = await authorize(req);
  if (denied) return denied;

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const window = await loadSeasonWindow(db);
  const season = window.latest;
  if (!season)
    return json({ ok: true, recomputed: false, reason: "no_season" });

  const result = await recomputeSeason(db, season);

  return json({
    ok: true,
    recomputed: true,
    season_id: result.seasonId,
    standings: result.standings.map((s) => ({
      slug: s.slug,
      rank: s.rank,
      score: s.score,
      mean: Number(s.mean.toFixed(2)),
      contributors: s.contributorCount,
    })),
    roles: result.roles,
    overtakes: result.overtakes,
  });
}

/* GET is the same work, so a cron platform that can only issue GET still
   drives it. Same authorization either way. */
export async function GET(req: Request) {
  return POST(req);
}
